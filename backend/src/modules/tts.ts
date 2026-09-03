import { Router } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { audioFilePath, ensureAudioWithRetry, cachedAudioPath, normalizeVoice } from '../lib/tts';

export const ttsRouter: Router = Router();

// 整本故事的批量语音生成任务：后端异步逐页生成 + 前端轮询进度。
// 这样即使弱网（微信浏览器）也不会因为单个长请求被中断而只生成一部分。
type TtsJob = {
  status: 'generating' | 'done';
  done: number;
  total: number;
  urls: (string | null)[];
};

const STORY_JOBS = new Map<string, TtsJob>();
const MAX_JOBS = 50;

function rememberJob(id: string, job: TtsJob) {
  STORY_JOBS.set(id, job);
  // 简单容量控制，避免任务无限堆积
  if (STORY_JOBS.size > MAX_JOBS) {
    const oldest = STORY_JOBS.keys().next().value;
    if (oldest !== undefined) STORY_JOBS.delete(oldest);
  }
}

// 按需生成并返回音频 URL（单页）
// body: { text: string, lang?: string, voice?: 'daddy'|'mommy'|'grandpa'|'grandma' }
ttsRouter.post('/', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'zh-CN';
  const voice = normalizeVoice(req.body?.voice);
  if (!text.trim()) {
    return res.status(400).json({ status: 'error', message: '缺少文本' });
  }
  const url = await ensureAudioWithRetry(text, lang, 3, voice);
  if (!url) {
    return res.status(503).json({ status: 'error', message: '语音生成服务暂不可用' });
  }
  return res.json({ url });
});

// 获取已缓存音频文件
ttsRouter.get('/file/:hash.mp3', (req, res) => {
  const hash = req.params.hash.replace(/\.mp3$/, '');
  if (!/^[a-f0-9]{32}$/.test(hash)) {
    return res.status(400).json({ status: 'error', message: '无效的音频标识' });
  }
  const file = audioFilePath(hash);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ status: 'error', message: '音频不存在' });
  }
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(file).pipe(res);
  return;
});

// 启动整本故事（或指定若干页）的语音生成任务
// body: { pages: [{ text }], lang?: string, voice?: 'daddy'|'mommy'|'grandpa'|'grandma' }
ttsRouter.post('/story', (req, res) => {
  const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];
  const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'zh-CN';
  const voice = normalizeVoice(req.body?.voice);
  const texts: string[] = pages.map((p: unknown) =>
    typeof (p as { text?: unknown } | null)?.text === 'string'
      ? ((p as { text: string }).text as string)
      : '',
  );
  if (!texts.length) {
    return res.status(400).json({ status: 'error', message: '缺少页面文本' });
  }

  const jobId = crypto.randomUUID();
  const job: TtsJob = {
    status: 'generating',
    done: 0,
    total: texts.length,
    urls: new Array(texts.length).fill(null),
  };
  rememberJob(jobId, job);

  // 后台逐页生成（每页失败自动重试），前端凭 jobId 轮询进度
  void (async () => {
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      job.urls[i] = text.trim() ? await ensureAudioWithRetry(text, lang, 3, voice) : null;
      job.done = i + 1;
    }
    job.status = 'done';
  })();

  return res.json({ jobId, total: texts.length });
});

// 查询生成任务进度
ttsRouter.get('/story/:jobId', (req, res) => {
  const job = STORY_JOBS.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ status: 'error', message: '任务不存在或已过期' });
  }
  return res.json({ status: job.status, done: job.done, total: job.total, urls: job.urls });
});

// 查询某段文本是否已有音频
ttsRouter.get('/', (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text : '';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : 'zh-CN';
  const voice = normalizeVoice(req.query.voice);
  if (!text.trim()) {
    return res.status(400).json({ status: 'error', message: '缺少文本' });
  }
  const { url, hash } = cachedAudioPath(text, lang, voice);
  return res.json({ url, ready: fs.existsSync(audioFilePath(hash)) });
});
