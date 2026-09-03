import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Baby,
  ImageIcon,
  Volume2,
  ShieldCheck,
  Cloud,
  ArrowRight,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StoryIllustration } from '@/lib/illustration';
import { IllustrationSpec } from '@/types/story';
import { useApp } from '@/store/AppStore';

const SAMPLE: IllustrationSpec = {
  seed: 20240902,
  palette: 'night',
  elements: ['moon', 'stars', 'cloud', 'friend'],
  mood: 'gentle',
  hasChild: true,
};

const FEATURES = [
  { icon: Baby, title: '专属定制', desc: '把宝宝的名字和喜欢的角色写进故事里，每个孩子都有自己的版本。' },
  { icon: ImageIcon, title: 'AI 生成插画', desc: '每页自动绘制柔和、适龄的睡前画风，随情节从夜色过渡到暖梦。' },
  { icon: Volume2, title: '轻柔语音朗读', desc: '可调语速、音量与背景音（细雨/海浪/心跳…），声音温柔不刺耳。' },
  { icon: ShieldCheck, title: '家长预览审核', desc: '生成后必须经过家长预览确认，内容适宜才会进入播放。' },
  { icon: Cloud, title: '云端同步历史', desc: '登录后故事与偏好自动保存，手机、电脑跨设备随时回看。' },
  { icon: Heart, title: '极简三步', desc: '填写偏好 → 一键生成 → 预览播放，睡前三步走完不折腾。' },
];

const STEPS = [
  { n: '1', t: '填写宝宝喜好', d: '名字、喜欢的角色，以及时长、语速、哄睡强度等参数。' },
  { n: '2', t: '一键生成', d: 'AI 自动生成故事 + 插画 + 轻柔语音，约 1 分钟内完成。' },
  { n: '3', t: '预览后播放', d: '家长检查确认，再放给宝宝听，可随时微调重新生成。' },
];

export default function Home() {
  const nav = useNavigate();
  const { auth } = useApp();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-4 sm:px-6">
      {/* Hero */}
      <section className="grid items-center gap-8 py-10 sm:py-16 lg:grid-cols-2">
        <div>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> 专为 0-3 岁宝宝打造的哄睡故事书
          </p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            给宝宝的
            <span className="text-primary"> AI 有声故事书</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
            输入宝宝名字与喜好，一键生成专属的睡前故事、柔和插画与轻柔朗读。
            家长预览确认后播放，让哄睡变得简单又安心。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-13 rounded-full bg-primary px-7 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20"
              onClick={() => nav('/create')}
            >
              开始制作故事 <ArrowRight className="size-5" />
            </Button>
            {!auth && (
              <Button
                size="lg"
                variant="secondary"
                className="rounded-full"
                onClick={() => nav('/login', { state: { next: '/history' } })}
              >
                登录同步历史
              </Button>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
            <StoryIllustration spec={SAMPLE} className="aspect-[4/3] w-full" />
          </div>
          <div className="absolute -bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-card/80 px-4 py-3 text-center text-sm font-semibold backdrop-blur">
            “朵朵揉了揉眼睛，小熊轻轻坐在她身边…”
          </div>
        </div>
      </section>

      {/* 功能 */}
      <section className="py-8">
        <h2 className="mb-6 text-center text-2xl font-extrabold">它能做什么</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
            >
              <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-8">
        <h2 className="mb-6 text-center text-2xl font-extrabold">三步哄睡不折腾</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-3xl border border-white/10 bg-card/50 p-6 text-center"
            >
              <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/20 text-xl font-extrabold text-primary">
                {s.n}
              </span>
              <h3 className="text-lg font-bold">{s.t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 text-center">
        <Button
          size="lg"
          className="h-14 rounded-full bg-primary px-10 text-base font-bold text-primary-foreground"
          onClick={() => nav('/create')}
        >
          <Sparkles className="size-5" /> 现在就为宝宝做一个故事
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          无需下载 App · 手机电脑都能用 · 生成内容均经过家长预览
        </p>
      </section>
    </div>
  );
}
