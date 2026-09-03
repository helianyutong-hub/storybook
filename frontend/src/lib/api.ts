// 后端接口封装（认证、故事历史、用户偏好）
import apiClient from './api-client';
import { Story, StoryParams, UserPreferences, AuthUser, StorySummary, VoiceRole } from '@/types/story';

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
    const { data } = await apiClient.post('/tts', { text, lang: locale, voice: voice ?? 'mommy' });
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
  const { data } = await apiClient.post('/tts/story', {
    pages: texts.map((text) => ({ text })),
    lang: locale,
    voice: voice ?? 'mommy',
  });
  return data?.jobId;
}

/** 轮询生成任务直到结束，期间回调进度；返回每页音频 URL（失败的页为 null） */
async function waitStoryAudioJob(
  jobId: string,
  onProgress?: (p: AudioProgress) => void,
): Promise<(string | null)[]> {
  const maxAttempts = 300; // 约 6 分钟上限，覆盖弱网场景
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await apiClient.get(`/tts/story/${jobId}`);
    onProgress?.({ done: Number(data?.done ?? 0), total: Number(data?.total ?? 0) });
    if (data?.status === 'done') {
      return Array.isArray(data?.urls) ? data.urls : [];
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error('语音生成超时');
}

/**
 * 确保故事每一页都有云端语音：
 * 一次请求让后端把全部缺失的页都生成，若仍有失败页则自动补生成（最多 3 轮），
 * 避免"生成一半留一半"。返回的数组长度等于页数，失败的页为 null。
 */
export async function ensureStoryAudioUrls(
  story: Story,
  onProgress?: (p: AudioProgress) => void,
): Promise<(string | null)[]> {
  const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';
  const total = story.pages.length;

  // 先把已有记录对齐到当前页数
  const urls: (string | null)[] = new Array(total).fill(null);
  const existing = story.audioUrls ?? [];
  for (let i = 0; i < Math.min(existing.length, total); i++) {
    urls[i] = existing[i] ?? null;
  }

  // 最多 3 轮：每轮只为仍然缺失的页发起任务，已生成的页由后端缓存直接命中
  for (let round = 0; round < 3; round++) {
    const missing: number[] = [];
    urls.forEach((u, i) => {
      if (!u) missing.push(i);
    });
    if (missing.length === 0) break;

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
  }

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
