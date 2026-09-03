import { cn } from '@/lib/utils';

export function PageDots({
  count,
  active,
  onSelect,
  className,
}: {
  count: number;
  active: number;
  onSelect?: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(i)}
          aria-label={`第 ${i + 1} 页`}
          className={cn(
            'h-2 rounded-full transition-all',
            i === active ? 'w-6 bg-primary' : 'w-2 bg-white/25 hover:bg-white/40'
          )}
        />
      ))}
    </div>
  );
}
