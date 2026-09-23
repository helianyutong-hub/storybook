import { Router, type Request, type Response } from 'express';
import { resetPasswordByPhone } from '../lib/store';

/**
 * 忘记密码路由（演示模式）。
 * 为何独立成模块：登录/注册逻辑在 auth.ts 内，本模块刻意不改动 auth.ts，
 * 仅提供「按手机号重置密码」的最小能力，降低对存量登录代码的影响。
 */
export const forgotPasswordRouter = Router();

const PHONE_RE = /^1[3-9]\d{9}$/;

forgotPasswordRouter.post('/', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { phone?: unknown; newPassword?: unknown };
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ message: '请输入正确的手机号' });
  }
  if (newPassword.length < 6 || newPassword.length > 20) {
    return res.status(400).json({ message: '新密码需要 6-20 位' });
  }

  try {
    resetPasswordByPhone(phone, newPassword);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '重置失败';
    return res.status(400).json({ message });
  }
});
