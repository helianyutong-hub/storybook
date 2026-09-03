import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  Wand2,
  ShieldCheck,
  Cloud,
  Sparkles,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PACE_RATE, TONE_LABELS, BG_SOUND_LABELS, DURATION_LABELS } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { speak, cancelSpeech, isTTSAvailable } from '@/lib/tts';
import { getBgSound } from '@/lib/bgSound';
import { saveStory, ensureAudioUrl, ensureStoryAudioUrls } from '@/lib/api';
import { getErrorMessage } from '@/lib/api-client';
import { regenerateStoryText } from '@/lib/storyEngine';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StorybookViewer } from '@/components/StorybookViewer';
import { PageDots } from '@/components/PageDots';

export default function Preview() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getDraft, updateDraft, auth } = useApp();

  const story = id ? getDraft(id) : undefined;
  const [page, setPage] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [bgOn, setBgOn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regen, setRegen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const autoPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const bg = useMemo(() => (story ? getBgSound() : null), [story]);

  useEffect(() => {
    return () => {
      autoPlayingRef.current = false;
      cancelSpeech();
      bg?.stop();
    };
  }, [bg]);

  if (!story) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-muted-foreground">没有找到这个故事，可能已被清除。</p>
        <Button className="mt-4 rounded-full" onClick={() => nav('/create')}>
          重新制作
        </Button>
      </div>
    );
  }

  const previewSpeak = async () => {
    if (speaking) {
      cancelSpeech();
      audioRef.current?.pause();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);

    // 若已有服务端音频，优先用 <audio> 播放（微信兼容）；否则按需生成
    let audioUrl = story.audioUrls?.[page];
    const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';
    if (!audioUrl) {
      setPreparing(true);
      audioUrl = await ensureAudioUrl(story.pages[page].text, lang).finally(() =>
        setPreparing(false),
      );
      if (audioUrl) {
        const urls = [...(story.audioUrls ?? [])];
        urls[page] = audioUrl;
        updateDraft(story.id, { audioUrls: urls });
      }
    }
    if (audioUrl && audioRef.current) {
      const audio = audioRef.current;
      audio.volume = story.params.volume;
      audio.src = audioUrl;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeaking(false);
      };
      try {
        await audio.play();
      } catch {
        setSpeaking(false);
      }
      return;
    }

    await speak(story.pages[page].text, {
      rate: PACE_RATE[story.params.pace],
      volume: story.params.volume,
    });
    setSpeaking(false);
  };

  const regenerate = async () => {
    if (regen) return;
    setRegen(true);
    const newPages = regenerateStoryText(story);
    const updated = { ...story, pages: newPages, audioUrls: [] as (string | null)[] };
    updateDraft(story.id, { pages: newPages, audioUrls: [] });
    setSpeaking(false);
    setAutoPlaying(false);
    autoPlayingRef.current = false;
    audioRef.current?.pause();
    toast.success('已重新生成故事文案');
    // 预热语音（失败不影响阅读）
    ensureStoryAudioUrls(updated)
      .then((urls) => updateDraft(story.id, { audioUrls: urls }))
      .catch(() => {})
      .finally(() => setRegen(false));
  };

  // 需求 3：点一次「自动播放全部」，顺序播放所有页语音并自动翻页，可随时停止
  const stopAll = () => {
    autoPlayingRef.current = false;
    setAutoPlaying(false);
    cancelSpeech();
    audioRef.current?.pause();
  };

  const playAll = async () => {
    if (autoPlayingRef.current) {
      stopAll();
      return;
    }
    autoPlayingRef.current = true;
    setAutoPlaying(true);
    setSpeaking(false);
    cancelSpeech();
    const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';

    for (let i = 0; i < story.pages.length; i++) {
      if (!autoPlayingRef.current) break;
      setPage(i);
      // 等页面切换渲染（插画/文本）后再朗读
      await new Promise((r) => setTimeout(r, 250));
      if (!autoPlayingRef.current) break;

      const text = story.pages[i].text;
      let url = story.audioUrls?.[i];
      if (!url) {
        url = await ensureAudioUrl(text, lang);
        if (url) {
          const urls = [...(story.audioUrls ?? [])];
          urls[i] = url;
          updateDraft(story.id, { audioUrls: urls });
        }
      }

      if (url && audioRef.current) {
        await new Promise<void>((resolve) => {
          const audio = audioRef.current!;
          audio.volume = story.params.volume;
          audio.src = url!;
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.play().then(() => {}).catch(() => resolve());
        });
      } else {
        // 微信/不支持服务端音频时回退浏览器原生语音
        await new Promise<void>((resolve) => {
          speak(text, {
            rate: PACE_RATE[story.params.pace],
            volume: story.params.volume,
            onEnd: () => resolve(),
          });
        });
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    autoPlayingRef.current = false;
    setAutoPlaying(false);
  };

  const toggleBg = () => {
    if (!bg) return;
    bg.resume();
    if (bgOn) {
      bg.stop();
      setBgOn(false);
    } else {
      bg.play(story.params.bgSound, story.params.volume * 0.5);
      setBgOn(true);
    }
  };

  const goPlay = () => {
    if (!agreed) {
      toast.error('请先完成家长预览确认');
      return;
    }
    cancelSpeech();
    bg?.stop();
    updateDraft(story.id, { approved: true });
    // 后台提前把整本语音一次性生成好，进入播放页即可直接播放（不阻塞跳转）
    ensureStoryAudioUrls({ ...story, approved: true })
      .then((urls) => updateDraft(story.id, { audioUrls: urls }))
      .catch(() => {});
    nav(`/player/${story.id}`);
  };

  const save = async () => {
    if (!auth) {
      toast('登录后即可把故事保存到云端同步', { action: { label: '去登录', onClick: () => nav('/login', { state: { next: `/preview/${story.id}` } }) } });
      return;
    }
    setSaving(true);
    try {
      await saveStory({ ...story, approved: agreed });
      setSaved(true);
      toast.success('已保存到云端，可跨设备查看');
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg?.includes('401') || msg?.includes('登录') || msg?.includes('Unauthorized')) {
        toast.error('登录状态已过期，请重新登录后保存', {
          action: { label: '去登录', onClick: () => nav('/login', { state: { next: `/preview/${story.id}` } }) },
        });
      } else {
        toast.error(`保存失败：${msg || '请稍后再试'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
      <audio ref={audioRef} preload="none" className="hidden" playsInline />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">第 2 步 · 家长预览审核</p>
          <h1 className="text-xl font-extrabold sm:text-2xl">{story.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={regenerate}
            disabled={regen}
          >
            <RefreshCw className={regen ? 'size-4 animate-spin' : 'size-4'} />
            {regen ? '生成中…' : '重新生成文案'}
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => nav('/create', { state: { params: story.params } })}>
            <Wand2 className="size-4" /> 调整参数
          </Button>
          <Button variant="secondary" className="rounded-full" onClick={save} disabled={saving || saved}>
            {saved ? <ShieldCheck className="size-4" /> : <Cloud className="size-4" />}
            {saved ? '已保存' : '保存到云端'}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* 故事书预览 */}
        <div>
          <StorybookViewer story={story} pageIndex={page} className="w-full" />
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft />
            </Button>
            <PageDots count={story.pages.length} active={page} onSelect={setPage} />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              disabled={page === story.pages.length - 1}
              onClick={() => setPage((p) => Math.min(story.pages.length - 1, p + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            第 {page + 1} / {story.pages.length} 页 · {story.pages[page].scene}
          </p>
        </div>

        {/* 家长控制台 */}
        <div className="space-y-4">
          <Card className="border-white/10 bg-card/60">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm font-semibold">试听与检查</p>
              <Button
                onClick={playAll}
                className="w-full rounded-full"
                variant={autoPlaying ? 'secondary' : 'default'}
              >
                {autoPlaying ? (
                  <>
                    <Pause className="size-4" /> 停止播放
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> 自动播放全部（自动翻页）
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={previewSpeak}
                  className="flex-1 rounded-full"
                  disabled={preparing || autoPlaying}
                >
                  {preparing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : speaking ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {preparing ? '云端语音生成中…' : speaking ? '停止试听' : '试听这一页'}
                </Button>
                <Button
                  variant={bgOn ? 'default' : 'secondary'}
                  className="rounded-full"
                  onClick={toggleBg}
                  disabled={story.params.bgSound === 'none' || autoPlaying}
                >
                  <Volume2 className="size-4" />
                  {bgOn ? '关闭背景音' : '试听背景音'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                试听与播放的语音由云端逐页生成并缓存，需要保持网络连接；
                某一页首次生成可能需要等待几秒，生成后即可重复播放。
              </p>
              {!isTTSAvailable() && (
                <p className="text-xs text-muted-foreground">
                  当前浏览器不支持语音朗读，请在手机或电脑的 Chrome / Safari 中打开以获得朗读体验。
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/60">
            <CardContent className="space-y-2 p-5 text-sm">
              <p className="mb-1 font-semibold">故事参数</p>
              <Row k="宝宝" v={story.params.childName || '宝宝'} />
              <Row k="角色" v={story.params.characters.join('、') || '—'} />
              <Row k="时长" v={DURATION_LABELS[story.params.duration]} />
              <Row k="基调" v={TONE_LABELS[story.params.tone]} />
              <Row k="背景音" v={BG_SOUND_LABELS[story.params.bgSound]} />
              <Row k="哄睡强度" v={`${story.params.soothing}%`} />
            </CardContent>
          </Card>

          {/* 家长确认 */}
          <Card className="border-primary/30 bg-primary/[0.06]">
            <CardContent className="space-y-3 p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 size-4 accent-[var(--primary)]"
                />
                <span className="text-sm">
                  <span className="font-semibold">家长预览确认：</span>
                  我已检查故事内容，确认适合 {story.params.childName || '宝宝'} 睡前聆听。
                </span>
              </label>
              <Button
                onClick={goPlay}
                disabled={!agreed}
                className="h-12 w-full rounded-full bg-primary text-base font-bold text-primary-foreground"
              >
                <Sparkles className="size-5" /> 确认播放给孩子
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 需求 5：故事全文展示区，方便快速核对情节文案 */}
      <Card className="mt-6 border-white/10 bg-card/60">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">故事全文（共 {story.pages.length} 页）</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={regenerate} disabled={regen}>
              <RefreshCw className={regen ? 'size-3.5 animate-spin' : 'size-3.5'} />
              {regen ? '生成中…' : '重新生成文案'}
            </Button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {story.pages.map((pg, i) => (
              <div key={pg.id} className="rounded-xl bg-white/[0.03] p-3">
                <p className="mb-1 text-xs font-semibold text-primary">第 {i + 1} 页</p>
                <p className="text-sm leading-relaxed text-foreground/90">{pg.text}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            不满意可点「重新生成文案」换一版故事；上面「自动播放全部」可一键连续听完整本。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
