import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  className?: string;
}) {
  const cols = columns ?? options.length;
  return (
    <div
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(${Math.min(cols, options.length)}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-all',
              active
                ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_0_3px_rgba(246,201,123,0.12)]'
                : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground'
            )}
          >
            {o.icon}
            <span className="text-center leading-tight">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
