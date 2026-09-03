import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { findOrCreateUser, createToken, getUserByToken } from '../lib/store';

export const authRouter: Router = Router();

const loginSchema = z.object({
  method: z.enum(['phone', 'wechat']),
  identifier: z.string().min(1),
  name: z.string().optional(),
});

authRouter.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: '参数错误' });
  }
  const { method, identifier, name } = parsed.data;
  if (method === 'phone' && !/^1\d{10}$/.test(identifier)) {
    return res.status(400).json({ status: 'error', message: '手机号格式不正确' });
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
