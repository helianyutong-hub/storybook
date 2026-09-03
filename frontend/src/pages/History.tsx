import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Plus, Trash2, Moon, Music, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { StorySummary, TONE_LABELS, BG_SOUND_LABELS } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { listStories, deleteStory } from '@/lib/api';
import { Button } from '@/components/ui/button';

function fmt(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function History() {
  const nav = useNavigate();
  const { auth } = useApp();
  const [items, setItems] = useState<StorySummary[] | null>(null);

  useEffect(() => {
    if (!auth) {
      nav('/login', { state: { next: '/history' }, replace: true });
      return;
    }
    listStories()
      .then(setItems)
      .catch(() => {
        // 静默失败：没有数据时只显示空状态，不弹顶部红色报错
        setItems([]);
      });
  }, [auth, nav]);

  const remove = async (id: string) => {
    if (!confirm('确定删除这个故事吗？')) return;
    try {
      await deleteStory(id);
      setItems((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  if (!auth) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <HistoryIcon className="size-6 text-primary" /> 我的故事历史
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">登录账号后，故事会自动云端保存，跨设备都能看到。</p>
        </div>
        <Button className="rounded-full" onClick={() => nav('/create')}>
          <Plus className="size-4" /> 新建
        </Button>
      </div>

      {items === null ? (
        <div className="py-20 text-center text-muted-foreground">读取中…</div>
      ) : items.length === 0 ? (
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
