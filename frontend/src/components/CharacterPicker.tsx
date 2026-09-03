import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { CHARACTER_LIBRARY } from '@/types/story';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function CharacterPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = useState('');

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((v) => v !== name));
    else onChange([...value, name]);
  };

  const addCustom = () => {
    const v = custom.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setCustom('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CHARACTER_LIBRARY.map((c) => {
          const active = value.includes(c);
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

      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          已选 {value.length} 个角色：{value.join('、')}
        </p>
      )}
    </div>
  );
}
