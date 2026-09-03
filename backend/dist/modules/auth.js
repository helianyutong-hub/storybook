"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const store_1 = require("../lib/store");
exports.authRouter = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    method: zod_1.z.enum(['phone', 'wechat']),
    identifier: zod_1.z.string().min(1),
    name: zod_1.z.string().optional(),
});
exports.authRouter.post('/login', (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ status: 'error', message: '参数错误' });
    }
    const { method, identifier, name } = parsed.data;
    if (method === 'phone' && !/^1\d{10}$/.test(identifier)) {
        return res.status(400).json({ status: 'error', message: '手机号格式不正确' });
    }
    const user = (0, store_1.findOrCreateUser)(method, identifier, name);
    const token = (0, store_1.createToken)(user.id);
    return res.json({
        token,
        user: { id: user.id, name: user.name, method: user.method },
    });
});
exports.authRouter.get('/me', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = (0, store_1.getUserByToken)(token);
    if (!user)
        return res.status(401).json({ status: 'error', message: '未登录' });
    return res.json({ user: { id: user.id, name: user.name, method: user.method } });
});
//# sourceMappingURL=auth.js.map