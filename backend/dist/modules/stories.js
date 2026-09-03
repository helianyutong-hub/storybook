"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storiesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const store_1 = require("../lib/store");
const auth_1 = require("../middleware/auth");
const tts_1 = require("../lib/tts");
exports.storiesRouter = (0, express_1.Router)();
// 所有故事接口需登录
exports.storiesRouter.use((req, res, next) => {
    const user = (0, auth_1.getUserFromRequest)(req);
    if (!user)
        return res.status(401).json({ status: 'error', message: '请先登录' });
    req.user = user;
    return next();
});
const storySchema = zod_1.z
    .object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    params: zod_1.z
        .object({
        childName: zod_1.z.string().optional(),
        tone: zod_1.z.string().optional(),
        bgSound: zod_1.z.string().optional(),
        duration: zod_1.z.string().optional(),
    })
        .passthrough()
        .optional(),
    pages: zod_1.z.array(zod_1.z.any()),
    createdAt: zod_1.z.string().optional(),
    approved: zod_1.z.boolean().optional(),
})
    .passthrough();
exports.storiesRouter.get('/', (req, res) => {
    const user = req.user;
    const list = (0, store_1.listStories)(user.id).map((s) => ({
        id: s.id,
        title: s.title,
        childName: s.childName,
        tone: s.tone,
        bgSound: s.bgSound,
        duration: s.duration,
        pageCount: s.pageCount,
        createdAt: s.createdAt,
        approved: s.approved,
    }));
    return res.json({ stories: list });
});
exports.storiesRouter.post('/', (req, res) => {
    const user = req.user;
    const parsed = storySchema.safeParse(req.body?.story);
    if (!parsed.success) {
        console.warn('[stories] validation failed', parsed.error.flatten());
        return res.status(400).json({ status: 'error', message: '故事数据格式错误' });
    }
    const st = parsed.data;
    (0, store_1.upsertStory)({
        id: st.id,
        userId: user.id,
        title: st.title,
        childName: st.params?.childName ?? '',
        tone: st.params?.tone ?? '',
        bgSound: st.params?.bgSound ?? '',
        duration: st.params?.duration ?? '',
        pageCount: Array.isArray(st.pages) ? st.pages.length : 0,
        createdAt: st.createdAt ?? new Date().toISOString(),
        approved: !!st.approved,
        data: st,
    });
    // 异步生成语音，不阻塞保存响应；按故事语言选择朗读声线
    const pages = Array.isArray(st.pages) ? st.pages : [];
    const ttsLang = st.params?.lang === 'en' ? 'en-US' : 'zh-CN';
    (0, tts_1.generateStoryAudio)(pages, ttsLang).then((urls) => {
        if (urls.some(Boolean)) {
            const existing = (0, store_1.getStory)(st.id, user.id);
            if (existing) {
                const data = existing.data;
                data.audioUrls = urls;
                (0, store_1.upsertStory)(existing);
            }
        }
    }).catch((err) => {
        console.warn('[stories] TTS generation failed', err);
    });
    return res.json({ id: st.id });
});
exports.storiesRouter.get('/:id', (req, res) => {
    const user = req.user;
    const id = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
    const s = (0, store_1.getStory)(id, user.id);
    if (!s)
        return res.status(404).json({ status: 'error', message: '未找到故事' });
    return res.json({ story: s.data });
});
exports.storiesRouter.delete('/:id', (req, res) => {
    const user = req.user;
    const id = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
    const ok = (0, store_1.deleteStory)(id, user.id);
    if (!ok)
        return res.status(404).json({ status: 'error', message: '未找到故事' });
    return res.json({ ok: true });
});
//# sourceMappingURL=stories.js.map