"use strict";
// 服务端语音合成（无需 API Key）
// 优先使用 Microsoft Edge 在线 TTS（node-edge-tts），失败后回退到 gTTS。
// 生成 MP3 后缓存到 data/tts，供前端 <audio> 播放。
// 若服务器无法访问外网，会优雅降级，由前端回退到浏览器原生语音。
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTS_DIR = void 0;
exports.normalizeVoice = normalizeVoice;
exports.audioFilePath = audioFilePath;
exports.audioUrl = audioUrl;
exports.cachedAudioPath = cachedAudioPath;
exports.synthesize = synthesize;
exports.ensureAudio = ensureAudio;
exports.ensureAudioWithRetry = ensureAudioWithRetry;
exports.generateStoryAudio = generateStoryAudio;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const node_edge_tts_1 = require("node-edge-tts");
const child_process_1 = require("child_process");
/** 音色 → Edge TTS 语音（中文/英文各一个，宝爸/爷爷用男声，宝妈/奶奶用女声） */
const EDGE_VOICE = {
    mommy: { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-JennyNeural' },
    daddy: { zh: 'zh-CN-YunxiNeural', en: 'en-US-GuyNeural' },
    grandma: { zh: 'zh-CN-XiaoyiNeural', en: 'en-US-AriaNeural' },
    grandpa: { zh: 'zh-CN-YunjianNeural', en: 'en-US-DavisNeural' },
};
function edgeVoiceFor(voice, lang) {
    const m = EDGE_VOICE[voice] ?? EDGE_VOICE.mommy;
    return lang.startsWith('zh') ? m.zh : m.en;
}
function normalizeVoice(v) {
    return v === 'daddy' || v === 'grandpa' || v === 'grandma' || v === 'mommy' ? v : 'mommy';
}
function findTTSDir() {
    const dataCandidates = [
        path_1.default.resolve(process.cwd(), 'data'),
        path_1.default.resolve(process.cwd(), 'backend/data'),
        path_1.default.resolve('/workspace/backend/data'),
    ];
    // 优先复用已有 db.json 的 data 目录，让语音文件与数据放在一起
    for (const dataDir of dataCandidates) {
        if (fs_1.default.existsSync(path_1.default.join(dataDir, 'db.json'))) {
            const ttsDir = path_1.default.join(dataDir, 'tts');
            try {
                if (!fs_1.default.existsSync(ttsDir))
                    fs_1.default.mkdirSync(ttsDir, { recursive: true });
                return ttsDir;
            }
            catch {
                continue;
            }
        }
    }
    const ttsCandidates = [
        path_1.default.resolve(process.cwd(), 'data/tts'),
        path_1.default.resolve(process.cwd(), 'backend/data/tts'),
        path_1.default.resolve('/workspace/backend/data/tts'),
    ];
    for (const dir of ttsCandidates) {
        try {
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            return dir;
        }
        catch {
            continue;
        }
    }
    return ttsCandidates[0];
}
exports.TTS_DIR = findTTSDir();
function ensureDir() {
    if (!fs_1.default.existsSync(exports.TTS_DIR))
        fs_1.default.mkdirSync(exports.TTS_DIR, { recursive: true });
}
function hashText(text, lang, voice) {
    return crypto_1.default.createHash('sha256').update(`${lang}:${voice}:${text}`).digest('hex').slice(0, 32);
}
function audioFilePath(hash) {
    return path_1.default.join(exports.TTS_DIR, `${hash}.mp3`);
}
function audioUrl(hash) {
    return `/api/tts/file/${hash}.mp3`;
}
function cachedAudioPath(text, lang = 'zh-CN', voice = 'mommy') {
    ensureDir();
    const hash = hashText(text, lang, voice);
    return { hash, path: audioFilePath(hash), url: audioUrl(hash) };
}
async function synthesizeWithEdge(text, lang = 'zh-CN', voice = 'mommy') {
    try {
        const isZh = lang.startsWith('zh');
        const ttsLang = isZh ? 'zh-CN' : 'en-US';
        const tts = new node_edge_tts_1.EdgeTTS({
            voice: edgeVoiceFor(voice, lang),
            lang: ttsLang,
            outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
            timeout: 15000,
        });
        const tmpFile = path_1.default.join(exports.TTS_DIR, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
        await tts.ttsPromise(text, tmpFile);
        const buf = fs_1.default.readFileSync(tmpFile);
        try {
            fs_1.default.unlinkSync(tmpFile);
        }
        catch { /* ignore */ }
        // 清理 EdgeTTS 可能生成的字幕文件
        try {
            const subFile = tmpFile.replace(/\.mp3$/, '.json');
            if (fs_1.default.existsSync(subFile))
                fs_1.default.unlinkSync(subFile);
        }
        catch { /* ignore */ }
        return buf.length ? buf : null;
    }
    catch (err) {
        console.warn('[TTS] Edge TTS failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
function gttsScript(text, lang) {
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
async function synthesizeWithGTTS(text, lang = 'zh-CN') {
    return new Promise((resolve) => {
        const py = (0, child_process_1.spawn)('python3', ['-c', gttsScript(text, lang)]);
        const chunks = [];
        const errChunks = [];
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
            try {
                py.kill('SIGKILL');
            }
            catch { /* ignore */ }
            resolve(null);
        }, 15000);
    });
}
/** 调用 TTS 生成 MP3；网络不可用时返回 null */
async function synthesize(text, lang = 'zh-CN', voice = 'mommy') {
    const edge = await synthesizeWithEdge(text, lang, voice);
    if (edge)
        return edge;
    return synthesizeWithGTTS(text, lang);
}
/** 确保某段文本有缓存的音频文件；返回音频 URL，失败返回 null */
async function ensureAudio(text, lang = 'zh-CN', voice = 'mommy') {
    const { path: filePath, url } = cachedAudioPath(text, lang, voice);
    if (fs_1.default.existsSync(filePath))
        return url;
    const buf = await synthesize(text, lang, voice);
    if (!buf || buf.length === 0)
        return null;
    fs_1.default.writeFileSync(filePath, buf);
    return url;
}
/** 单页语音生成，失败自动重试若干次（弱网/抖动时很关键），返回 URL 或 null */
async function ensureAudioWithRetry(text, lang = 'zh-CN', attempts = 3, voice = 'mommy') {
    for (let i = 0; i < attempts; i++) {
        try {
            const url = await ensureAudio(text, lang, voice);
            if (url)
                return url;
        }
        catch {
            /* 继续重试 */
        }
        if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
    }
    return null;
}
/** 为整个故事生成音频，返回每页对应的 URL（失败的页面为 null） */
async function generateStoryAudio(pages, lang = 'zh-CN', voice = 'mommy') {
    const results = [];
    // 顺序生成，避免并发导致超时/限流；每页失败自动重试
    for (const page of pages) {
        try {
            const url = await ensureAudioWithRetry(page.text, lang, 3, voice);
            results.push(url);
        }
        catch {
            results.push(null);
        }
    }
    return results;
}
//# sourceMappingURL=tts.js.map