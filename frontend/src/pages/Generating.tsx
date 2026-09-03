import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, PenLine, ImageIcon, AudioLines, Check } from 'lucide-react';
import { toast } from 'sonner';
import { StoryParams } from '@/types/story';
import { generateStory, buildStoryFromLLM } from '@/lib/storyEngine';
import { generateStoryViaLLM, ensureStoryAudioUrls } from '@/lib/api';
import { useApp } from '@/store/AppStore';

const STEPS = [
  { key: 'plot', label: '构思专属情节', icon: PenLine },
  { key: 'art', label: '绘制睡前插画', icon: ImageIcon },
  { key: 'voice', label: '合成轻柔语音', icon: AudioLines },
];

export default function Generating() {
  const nav = useNavigate();
  const loc = useLocation();
  const { setDraft, lastParams } = useApp();
  const [step, setStep] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = ((loc.state as { params?: StoryParams } | null)?.params ??
      lastParams) as StoryParams;

    if (!params || !params.duration) {
      nav('/create', { replace: true });
      return;
    }

    // 步骤动画（纯视觉反馈）
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 1400);

    let done = false;
    const finish = (story: ReturnType<typeof generateStory>) => {
      if (done) return;
      done = true;
      setStep(3);
      setDraft(story);
      // ===== 关键优化：故事生成完毕后立即开始预生成所有页语音 =====
      // 用户看到「合成轻柔语音 ✓ 完成」动画的同时，音频已经在后台跑了
      // 等用户进入预览/播放页时，音频可能已经好了（localStorage 缓存）
      // 不 await、不阻塞导航，失败也静默忽略（Preview/Player 页会兜底重试）
      ensureStoryAudioUrls(story)
        .then((urls) => {
          if (urls?.some(Boolean)) {
            // 更新 draft 中的 audioUrls（Preview/Player 会自动读取）
            // 用 setTimeout 避免在 React 渲染周期内 setState
            setTimeout(() => setDraft({ ...story, audioUrls: urls }), 0);
          }
        })
        .catch(() => {});
      setTimeout(() => nav(`/preview/${story.id}`, { replace: true }), 800);
    };

    // 优先用大模型生成完整情节（需求 1 + 需求 4 动态页数）；
    // 未配置密钥 / 调用失败 / 超时 则回退本地模板引擎，保证可用。
    void (async () => {
      try {
        const res = await generateStoryViaLLM(params);
        if (res.enabled && !res.fallback && res.pages && res.pages.length >= 3) {
          finish(buildStoryFromLLM({ title: res.title ?? '', pages: res.pages }, params));
          return;
        }
        if (res.enabled && res.fallback) {
          toast('大模型生成暂不可用，已用本地模板生成');
        }
      } catch {
        /* 网络异常，走下面回退 */
      }
      finish(generateStory(params));
    })();

    // 安全兜底：大模型卡住时 30s 内强制回退，避免一直转圈
    const safety = setTimeout(() => {
      if (!done) finish(generateStory(params));
    }, 30000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-10 grid size-40 place-items-center">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="genie-twinkle absolute size-2 rounded-full bg-star"
            style={{
              top: `${10 + Math.sin((i / 6) * Math.PI * 2) * 38 + 50}%`,
              left: `${10 + Math.cos((i / 6) * Math.PI * 2) * 38 + 50}%`,
              animationDelay: `${i * 0.25}s`,
            }}
          />
        ))}
        <Moon className="size-20 text-primary drop-shadow-[0_0_30px_rgba(246,201,123,0.5)]" />
      </div>

      <h2 className="text-xl font-bold">正在为宝宝编织故事…</h2>
      <p className="mt-2 text-sm text-muted-foreground">AI 正结合宝宝的名字与喜好，温柔地生成每一页</p>

      <div className="mt-10 w-full max-w-sm space-y-3 text-left">
        {STEPS.map((s, i) => {
          const done = step > i + 1;
          const active = step === i + 1;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
                active
                  ? 'border-primary/50 bg-primary/10'
                  : done
                    ? 'border-white/10 bg-white/[0.03]'
                    : 'border-white/5 bg-transparent opacity-50'
              }`}
            >
              <span
                className={`grid size-9 place-items-center rounded-full ${
                  done ? 'bg-primary text-primary-foreground' : active ? 'bg-primary/20 text-primary' : 'bg-white/5'
                }`}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="font-semibold">{s.label}</span>
              {active && <span className="ml-auto text-xs text-primary">进行中…</span>}
              {done && <span className="ml-auto text-xs text-muted-foreground">完成</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
