import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Plus, Trash2, Moon, Music, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Story, StorySummary, TONE_LABELS, BG_SOUND_LABELS } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/button';

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

export default function History() {
  const nav = useNavigate();
  const { drafts, removeDraft } = useApp();

  /** 本地草稿即为历史（按创建时间倒序）；登录与否都不影响查看 */
  const items = useMemo(
    () =>
      Object.values(drafts)
        .map(toSummary)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [drafts],
  );

  const remove = (id: string) => {
    if (!confirm('确定删除这个故事吗？')) return;
    removeDraft(id);
    toast.success('已删除');
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
              <button className="block w-full text-left" onClick={() => nav(`/preview/${s.id}`)}>
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
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-destructive hover:bg-destructive/10"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="size-3.5" /> 删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}