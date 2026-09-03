"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ttsRouter = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const tts_1 = require("../lib/tts");
exports.ttsRouter = (0, express_1.Router)();
const STORY_JOBS = new Map();
const MAX_JOBS = 50;
function rememberJob(id, job) {
    STORY_JOBS.set(id, job);
    // 简单容量控制，避免任务无限堆积
    if (STORY_JOBS.size > MAX_JOBS) {
        const oldest = STORY_JOBS.keys().next().value;
        if (oldest !== undefined)
            STORY_JOBS.delete(oldest);
    }
}
// 按需生成并返回音频 URL（单页）
// body: { text: string, lang?: string, voice?: 'daddy'|'mommy'|'grandpa'|'grandma' }
exports.ttsRouter.post('/', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'zh-CN';
    const voice = (0, tts_1.normalizeVoice)(req.body?.voice);
    if (!text.trim()) {
        return res.status(400).json({ status: 'error', message: '缺少文本' });
    }
    const url = await (0, tts_1.ensureAudioWithRetry)(text, lang, 3, voice);
    if (!url) {
        return res.status(503).json({ status: 'error', message: '语音生成服务暂不可用' });
    }
    return res.json({ url });
});
// 获取已缓存音频文件
exports.ttsRouter.get('/file/:hash.mp3', (req, res) => {
    const hash = req.params.hash.replace(/\.mp3$/, '');
    if (!/^[a-f0-9]{32}$/.test(hash)) {
        return res.status(400).json({ status: 'error', message: '无效的音频标识' });
    }
    const file = (0, tts_1.audioFilePath)(hash);
    if (!fs_1.default.existsSync(file)) {
        return res.status(404).json({ status: 'error', message: '音频不存在' });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    fs_1.default.createReadStream(file).pipe(res);
    return;
});
// 启动整本故事（或指定若干页）的语音生成任务
// body: { pages: [{ text }], lang?: string, voice?: 'daddy'|'mommy'|'grandpa'|'grandma' }
exports.ttsRouter.post('/story', (req, res) => {
    const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];
    const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'zh-CN';
    const voice = (0, tts_1.normalizeVoice)(req.body?.voice);
    const texts = pages.map((p) => typeof p?.text === 'string'
        ? p.text
        : '');
    if (!texts.length) {
        return res.status(400).json({ status: 'error', message: '缺少页面文本' });
    }
    const jobId = crypto_1.default.randomUUID();
    const job = {
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
            job.urls[i] = text.trim() ? await (0, tts_1.ensureAudioWithRetry)(text, lang, 3, voice) : null;
            job.done = i + 1;
        }
        job.status = 'done';
    })();
    return res.json({ jobId, total: texts.length });
});
// 查询生成任务进度
exports.ttsRouter.get('/story/:jobId', (req, res) => {
    const job = STORY_JOBS.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ status: 'error', message: '任务不存在或已过期' });
    }
    return res.json({ status: job.status, done: job.done, total: job.total, urls: job.urls });
});
// 查询某段文本是否已有音频
exports.ttsRouter.get('/', (req, res) => {
    const text = typeof req.query.text === 'string' ? req.query.text : '';
    const lang = typeof req.query.lang === 'string' ? req.query.lang : 'zh-CN';
    const voice = (0, tts_1.normalizeVoice)(req.query.voice);
    if (!text.trim()) {
        return res.status(400).json({ status: 'error', message: '缺少文本' });
    }
    const { url, hash } = (0, tts_1.cachedAudioPath)(text, lang, voice);
    return res.json({ url, ready: fs_1.default.existsSync((0, tts_1.audioFilePath)(hash)) });
});
//# sourceMappingURL=tts.js.map