import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getPreferences, setPreferences } from '../lib/store';
import { getUserFromRequest } from '../middleware/auth';

export const preferencesRouter: Router = Router();

preferencesRouter.use((req: Request, res: Response, next: NextFunction) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ status: 'error', message: '请先登录' });
  (req as any).user = user;
  return next();
});

const schema = z
  .object({
    childName: z.string().optional(),
    characters: z.array(z.string()).optional(),
    lastParams: z.record(z.unknown()).optional(),
  })
  .passthrough();

preferencesRouter.get('/', (req: Request, res: Response) => {
  const user = (req as any).user;
  const prefs = getPreferences(user.id);
  return res.json({
    preferences: prefs ?? { childName: '', characters: [], lastParams: {} },
  });
});

preferencesRouter.put('/', (req: Request, res: Response) => {
  const user = (req as any).user;
  const parsed = schema.safeParse(req.body?.preferences);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', message: '参数错误' });
  }
  const p = parsed.data;
  setPreferences(user.id, {
    childName: p.childName ?? '',
    characters: p.characters ?? [],
    lastParams: p.lastParams ?? {},
  });
  return res.json({ ok: true });
});
