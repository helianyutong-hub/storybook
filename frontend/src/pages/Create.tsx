import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  Clock,
  Gauge,
  Volume2,
  Droplets,
  Waves,
  Wind,
  Heart,
  Music,
  Leaf,
  Baby,
  Wand2,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  StoryParams,
  StoryLang,
  Duration,
  Pace,
  BgSound,
  SoothingTone,
  DURATION_LABELS,
  PACE_LABELS,
  BG_SOUND_LABELS,
  TONE_LABELS,
  LANG_LABELS,
} from '@/types/story';
import { useApp } from '@/store/AppStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CharacterPicker } from '@/components/CharacterPicker';
import { Segmented } from '@/components/Segmented';

export default function Create() {
  const nav = useNavigate();
  const loc = useLocation();
  const { lastParams, setLastParams } = useApp();

  const incoming = (loc.state as { params?: StoryParams } | null)?.params;
  const [params, setParams] = useState<StoryParams>({
    childName: incoming?.childName ?? lastParams.childName ?? '',
    characters: incoming?.characters ?? lastParams.characters ?? [],
    duration: incoming?.duration ?? lastParams.duration ?? 'medium',
    pace: incoming?.pace ?? lastParams.pace ?? 'slow',
    volume: incoming?.volume ?? lastParams.volume ?? 0.8,
    bgSound: incoming?.bgSound ?? lastParams.bgSound ?? 'rain',
    soothing: incoming?.soothing ?? lastParams.soothing ?? 70,
    tone: incoming?.tone ?? lastParams.tone ?? 'gentle',
    lang: incoming?.lang ?? lastParams.lang ?? 'zh',
  });

  const set = <K extends keyof StoryParams>(k: K, v: StoryParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  const canGenerate = true; // 名字可为空，默认“宝宝”

  const submit = () => {
    setLastParams(params);
    toast.success('开始为宝宝编织故事…');
    nav('/generating', { state: { params } });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-6 text-center">
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          <Wand2 className="size-3.5" /> 第 1 步 · 填写哄睡偏好
        </p>
        <h1 className="text-2xl font-extrabold sm:text-3xl">为宝宝定制专属故事</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          填写下面的信息，AI 会自动生成贴合宝宝的故事、插画与轻柔朗读。
        </p>
      </div>

      <div className="space-y-4">
        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Baby className="size-4 text-primary" /> 宝宝信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">宝宝名字</label>
              <Input
                value={params.childName}
                onChange={(e) => set('childName', e.target.value)}
                placeholder="例如：朵朵（留空则默认“宝宝”）"
                className="rounded-2xl bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">喜欢的角色</label>
              <CharacterPicker value={params.characters} onChange={(v) => set('characters', v)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" /> 故事时长
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Segmented<Duration>
              value={params.duration}
              onChange={(v) => set('duration', v)}
              options={[
                { value: 'short', label: DURATION_LABELS.short },
                { value: 'medium', label: DURATION_LABELS.medium },
                { value: 'long', label: DURATION_LABELS.long },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-primary" /> 哄睡强度
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">轻柔安抚</span>
              <span className="font-bold text-primary">
                {params.soothing < 40 ? '轻松' : params.soothing < 70 ? '适中' : '深度哄睡'}
              </span>
              <span className="text-muted-foreground">深度催眠</span>
            </div>
            <Slider
              value={[params.soothing]}
              min={0}
              max={100}
              step={5}
              onValueChange={(e) => set('soothing', e[0])}
              className="py-2"
            />
            <p className="text-xs text-muted-foreground">
              强度越高，故事收尾越安静、越容易让宝宝沉入梦乡。
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-primary" /> 语速
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Segmented<Pace>
                value={params.pace}
                onChange={(v) => set('pace', v)}
                options={[
                  { value: 'slow', label: PACE_LABELS.slow },
                  { value: 'normal', label: PACE_LABELS.normal },
                  { value: 'bright', label: PACE_LABELS.bright },
                ]}
              />
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Leaf className="size-4 text-primary" /> 故事基调
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Segmented<SoothingTone>
                value={params.tone}
                onChange={(v) => set('tone', v)}
                columns={2}
                options={[
                  { value: 'gentle', label: TONE_LABELS.gentle },
                  { value: 'playful', label: TONE_LABELS.playful },
                  { value: 'calm', label: TONE_LABELS.calm },
                  { value: 'lullaby', label: TONE_LABELS.lullaby },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Volume2 className="size-4 text-primary" /> 播放设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold">朗读音量</span>
                <span className="text-muted-foreground">{Math.round(params.volume * 100)}%</span>
              </div>
              <Slider
                value={[Math.round(params.volume * 100)]}
                min={0}
                max={100}
                step={5}
                onValueChange={(e) => set('volume', e[0] / 100)}
                className="py-2"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">背景音效</label>
              <Segmented<BgSound>
                value={params.bgSound}
                onChange={(v) => set('bgSound', v)}
                columns={3}
                options={[
                  { value: 'none', label: BG_SOUND_LABELS.none, icon: <Leaf className="size-4" /> },
                  { value: 'rain', label: BG_SOUND_LABELS.rain, icon: <Droplets className="size-4" /> },
                  { value: 'waves', label: BG_SOUND_LABELS.waves, icon: <Waves className="size-4" /> },
                  { value: 'wind', label: BG_SOUND_LABELS.wind, icon: <Wind className="size-4" /> },
                  { value: 'heartbeat', label: BG_SOUND_LABELS.heartbeat, icon: <Heart className="size-4" /> },
                  { value: 'music', label: BG_SOUND_LABELS.music, icon: <Music className="size-4" /> },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4 text-primary" /> 朗读语言
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Segmented<StoryLang>
              value={params.lang}
              onChange={(v) => set('lang', v)}
              options={[
                { value: 'zh', label: LANG_LABELS.zh },
                { value: 'en', label: LANG_LABELS.en },
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              选择后故事文案与语音朗读都会使用对应语言。
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Button
          size="lg"
          disabled={!canGenerate}
          onClick={submit}
          className="h-14 rounded-full bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
        >
          <Sparkles className="size-5" /> 一键生成故事
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          生成约 1 分钟内完成 · 生成后需家长预览确认，才会进入播放
        </p>
      </div>
    </div>
  );
}
