import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  findOrCreateUser,
  createToken,
  getUserByToken,
  updateUserName,
  findUserByPhone,
  registerWithPassword,
  verifyPassword,
  setUserPassword,
} from '../lib/store';
import { smsEnabled, sendSmsCode, verifySmsCode } from '../lib/sms';

export const authRouter: Router = Router();

/** 登录方式配置（前端据此切换「演示模式 / 真实验证码 / 密码登录」UI） */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    smsEnabled: smsEnabled(),
    /** 密码登录永远可用：走数据库校验，不花短信费 */
    passwordEnabled: true,
  });
});

/** 查询手机号是否已注册 / 是否设过密码（用于前端提示"去注册"还是"输密码"） */
authRouter.get('/check', (req: Request, res: Response) => {
  const phone = String(req.query.phone ?? '').trim();
  if (!/^1\d{10}$/.test(phone)) {
    return res.json({ exists: false, hasPassword: false });
  }
  const user = findUserByPhone(phone);
  return res.json({ exists: !!user, hasPassword: !!user?.passwordHash });
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
  /** 短信验证码（mode=code 且 smsEnabled 时必填） */
  code: z.string().optional(),
  /** 密码（mode=password 时必填） */
  password: z.string().optional(),
  /** code=验证码登录（默认）；password=账号密码登录（不发短信，零成本） */
  mode: z.enum(['code', 'password']).optional().default('code'),
});

authRouter.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: '参数错误' });
  }
  const { method, identifier, name, code, password, mode } = parsed.data;

  if (method === 'phone') {
    if (!/^1\d{10}$/.test(identifier)) {
      return res.status(400).json({ status: 'error', message: '手机号格式不正确' });
    }

    if (mode === 'password') {
      // ===== 密码登录：纯数据库校验，不发短信、不花钱 =====
      if (!password) {
        return res.status(400).json({ status: 'error', message: '请输入密码' });
      }
      const user = findUserByPhone(identifier);
      if (!user || !user.passwordHash) {
        return res
          .status(400)
          .json({ status: 'error', message: '该手机号未注册，请先注册账号' });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(400).json({ status: 'error', message: '密码不正确' });
      }
      const token = createToken(user.id);
      return res.json({
        token,
        user: { id: user.id, name: user.name, method: user.method },
      });
    }

    // ===== 验证码登录 =====
    if (smsEnabled()) {
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

const registerSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/, '手机号格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(20, '密码最多 20 位'),
  name: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最长 20 个字').optional(),
  /** 短信已开通时，注册需验证码（防止用他人手机号乱注册） */
  code: z.string().optional(),
});

/** 注册账号（手机号 + 密码） */
authRouter.post('/register', (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: 'error', message: parsed.error.issues[0]?.message ?? '参数错误' });
  }
  const { phone, password, name, code } = parsed.data;

  if (smsEnabled()) {
    if (!code) {
      return res.status(400).json({ status: 'error', message: '请输入验证码' });
    }
    const check = verifySmsCode(phone, code);
    if (!check.ok) {
      return res.status(400).json({ status: 'error', message: check.message });
    }
  }

  try {
    const { user, upgraded } = registerWithPassword(phone, password, name);
    const token = createToken(user.id);
    return res.json({
      token,
      user: { id: user.id, name: user.name, method: user.method },
      /** true=此前用验证码登录过的老用户，本次只是补设了密码 */
      upgraded,
    });
  } catch (err) {
    return res.status(400).json({
      status: 'error',
      message: err instanceof Error ? err.message : '注册失败',
    });
  }
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

const passwordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(20, '密码最多 20 位'),
});

/** 设置 / 修改密码（需登录）。老用户（验证码登录过没密码的）可借此补设密码 */
authRouter.post('/password', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ status: 'error', message: '请先登录' });

  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ status: 'error', message: parsed.error.issues[0]?.message ?? '密码格式不正确' });
  }
  setUserPassword(user.id, parsed.data.password);
  return res.json({ status: 'ok' });
});
