import { Story } from '@/types/story';
import { StoryIllustration } from '@/lib/illustration';
import { cn } from '@/lib/utils';

export function StorybookViewer({
  story,
  pageIndex,
  showText = true,
  rounded = 'rounded-3xl',
  className,
}: {
  story: Story;
  pageIndex: number;
  showText?: boolean;
  rounded?: string;
  className?: string;
}) {
  const page = story.pages[pageIndex];
  if (!page) return null;
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className={cn('relative overflow-hidden border border-white/10 shadow-xl', rounded)}>
        <StoryIllustration spec={page.illustration} className="aspect-[4/3] w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
        {showText && (
          <p
            key={page.id}
            className="rise-in absolute inset-x-0 bottom-0 p-5 text-center text-lg font-semibold leading-relaxed text-white drop-shadow sm:text-xl"
          >
            {page.text}
          </p>
        )}
      </div>
    </div>
  );
}
