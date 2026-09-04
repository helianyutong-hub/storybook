// 服务端语音合成
// 优先使用阿里云百炼 CosyVoice（音色区分度最好，尤其是老人/成人音色差异明显），
// 未配置 API Key 或调用失败时，回退到 Microsoft Edge 在线 TTS，再失败则用 gTTS。
// 生成 MP3 后缓存到 data/tts，供前端 <audio> 播放。
// 若服务器无法访问外网，会优雅降级，由前端回退到浏览器原生语音。

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EdgeTTS } from 'node-edge-tts';
import { spawn } from 'child_process';

/** 朗读音色（与前端 StoryParams.voice 对应） */
export type TtsVoice = 'daddy' | 'mommy' | 'grandpa' | 'grandma';

/**
 * 音色 → 阿里云百炼 CosyVoice 音色。
 * 选音原则：年龄跨度拉到最大（20 岁 vs 60 岁以上），男女各半，
 * 这样"爸爸/妈妈/爷爷/奶奶"四个角色一听就能分辨——Edge TTS 时代只能靠调 pitch，
 * 区分度极差，这里直接用不同年龄段、不同性别的真实音色。
 *
 * 音色参数来自阿里云官方文档：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
 * fallback 用于主音色不可用时（账号未开通 / 地域限制）自动降级，保证仍能出声。
 */
const ALIYUN_VOICE: Record<TtsVoice, { primary: string; fallback: string; label: string }> = {
  // 宝妈：20-30 岁女性，细腻柔和，有声书场景专用
  mommy: { primary: 'longwanjun_v3', fallback: 'longanwen_v3', label: '细腻柔声女 20-30岁' },
  // 宝爸：30-35 岁男性，居家暖男
  daddy: { primary: 'longanyun_v3', fallback: 'longanzhi_v3', label: '居家暖男 30-35岁' },
  // 爷爷：60 岁以上男性，沧桑岁月
  grandpa: { primary: 'longlaobo_v3', fallback: 'longxiu_v3', label: '沧桑岁月爷 60岁以上' },
  // 奶奶：60 岁以上女性，烟火从容
  grandma: { primary: 'longlaoyi_v3', fallback: 'longyuan_v3', label: '烟火从容阿姨 60岁以上' },
};

// 注意：必须在运行时读取，不能写成模块级常量——
// 否则模块加载早于 dotenv.config() 时会拿不到 .env 里的配置。
function cosyvoiceModel(): string {
  return process.env.ALIYUN_TTS_MODEL?.trim() || 'cosyvoice-v3-flash';
}

/** 音色 → Edge TTS 语音（中文/英文各一个，宝爸/爷爷用男声，宝妈/奶奶用女声） */
const EDGE_VOICE: Record<TtsVoice, { zh: string; en: string }> = {
  mommy: { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-JennyNeural' },
  daddy: { zh: 'zh-CN-YunxiNeural', en: 'en-US-GuyNeural' },
  grandma: { zh: 'zh-CN-XiaoyiNeural', en: 'en-US-AriaNeural' },
  grandpa: { zh: 'zh-CN-YunjianNeural', en: 'en-US-DavisNeural' },
};

function edgeVoiceFor(voice: TtsVoice, lang: string): string {
  const m = EDGE_VOICE[voice] ?? EDGE_VOICE.mommy;
  return lang.startsWith('zh') ? m.zh : m.en;
}

export function normalizeVoice(v: unknown): TtsVoice {
  return v === 'daddy' || v === 'grandpa' || v === 'grandma' || v === 'mommy' ? v : 'mommy';
}

/** 当前生效的语音合成引擎（供日志/健康检查展示） */
export function ttsProvider(): 'aliyun' | 'edge' | 'gtts' {
  if (process.env.DASHSCOPE_API_KEY) return 'aliyun';
  return 'edge';
}

/** 供外部（如 /api/health）查看每个音色实际对应的阿里云音色名 */
export function aliyunVoiceMap() {
  return Object.fromEntries(
    (Object.keys(ALIYUN_VOICE) as TtsVoice[]).map((k) => [
      k,
      { voice: ALIYUN_VOICE[k].primary, fallback: ALIYUN_VOICE[k].fallback, desc: ALIYUN_VOICE[k].label },
    ]),
  );
}

function findTTSDir(): string {
  const dataCandidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'backend/data'),
    path.resolve('/workspace/backend/data'),
  ];
  // 优先复用已有 db.json 的 data 目录，让语音文件与数据放在一起
  for (const dataDir of dataCandidates) {
    if (fs.existsSync(path.join(dataDir, 'db.json'))) {
      const ttsDir = path.join(dataDir, 'tts');
      try {
        if (!fs.existsSync(ttsDir)) fs.mkdirSync(ttsDir, { recursive: true });
        return ttsDir;
      } catch {
        continue;
      }
    }
  }
  const ttsCandidates = [
    path.resolve(process.cwd(), 'data/tts'),
    path.resolve(process.cwd(), 'backend/data/tts'),
    path.resolve('/workspace/backend/data/tts'),
  ];
  for (const dir of ttsCandidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      continue;
    }
  }
  return ttsCandidates[0];
}

export const TTS_DIR = findTTSDir();

function ensureDir() {
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
}

function hashText(text: string, lang: string, voice: TtsVoice): string {
  return crypto.createHash('sha256').update(`${lang}:${voice}:${text}`).digest('hex').slice(0, 32);
}

export function audioFilePath(hash: string): string {
  return path.join(TTS_DIR, `${hash}.mp3`);
}

export function audioUrl(hash: string): string {
  return `/api/tts/file/${hash}.mp3`;
}

export function cachedAudioPath(
  text: string,
  lang = 'zh-CN',
  voice: TtsVoice = 'mommy',
): { hash: string; path: string; url: string } {
  ensureDir();
  const hash = hashText(text, lang, voice);
  return { hash, path: audioFilePath(hash), url: audioUrl(hash) };
}

/**
 * 阿里云百炼 CosyVoice 合成前的文本预处理。
 * 官方已知问题：cosyvoice-v3-flash 遇到「·」分隔的数字段会漏读/重复念读，
 * 替换成中文逗号可规避。
 */
function preprocessForAliyun(text: string): string {
  return text.replace(/·/g, '，').slice(0, 2000);
}

/** 标准 DashScope 多模态端点（只需 API Key） */
const DASHSCOPE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/** CosyVoice 专用端点（需要百炼控制台的 WorkspaceId） */
function workspaceUrl(): string | null {
  const ws = process.env.DASHSCOPE_WORKSPACE_ID?.trim();
  return ws ? `https://${ws}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer` : null;
}

type AliyunEndpoint = {
  name: string;
  url: string;
  /** 按官方文档，两个端点的参数层级不同：Workspace 端点把音色放在 input 里 */
  buildBody: (text: string, voice: string) => Record<string, unknown>;
};

function aliyunEndpoints(): AliyunEndpoint[] {
  const list: AliyunEndpoint[] = [];
  const wsUrl = workspaceUrl();
  if (wsUrl) {
    list.push({
      name: 'workspace',
      url: wsUrl,
      buildBody: (text, voice) => ({
        model: cosyvoiceModel(),
        input: { text, voice, format: 'mp3', sample_rate: 24000 },
      }),
    });
  }
  list.push({
    name: 'dashscope',
    url: DASHSCOPE_URL,
    buildBody: (text, voice) => ({
      model: cosyvoiceModel(),
      input: { text },
      parameters: { voice, format: 'mp3', sample_rate: 24000 },
    }),
  });
  return list;
}

/** 从阿里云响应里取出音频二进制：优先 url（下载），其次 base64 data */
async function extractAudio(payload: unknown): Promise<Buffer | null> {
  const audio = (payload as { output?: { audio?: { url?: string; data?: string } } })?.output?.audio;
  if (!audio) return null;
  if (typeof audio.url === 'string' && audio.url) {
    try {
      const res = await fetch(audio.url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length) return buf;
      }
    } catch (err) {
      console.warn('[TTS] 下载阿里云音频失败:', err instanceof Error ? err.message : String(err));
    }
  }
  if (typeof audio.data === 'string' && audio.data) {
    const buf = Buffer.from(audio.data, 'base64');
    if (buf.length) return buf;
  }
  // 少数情况下响应体直接就是音频二进制
  return null;
}

/**
 * 调用阿里云百炼 CosyVoice 合成语音。
 * 做了两层容错：端点（Workspace 专用端点 / 标准 DashScope 端点）+ 音色（主音色 / 备用音色），
 * 任一层失败都自动降级，避免阿里云接口调整或账号权限差异导致整个语音功能不可用。
 */
async function synthesizeWithAliyun(
  text: string,
  lang = 'zh-CN',
  voice: TtsVoice = 'mommy',
): Promise<Buffer | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) return null;

  const cfg = ALIYUN_VOICE[voice] ?? ALIYUN_VOICE.mommy;
  const cleanText = preprocessForAliyun(text);
  const isZh = lang.startsWith('zh');
  const endpoints = aliyunEndpoints();
  const voices = [cfg.primary, cfg.fallback];

  for (const ep of endpoints) {
    for (const v of voices) {
      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ep.buildBody(cleanText, v)),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn(
            `[TTS] 阿里云 ${ep.name}/${v} 失败 ${res.status}: ${body.slice(0, 200)}`,
          );
          // 401/403 是鉴权问题，换端点换音色都没用，直接放弃阿里云
          if (res.status === 401 || res.status === 403) {
            console.error('[TTS] 阿里云 API Key 无效或无权限，回退到 Edge TTS');
            return null;
          }
          continue;
        }

        const ctype = res.headers.get('content-type') || '';
        // SSE 流式：逐段拼接 base64 音频
        if (ctype.includes('event-stream')) {
          const raw = await res.text();
          const chunks: string[] = [];
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const parsed = JSON.parse(json) as { output?: { audio?: { data?: string } } };
              const d = parsed?.output?.audio?.data;
              if (typeof d === 'string') chunks.push(d);
            } catch {
              /* 忽略非 JSON 行 */
            }
          }
          if (chunks.length) {
            const buf = Buffer.from(chunks.join(''), 'base64');
            if (buf.length) {
              console.log(`[TTS] 阿里云 ${ep.name}/${v} 合成成功(${isZh ? '中' : '英'}): ${buf.length}B`);
              return buf;
            }
          }
          continue;
        }

        const payload: unknown = await res.json();
        const buf = await extractAudio(payload);
        if (buf) {
          console.log(`[TTS] 阿里云 ${ep.name}/${v} 合成成功(${isZh ? '中' : '英'}): ${buf.length}B`);
          return buf;
        }
        console.warn(`[TTS] 阿里云 ${ep.name}/${v} 返回无音频数据`);
      } catch (err) {
        console.warn(
          `[TTS] 阿里云 ${ep.name}/${v} 异常:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
  return null;
}

async function synthesizeWithEdge(text: string, lang = 'zh-CN', voice: TtsVoice = 'mommy'): Promise<Buffer | null> {
  try {
    const isZh = lang.startsWith('zh');
    const ttsLang = isZh ? 'zh-CN' : 'en-US';
    const tts = new EdgeTTS({
      voice: edgeVoiceFor(voice, lang),
      lang: ttsLang,
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      timeout: 15000,
    });
    const tmpFile = path.join(TTS_DIR, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    await tts.ttsPromise(text, tmpFile);
    const buf = fs.readFileSync(tmpFile);
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    // 清理 EdgeTTS 可能生成的字幕文件
    try {
      const subFile = tmpFile.replace(/\.mp3$/, '.json');
      if (fs.existsSync(subFile)) fs.unlinkSync(subFile);
    } catch { /* ignore */ }
    return buf.length ? buf : null;
  } catch (err) {
    console.warn('[TTS] Edge TTS failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function gttsScript(text: string, lang: string): string {
  const safeText = JSON.stringify(text);
  return `
import sys
from gtts import gTTS
try:
    tts = gTTS(${safeText}, lang='${lang}')
    tts.write_to_fp(sys.stdout.buffer)
except Exception as e:
    sys.stderr.write(str(e).encode('utf-8'))
    sys.exit(1)
`;
}

async function synthesizeWithGTTS(text: string, lang = 'zh-CN'): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const py = spawn('python3', ['-c', gttsScript(text, lang)]);
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    py.stdout.on('data', (c) => chunks.push(c));
    py.stderr.on('data', (c) => errChunks.push(c));
    py.on('error', () => resolve(null));
    py.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        console.warn('[TTS] gTTS failed:', Buffer.concat(errChunks).toString('utf-8').slice(0, 200));
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    setTimeout(() => {
      try { py.kill('SIGKILL'); } catch { /* ignore */ }
      resolve(null);
    }, 15000);
  });
}

/**
 * 调用 TTS 生成 MP3；全部引擎不可用时返回 null。
 * 优先级：阿里云 CosyVoice（音色区分好）→ Edge TTS（免费）→ gTTS（最后兜底）
 */
export async function synthesize(text: string, lang = 'zh-CN', voice: TtsVoice = 'mommy'): Promise<Buffer | null> {
  const aliyun = await synthesizeWithAliyun(text, lang, voice);
  if (aliyun) return aliyun;
  const edge = await synthesizeWithEdge(text, lang, voice);
  if (edge) return edge;
  return synthesizeWithGTTS(text, lang);
}

/** 确保某段文本有缓存的音频文件；返回音频 URL，失败返回 null */
export async function ensureAudio(text: string, lang = 'zh-CN', voice: TtsVoice = 'mommy'): Promise<string | null> {
  const { path: filePath, url } = cachedAudioPath(text, lang, voice);
  if (fs.existsSync(filePath)) return url;
  const buf = await synthesize(text, lang, voice);
  if (!buf || buf.length === 0) return null;
  fs.writeFileSync(filePath, buf);
  return url;
}

/** 单页语音生成，失败自动重试若干次（弱网/抖动时很关键），返回 URL 或 null */
export async function ensureAudioWithRetry(
  text: string,
  lang = 'zh-CN',
  attempts = 3,
  voice: TtsVoice = 'mommy',
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const url = await ensureAudio(text, lang, voice);
      if (url) return url;
    } catch {
      /* 继续重试 */
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return null;
}

/** 为整个故事生成音频，返回每页对应的 URL（失败的页面为 null） */
export async function generateStoryAudio(
  pages: { text: string }[],
  lang = 'zh-CN',
  voice: TtsVoice = 'mommy',
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  // 顺序生成，避免并发导致超时/限流；每页失败自动重试
  for (const page of pages) {
    try {
      const url = await ensureAudioWithRetry(page.text, lang, 3, voice);
      results.push(url);
    } catch {
      results.push(null);
    }
  }
  return results;
}
