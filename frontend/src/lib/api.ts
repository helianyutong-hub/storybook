// 后端接口封装（认证、故事历史、用户偏好）
import apiClient from './api-client';
import { Story, StoryParams, UserPreferences, AuthUser, StorySummary, VoiceRole } from '@/types/story';

/* ========== 音频 URL 本地缓存（localStorage）========== */
const AUDIO_CACHE_PREFIX = 'sb_audio_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时

/** 从缓存读取某故事的音频 URLs */
export function getCachedAudioUrls(storyId: string): (string | null)[] | null {
  try {
    const raw = localStorage.getItem(AUDIO_CACHE_PREFIX + storyId);
    if (!raw) return null;
    const { urls, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(AUDIO_CACHE_PREFIX + storyId);
      return null;
    }
    return Array.isArray(urls) ? urls : null;
  } catch {
    return null;
  }
}

/** 写入音频 URL 缓存 */
export function setCachedAudioUrls(storyId: string, urls: (string | null)[]): void {
  try {
    localStorage.setItem(AUDIO_CACHE_PREFIX + storyId, JSON.stringify({ urls, ts: Date.now() }));
  } catch {
    // localStorage 可能满了，静默失败
  }
}

/** 清除某故事的音频缓存（重新生成文案时调用） */
export function invalidateAudioCache(storyId: string): void {
  localStorage.removeItem(AUDIO_CACHE_PREFIX + storyId);
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export async function login(method: 'phone' | 'wechat', identifier: string, name?: string): Promise<LoginResult> {
  try {
    const { data } = await apiClient.post('/auth/login', { method, identifier, name });
    return data;
  } catch {
    // 后端不可用时（纯静态部署 / 本地无后端），走本地模拟登录
    const displayName = name ?? (method === 'phone' ? `用户${identifier.slice(-4)}` : identifier);
    return {
      token: `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      user: { id: `local_${identifier}`, name: displayName, method },
    };
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const { data } = await apiClient.get('/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export async function listStories(): Promise<StorySummary[]> {
  const { data } = await apiClient.get('/stories');
  return data.stories ?? [];
}

export async function saveStory(story: Story): Promise<{ id: string }> {
  const { data } = await apiClient.post('/stories', { story });
  return data;
}

export async function fetchStory(id: string): Promise<Story | null> {
  try {
    const { data } = await apiClient.get(`/stories/${id}`);
    return data.story;
  } catch {
    return null;
  }
}

export async function deleteStory(id: string): Promise<void> {
  await apiClient.delete(`/stories/${id}`);
}

/** 按需为某段文本生成语音，返回音频 URL（失败返回 null）。lang: 'zh' | 'en'；voice: 音色 */
export async function ensureAudioUrl(text: string, lang: 'zh' | 'en' = 'zh', voice?: VoiceRole): Promise<string | null> {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  try {
    const { data } = await retryRequest(() =>
      apiClient.post('/tts', { text, lang: locale, voice: voice ?? 'mommy' })
    );
    return data?.url ?? null;
  } catch {
    return null;
  }
}

/** 云端语音生成进度 */
export interface AudioProgress {
  done: number;
  total: number;
}

/** 让后端为若干页文本启动一次语音生成任务（后端异步执行，返回任务 id） */
async function startStoryAudioJob(texts: string[], lang: 'zh' | 'en', voice?: VoiceRole): Promise<string> {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const { data } = await retryRequest(() =>
    apiClient.post('/tts/story', {
      pages: texts.map((text) => ({ text })),
      lang: locale,
      voice: voice ?? 'mommy',
    })
  );
  return data?.jobId;
}

/**
 * 带重试的请求封装——处理 Render 免费层冷启动（休眠后首次请求可能返回 405/502/503）。
 * 最多重试 3 次，间隔递增（2s → 4s → 8s）。
 */
async function retryRequest<T>(fn: () => Promise<{ data: T }>, maxRetries = 3): Promise<{ data: T }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 仅对服务端错误和 405 重试（4xx 客户端错误不重试，除了 405）
      if (attempt < maxRetries && (!status || status >= 500 || status === 405)) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

/** 轮询生成任务直到结束，期间回调进度；返回每页音频 URL（失败的页为 null） */
async function waitStoryAudioJob(
  jobId: string,
  onProgress?: (p: AudioProgress) => void,
): Promise<(string | null)[]> {
  const maxAttempts = 300; // 约 6 分钟上限，覆盖弱网场景
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await apiClient.get(`/tts/story/${jobId}`);
      onProgress?.({ done: Number(data?.done ?? 0), total: Number(data?.total ?? 0) });
      if (data?.status === 'done') {
        return Array.isArray(data?.urls) ? data.urls : [];
      }
    } catch {
      // 轮询时单次失败不中断，等下次重试
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error('语音生成超时');
}

/**
 * 确保故事每一页都有云端语音：
 * 1. 先从 localStorage 缓存读取（秒开）
 * 2. 缓存缺失时才请求后端
 * 3. 生成结果自动写入缓存
 * 返回的数组长度等于页数，失败的页为 null。
 */
export async function ensureStoryAudioUrls(
  story: Story,
  onProgress?: (p: AudioProgress) => void,
): Promise<(string | null)[]> {
  const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';
  const total = story.pages.length;

  // 1. 先从缓存读取（可能上次已经生成过了）
  const cached = getCachedAudioUrls(story.id);
  const urls: (string | null)[] = new Array(total).fill(null);
  if (cached && cached.length >= total) {
    for (let i = 0; i < total; i++) urls[i] = cached[i] ?? null;
    // 检查是否全部有值，如果是就直接返回（秒开）
    if (urls.every(Boolean)) {
      onProgress?.({ done: total, total });
      return urls;
    }
    // 部分有值：后续只补缺失的页
  } else {
    // 没有缓存：用 story 自带的 audioUrls 作为初始值
    const existing = story.audioUrls ?? [];
    for (let i = 0; i < Math.min(existing.length, total); i++) {
      urls[i] = existing[i] ?? null;
    }
  }

  // 2. 计算还需要生成的页
  const missing: number[] = [];
  urls.forEach((u, i) => { if (!u) missing.push(i); });
  if (missing.length === 0) {
    onProgress?.({ done: total, total });
    return urls;
  }

  // 3. 只为缺失的页发起后端请求（最多 1 轮，配合重试机制）
  try {
    const jobId = await startStoryAudioJob(
      missing.map((i) => story.pages[i].text),
      lang,
      story.params.voice,
    );
    const generated = await waitStoryAudioJob(jobId, (p) => {
      onProgress?.({ done: total - missing.length + p.done, total });
    });
    missing.forEach((pageIndex, k) => {
      urls[pageIndex] = generated[k] ?? null;
    });
  } catch (err) {
    // 生成失败不抛错，返回部分结果
    console.warn('部分语音生成失败:', err);
  }

  // 4. 写入缓存（无论成功与否都缓存，避免重复请求失败的页）
  setCachedAudioUrls(story.id, urls);
  return urls;
}

export async function getPreferences(): Promise<UserPreferences | null> {
  try {
    const { data } = await apiClient.get('/preferences');
    return data.preferences;
  } catch {
    return null;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await apiClient.put('/preferences', { preferences: prefs });
}

/** 大模型故事生成结果 */
export interface LlmStoryResult {
  /** 后端是否配置了 LLM（未配置则前端回退模板引擎） */
  enabled: boolean;
  /** 调用失败或模型返回异常时建议回退 */
  fallback?: boolean;
  title?: string;
  pages?: { text: string; scene: string }[];
}

/**
 * 请求后端用大模型生成完整情节的故事（需求 1 + 需求 4 动态页数）。
 * 后端未配置 LLM 时返回 { enabled: false }；调用异常返回 { enabled: false }。
 */
export async function generateStoryViaLLM(params: StoryParams): Promise<LlmStoryResult> {
  try {
    const { data } = await apiClient.post('/story-gen', {
      childName: params.childName,
      characters: params.characters,
      tone: params.tone,
      lang: params.lang,
      duration: params.duration,
      soothing: params.soothing,
      bgSound: params.bgSound,
      pace: params.pace,
    });
    return (data ?? { enabled: false }) as LlmStoryResult;
  } catch {
    return { enabled: false };
  }
}
