"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storyGenRouter = void 0;
const express_1 = require("express");
// 可选的大模型故事生成接口（需求 1：完整情节 + 需求 4：动态页数）
// 仅当后端配置了 LLM_API_KEY 时才启用；未配置时返回 { enabled: false }，
// 前端会自动回退到本地模板引擎，保证离线也能用。
//
// 兼容任意 OpenAI 格式的接口（OpenAI / DeepSeek / 通义 / 智谱 等）。
// 通过环境变量配置：
//   LLM_API_KEY   必填，模型 API Key
//   LLM_BASE_URL  可选，默认 https://api.openai.com/v1
//   LLM_MODEL     可选，默认 gpt-4o-mini
exports.storyGenRouter = (0, express_1.Router)();
function llmConfigured() {
    return !!process.env.LLM_API_KEY;
}
function buildPrompt(input) {
    const name = (input.childName || '').trim() || (input.lang === 'en' ? 'little one' : '宝宝');
    const charList = Array.isArray(input.characters) ? input.characters : [];
    const charText = charList.length
        ? charList.join('、')
        : input.lang === 'en'
            ? 'a gentle animal friend'
            : '一个温柔的小伙伴';
    const sysLang = input.lang === 'en' ? 'English' : 'Chinese (Simplified)';
    const lengthHint = input.duration === 'short'
        ? 'a concise but complete story'
        : input.duration === 'long'
            ? 'a rich, fully-developed complete story (feel free to use 15-20 pages if the plot needs it)'
            : 'a moderately rich, complete story';
    const user = `You are a professional children's bedtime story writer. Write a COMPLETE, logically coherent bedtime story for a young child (0-6 years old), in the style of a classic fairy tale like "Snow White and the Seven Dwarfs" — with a clear beginning, a small adventure or gentle conflict, a tender resolution, and a calm, sleepy ending.

Requirements:
- Language: ${sysLang}.
- Main character: a child named "${name}".
- Companion character(s): ${charText}.
- Tone: ${input.tone || 'gentle'} (gentle / playful / calm / lullaby).
- Length: ${lengthHint}.
- The number of pages is NOT fixed — let the story's plot decide how many pages it needs. Do not pad to hit a page count, and do not cut a plot short to fit a limit.
- Each page must be ONE short paragraph (2-4 soothing sentences) suitable for a single illustration and one sentence of audio narration.
- The story MUST have a real plot arc:
  1) Opening — the child gets ready for sleep (night, stars, cozy room).
  2) Meeting — the companion appears and stays with the child.
  3) Adventure / gentle conflict — something small happens (lost star, a faraway wish, a tiny worry) that the child and companion explore together.
  4) Resolution — they solve it warmly, learning something kind.
  5) Winding down — the world quiets, breathing slows.
  6) Falling asleep — the child drifts into a sweet dream with a goodnight.
- Output ONLY valid JSON (no markdown, no code fences) with this exact shape:
{ "title": string, "pages": [ { "text": string, "scene": string } ] }
where "scene" is a short visual description (in ${sysLang}) used to draw the illustration, e.g. "月亮升起，孩子和小熊坐在窗边看星星".`;
    return { sysLang, user };
}
exports.storyGenRouter.post('/', async (req, res) => {
    if (!llmConfigured()) {
        return res.json({ enabled: false });
    }
    const body = (req.body ?? {});
    const input = {
        childName: typeof body.childName === 'string' ? body.childName : '',
        characters: Array.isArray(body.characters) ? body.characters : [],
        tone: typeof body.tone === 'string' ? body.tone : 'gentle',
        lang: typeof body.lang === 'string' ? body.lang : 'zh',
        duration: typeof body.duration === 'string' ? body.duration : 'medium',
    };
    const { user } = buildPrompt(input);
    try {
        const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
        const model = process.env.LLM_MODEL || 'gpt-4o-mini';
        const r = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.LLM_API_KEY}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.9,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You are a soothing children bedtime story writer. You always reply with valid minified JSON and nothing else.',
                    },
                    { role: 'user', content: user },
                ],
            }),
        });
        if (!r.ok) {
            console.warn('[story-gen] LLM http error', r.status);
            return res.json({ enabled: true, fallback: true });
        }
        const data = (await r.json());
        const content = data?.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            parsed = JSON.parse(content);
        }
        catch {
            return res.json({ enabled: true, fallback: true });
        }
        if (!parsed.title || !Array.isArray(parsed.pages) || parsed.pages.length < 3) {
            return res.json({ enabled: true, fallback: true });
        }
        const pages = parsed.pages
            .slice(0, 20)
            .map((p) => ({ text: String(p?.text || '').trim(), scene: String(p?.scene || '').trim() }))
            .filter((p) => p.text);
        if (pages.length < 3)
            return res.json({ enabled: true, fallback: true });
        return res.json({ enabled: true, title: parsed.title, pages });
    }
    catch (err) {
        console.warn('[story-gen] failed', err instanceof Error ? err.message : String(err));
        return res.json({ enabled: true, fallback: true });
    }
});
//# sourceMappingURL=storyGen.js.map