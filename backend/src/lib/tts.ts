// 服务端语音合成（无需 API Key）
// 优先使用 Microsoft Edge 在线 TTS（node-edge-tts），失败后回退到 gTTS。
// 生成 MP3 后缓存到 data/tts，供前端 <audio> 播放。
// 若服务器无法访问外网，会优雅降级，由前端回退到浏览器原生语音。

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EdgeTTS } from 'node-edge-tts';
import { spawn } from 'child_process';

/** 朗读音色（与前端 StoryParams.voice 对应） */
export type TtsVoice = 'daddy' | 'mommy' | 'grandpa' | 'grandma';

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

/** 调用 TTS 生成 MP3；网络不可用时返回 null */
export async function synthesize(text: string, lang = 'zh-CN', voice: TtsVoice = 'mommy'): Promise<Buffer | null> {
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
