import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { CHARACTER_LIBRARY } from '@/types/story';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StoryIllustration } from '@/lib/illustration';
import { kindFromName } from '@/lib/storyEngine';

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return Math.abs(h) % 1_000_000 + 1;
}

export function CharacterPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState('');
  // 用户新增过的自定义角色池：即使取消选中也会保留，方便反复选择；删除后才会真正消失
  const [customPool, setCustomPool] = useState<string[]>(() =>
    value.filter((v) => !CHARACTER_LIBRARY.includes(v))
  );

  // 外部传入的 value 变化时，自动把不在系统库的角色补进 customPool（防丢失）
  useEffect(() => {
    setCustomPool((prev) => {
      const extra = value.filter((v) => !CHARACTER_LIBRARY.includes(v) && !prev.includes(v));
      return extra.length ? [...prev, ...extra] : prev;
    });
  }, [value]);

  const isActive = (name: string) => value.includes(name);

  const toggle = (name: string) => {
    onChange(isActive(name) ? value.filter((v) => v !== name) : [...value, name]);
  };

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;

    // 输入的是系统库角色：直接选中即可
    if (CHARACTER_LIBRARY.includes(v)) {
      if (!isActive(v)) onChange([...value, v]);
      setCustom('');
      return;
    }

    // 新自定义角色：加入池子并默认选中
    if (!customPool.includes(v)) setCustomPool([...customPool, v]);
    if (!isActive(v)) onChange([...value, v]);
    setCustom('');
  };

  const removeCustom = (name: string) => {
    setCustomPool((prev) => prev.filter((c) => c !== name));
    onChange(value.filter((v) => v !== name));
  };

  return (
    <div className="space-y-3">
      {/* 系统默认角色 */}
      <div className="flex flex-wrap gap-2">
        {CHARACTER_LIBRARY.map((c) => {
          const active = isActive(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                active
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07]'
              )}
            >
              {active && <Check className="size-3.5" />}
              {c}
            </button>
          );
        })}
      </div>

      {/* 自定义添加输入 */}
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          placeholder="添加宝宝喜欢的其他角色…"
          className="rounded-full bg-white/[0.04]"
        />
        <Button type="button" variant="secondary" size="icon" className="rounded-full" onClick={addCustom}>
          <Plus className="size-4" />
        </Button>
      </div>

      {/* 已添加的自定义角色池：一直显示，可反复选/取消，可删除 */}
      {customPool.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">已添加的自定义角色（点击选中/取消，按 × 删除）：</p>
          <div className="flex flex-wrap gap-2">
            {customPool.map((c) => {
              const active = isActive(c);
              return (
                <div
                  key={c}
                  className={cn(
                    'group flex items-center gap-1 rounded-full border text-sm font-medium transition-all',
                    active
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07]'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    className="flex items-center gap-1 px-3 py-1.5"
                  >
                    {active && <Check className="size-3.5" />}
                    {c}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustom(c)}
                    className="mr-1.5 grid size-5 place-items-center rounded-full bg-white/10 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                    aria-label={`删除 ${c}`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 已选提示 */}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          已选 {value.length} 个角色：{value.join('、')}
        </p>
      )}

      {/* 角色插画预览：自动识别关键词，显示会画成什么动物 */}
      {value.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">角色预览（AI 会尽量按这个角色画插画）</p>
          <div className="flex flex-wrap gap-3">
            {value.slice(0, 6).map((c) => {
              const kind = kindFromName(c);
              return (
                <div key={c} className="flex w-[72px] flex-col items-center gap-1.5">
                  <StoryIllustration
                    spec={{
                      seed: hashName(c),
                      palette: 'night',
                      elements: ['friend'],
                      mood: 'gentle',
                      hasChild: false,
                      friendKind: kind ?? 'bear',
                    }}
                    className="h-14 w-20 rounded-xl border border-white/10 bg-[#1a1535]"
                  />
                  <span className="max-w-full truncate px-0.5 text-center text-[10px] text-muted-foreground">
                    {c}
                  </span>
                  {kind ? (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                      已识别
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      通用形象
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
