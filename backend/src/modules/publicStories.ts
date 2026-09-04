import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { upsertPublicStory, getPublicStory } from '../lib/store';

// 公开的故事分享接口（不需要登录）：
//  - POST /api/public/stories        保存一个故事（幂等 upsert），供分享链接读取
//  - GET  /api/public/stories/:id    按 id 读取故事，任何人可访问（分享场景）
// 说明：故事 id 是 UUID 不可猜，仅在用户主动分享链接时才被他人访问到。
export const publicStoriesRouter: Router = Router();

const publicStorySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    params: z
      .object({
        childName: z.string().optional(),
        tone: z.string().optional(),
        bgSound: z.string().optional(),
        duration: z.string().optional(),
      })
      .passthrough()
      .optional(),
    pages: z.array(z.any()),
    createdAt: z.string().optional(),
    approved: z.boolean().optional(),
  })
  .passthrough();

publicStoriesRouter.post('/', (req: Request, res: Response) => {
  const parsed = publicStorySchema.safeParse(req.body?.story);
  if (!parsed.success) {
    console.warn('[public-stories] validation failed', parsed.error.flatten());
    return res.status(400).json({ status: 'error', message: '故事数据格式错误' });
  }
  const st = parsed.data;
  upsertPublicStory({
    id: st.id,
    userId: 'public',
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
  return res.json({ id: st.id });
});

publicStoriesRouter.get('/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
  const s = getPublicStory(id);
  if (!s) return res.status(404).json({ status: 'error', message: '未找到故事' });
  return res.json({ story: s.data });
});
