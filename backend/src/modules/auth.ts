import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { findOrCreateUser, createToken, getUserByToken, updateUserName } from '../lib/store';
import { smsEnabled, sendSmsCode, verifySmsCode } from '../lib/sms';

export const authRouter: Router = Router();

/** 登录方式配置（前端据此切换「演示模式 / 真实验证码」UI） */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.json({ smsEnabled: smsEnabled() });
});

const sendSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/),
});

/** 发送短信验证码（未配置短信服务时返回明确错误，前端不会走到这里） */
authRouter.post('/sms/send', async (req: Request, res: Response) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: '手机号格式不正确' });
  }
  if (!smsEnabled()) {
    return res.status(400).json({ status: 'error', message: '短信服务未开通' });
  }
  const result = await sendSmsCode(parsed.data.phone);
  if (!result.ok) {
    return res.status(429).json({ status: 'error', message: result.message });
  }
  return res.json({ status: 'ok' });
});

const loginSchema = z.object({
  method: z.enum(['phone', 'wechat']),
  identifier: z.string().min(1),
  name: z.string().optional(),
  /** 短信验证码（smsEnabled 时手机号登录必填） */
  code: z.string().optional(),
});

authRouter.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: '参数错误' });
  }
  const { method, identifier, name, code } = parsed.data;

  if (method === 'phone') {
    if (!/^1\d{10}$/.test(identifier)) {
      return res.status(400).json({ status: 'error', message: '手机号格式不正确' });
    }
    if (smsEnabled()) {
      // 真实模式：必须携带正确验证码
      if (!code) {
        return res.status(400).json({ status: 'error', message: '请输入验证码' });
      }
      const check = verifySmsCode(identifier, code);
      if (!check.ok) {
        return res.status(400).json({ status: 'error', message: check.message });
      }
    }
    // 未配置短信服务 → 演示模式（任意手机号直接登录），保持旧行为
  }

  const user = findOrCreateUser(method, identifier, name);
  const token = createToken(user.id);
  return res.json({
    token,
    user: { id: user.id, name: user.name, method: user.method },
  });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ status: 'error', message: '未登录' });
  return res.json({ user: { id: user.id, name: user.name, method: user.method } });
});

const renameSchema = z.object({
  name: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最长 20 个字'),
});

/** 修改昵称（需登录） */
authRouter.patch('/me', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ status: 'error', message: '未登录' });

  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: 'error', message: parsed.error.issues[0]?.message ?? '昵称格式不正确' });
  }
  const updated = updateUserName(user.id, parsed.data.name);
  return res.json({ user: { id: updated.id, name: updated.name, method: updated.method } });
});
