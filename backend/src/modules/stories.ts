import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { upsertStory, listStories, getStory, deleteStory } from '../lib/store';
import { getUserFromRequest } from '../middleware/auth';
import { generateStoryAudio } from '../lib/tts';

export const storiesRouter: Router = Router();

// 所有故事接口需登录
storiesRouter.use((req: Request, res: Response, next: NextFunction) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ status: 'error', message: '请先登录' });
  (req as any).user = user;
  return next();
});

const storySchema = z
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

storiesRouter.get('/', (req: Request, res: Response) => {
  const user = (req as any).user;
  const list = listStories(user.id).map((s) => ({
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

storiesRouter.post('/', (req: Request, res: Response) => {
  const user = (req as any).user;
  const parsed = storySchema.safeParse(req.body?.story);
  if (!parsed.success) {
    console.warn('[stories] validation failed', parsed.error.flatten());
    return res.status(400).json({ status: 'error', message: '故事数据格式错误' });
  }
  const st = parsed.data;
  upsertStory({
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
  generateStoryAudio(pages, ttsLang).then((urls) => {
    if (urls.some(Boolean)) {
      const existing = getStory(st.id, user.id);
      if (existing) {
        const data = existing.data as Record<string, unknown>;
        data.audioUrls = urls;
        upsertStory(existing);
      }
    }
  }).catch((err) => {
    console.warn('[stories] TTS generation failed', err);
  });

  return res.json({ id: st.id });
});

storiesRouter.get('/:id', (req: Request, res: Response) => {
  const user = (req as any).user;
  const id = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
  const s = getStory(id, user.id);
  if (!s) return res.status(404).json({ status: 'error', message: '未找到故事' });
  return res.json({ story: s.data });
});

storiesRouter.delete('/:id', (req: Request, res: Response) => {
  const user = (req as any).user;
  const id = typeof req.params.id === 'string' ? req.params.id : String(req.params.id);
  const ok = deleteStory(id, user.id);
  if (!ok) return res.status(404).json({ status: 'error', message: '未找到故事' });
  return res.json({ ok: true });
});
