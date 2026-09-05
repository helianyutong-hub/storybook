import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Plus, Trash2, Moon, Music, Clock, Share2, Copy, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Story, StorySummary, TONE_LABELS, BG_SOUND_LABELS } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/button';
import { savePublicStory } from '@/lib/api';

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** 把 Story 转成 History 列表用的 StorySummary（不再依赖云端） */
function toSummary(s: Story): StorySummary {
  return {
    id: s.id,
    title: s.title,
    childName: s.params.childName || '宝宝',
    tone: s.params.tone,
    bgSound: s.params.bgSound,
    duration: s.params.duration,
    pageCount: s.pages.length,
    createdAt: s.createdAt,
    approved: !!s.approved,
  };
}

/**
 * 故事「内容指纹」：同一套参数 + 标题 + 页数 即视为同一个故事内容。
 * 反复进入同一故事预览页、或重复用相同参数新建时，历史只保留最新一条，避免重复堆叠。
 */
function storyContentKey(s: Story): string {
  const p = s.params;
  return [
    s.title,
    p.childName ?? '',
    (p.characters ?? []).join(','),
    p.tone ?? '',
    p.duration ?? '',
    p.soothing ?? '',
    p.lang ?? '',
    p.pace ?? '',
    p.bgSound ?? '',
    s.pages.length,
  ].join('|');
}

/** 构造故事分享完整链接（适配 GitHub Pages 子路径或根路径部署） */
function buildShareUrl(storyId: string): string {
  if (typeof window === 'undefined') return '';
  const base = window.location.origin;
  const sub = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${sub}/preview/${storyId}`;
}

export default function History() {
  const nav = useNavigate();
  const { drafts, removeDraft } = useApp();
  /**
   * 当前正在等待二次确认删除的故事 id。
   * 用 React 状态 + 自定义确认条实现，避免 window.confirm 在微信 X5 内核被劫持成「关闭网页」。
   */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** 当前正在展示分享条的卡片 id */
  const [shareStoryId, setShareStoryId] = useState<string | null>(null);
  /** 当前正在上传分享/复制链接的卡片 id */
  const [sharingId, setSharingId] = useState<string | null>(null);
  /** 复制成功后短暂提示的卡片 id */
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /** 本地草稿即为历史（按内容去重、只留最新一条，再按创建时间倒序）；登录与否都不影响查看 */
  const items = useMemo(() => {
    const latest = new Map<string, Story>();
    for (const s of Object.values(drafts)) {
      const key = storyContentKey(s);
      const cur = latest.get(key);
      if (!cur || s.createdAt > cur.createdAt) latest.set(key, s);
    }
    return Array.from(latest.values())
      .map(toSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [drafts]);

  const startShare = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDeleteId(null); // 展开分享时关闭删除确认
    setShareStoryId(id);
  };
  const closeShare = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setShareStoryId(null);
  };

  const startDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setShareStoryId(null); // 展开删除确认时关闭分享条
    setConfirmDeleteId(id);
  };
  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDeleteId(null);
  };
  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const target = drafts[id];
    if (!target) {
      setConfirmDeleteId(null);
      toast.error('故事不存在或已删除');
      return;
    }
    setDeletingId(id);
    removeDraft(id);
    setConfirmDeleteId(null);
    setDeletingId(null);
    toast.success('已删除');
  };

  /** 确保故事已上传到公开分享区 */
  const ensureShared = async (id: string): Promise<boolean> => {
    const full = drafts[id];
    if (!full) {
      toast.error('故事不存在或已删除');
      return false;
    }
    try {
      await savePublicStory(full);
      return true;
    } catch {
      toast.error('分享上传失败，请稍后重试');
      return false;
    }
  };

  /** 复制分享链接 */
  const copyShareLink = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSharingId(id);
    const ok = await ensureShared(id);
    setSharingId(null);
    if (!ok) return;
    const url = buildShareUrl(id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      toast.success('链接已复制，去微信发给好友吧');
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      toast.error('复制失败，请长按链接手动复制');
    }
  };

  /** 调用系统分享，不支持则落回复制链接 */
  const shareToFriend = async (e: React.MouseEvent, id: string, title: string, childName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSharingId(id);
    const ok = await ensureShared(id);
    setSharingId(null);
    if (!ok) return;
    const url = buildShareUrl(id);
    const shareData: ShareData = {
      title,
      text: `宝宝专属睡前故事：${title}（${childName || '宝宝'}）`,
      url,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator && navigator.canShare?.(shareData) !== false) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* 用户取消或不支持，落回复制 */
      }
    }
    await copyShareLink(e, id);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <HistoryIcon className="size-6 text-primary" /> 我的故事历史
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每次创作的故事都会自动保存到本地历史，方便随时回看和播放。
          </p>
        </div>
        <Button className="rounded-full" onClick={() => nav('/create')}>
          <Plus className="size-4" /> 新建
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] py-20 text-center">
          <Moon className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-muted-foreground">还没有保存的故事。</p>
          <Button className="mt-4 rounded-full" onClick={() => nav('/create')}>
            做一个故事
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="group rounded-3xl border border-white/10 bg-card/50 p-4 transition-colors hover:bg-card"
            >
              <button
                className="block w-full text-left"
                onClick={() => {
                  if (confirmDeleteId === s.id) {
                    setConfirmDeleteId(null);
                    return;
                  }
                  if (shareStoryId === s.id) {
                    setShareStoryId(null);
                    return;
                  }
                  nav(`/preview/${s.id}`);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{s.title}</h3>
                  {!s.approved && (
                    <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      未播放
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  宝宝：{s.childName} · {s.pageCount} 页
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                    <Clock className="size-3" /> {fmt(s.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                    {TONE_LABELS[s.tone]}
                  </span>
                  {s.bgSound !== 'none' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                      <Music className="size-3" /> {BG_SOUND_LABELS[s.bgSound]}
                    </span>
                  )}
                </div>
              </button>
              {confirmDeleteId === s.id ? (
                // 二次确认条：避免 window.confirm 在微信浏览器被劫持成「关闭网页」
                <div
                  className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-destructive/30 bg-destructive/[0.08] px-3 py-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-medium text-destructive">确定删除这个故事吗？</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-3"
                      onClick={cancelDelete}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 rounded-full bg-destructive px-3 text-xs text-destructive-foreground hover:bg-destructive/90"
                      disabled={deletingId === s.id}
                      onClick={(e) => confirmDelete(e, s.id)}
                    >
                      {deletingId === s.id ? '删除中…' : '删除'}
                    </Button>
                  </div>
                </div>
              ) : shareStoryId === s.id ? (
                // 分享条：上传公开分享区 + 复制链接/系统分享
                <div
                  className="mt-3 rounded-2xl border border-primary/30 bg-primary/[0.08] px-3 py-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-primary">分享给好友</span>
                    <button
                      onClick={(e) => closeShare(e)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-white/5"
                      aria-label="关闭"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="mb-2 break-all rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {buildShareUrl(s.id)}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 flex-1 rounded-full text-primary hover:bg-primary/10"
                      disabled={sharingId === s.id}
                      onClick={(e) => copyShareLink(e, s.id)}
                    >
                      {copiedId === s.id ? (
                        <>
                          <Check className="size-3.5" /> 已复制
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> 复制链接
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 flex-1 rounded-full text-primary hover:bg-primary/10"
                      disabled={sharingId === s.id}
                      onClick={(e) => shareToFriend(e, s.id, s.title, s.childName)}
                    >
                      <Share2 className="size-3.5" /> 转发
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-primary hover:bg-primary/10"
                    disabled={deletingId === s.id}
                    onClick={(e) => startShare(e, s.id)}
                  >
                    <Share2 className="size-3.5" /> 分享
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-destructive hover:bg-destructive/10"
                    disabled={deletingId === s.id}
                    onClick={(e) => startDelete(e, s.id)}
                  >
                    <Trash2 className="size-3.5" /> 删除
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}