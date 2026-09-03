"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferencesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const store_1 = require("../lib/store");
const auth_1 = require("../middleware/auth");
exports.preferencesRouter = (0, express_1.Router)();
exports.preferencesRouter.use((req, res, next) => {
    const user = (0, auth_1.getUserFromRequest)(req);
    if (!user)
        return res.status(401).json({ status: 'error', message: '请先登录' });
    req.user = user;
    return next();
});
const schema = zod_1.z
    .object({
    childName: zod_1.z.string().optional(),
    characters: zod_1.z.array(zod_1.z.string()).optional(),
    lastParams: zod_1.z.record(zod_1.z.unknown()).optional(),
})
    .passthrough();
exports.preferencesRouter.get('/', (req, res) => {
    const user = req.user;
    const prefs = (0, store_1.getPreferences)(user.id);
    return res.json({
        preferences: prefs ?? { childName: '', characters: [], lastParams: {} },
    });
});
exports.preferencesRouter.put('/', (req, res) => {
    const user = req.user;
    const parsed = schema.safeParse(req.body?.preferences);
    if (!parsed.success) {
        return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    const p = parsed.data;
    (0, store_1.setPreferences)(user.id, {
        childName: p.childName ?? '',
        characters: p.characters ?? [],
        lastParams: p.lastParams ?? {},
    });
    return res.json({ ok: true });
});
//# sourceMappingURL=preferences.js.map