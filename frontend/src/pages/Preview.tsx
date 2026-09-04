import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  Wand2,
  Sparkles,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PACE_RATE, TONE_LABELS, BG_SOUND_LABELS, DURATION_LABELS, VOICE_LABELS, Story } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { speak, cancelSpeech, isTTSAvailable } from '@/lib/tts';
import { getBgSound } from '@/lib/bgSound';
import { fetchPublicStory, ensureAudioUrl, ensureStoryAudioUrls, invalidateAudioCache } from '@/lib/api';
import { regenerateStoryText } from '@/lib/storyEngine';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StorybookViewer } from '@/components/StorybookViewer';
import { PageDots } from '@/components/PageDots';

export default function Preview() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getDraft, updateDraft, setDraft } = useApp();

  // 故事来源：优先本地草稿；本地缺失（例如好友通过分享链接打开）时从公开分享区拉取
  const [story, setStory] = useState<Story | undefined>(() => (id ? getDraft(id) : undefined));
  const [notFound, setNotFound] = useState(false);
  const [page, setPage] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [bgOn, setBgOn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [regen, setRegen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 语音播放失败时的提示信息（null = 无错误） */
  const [audioError, setAudioError] = useState<string | null>(null);
  /** 标记是否已尝试过后端语音（用于区分"没试过"和"试过失败了"） */
  const backendTried = useRef(false);
  /**
   * 微信等浏览器要求 audio.play() 必须在用户手势（click/touchstart）的直接回调中调用。
   * 异步加载音频 URL 后已脱离手势上下文，此时把 URL 存到这里，
   * 显示「点击播放」按钮让用户再点一次，在 onClick 里调 play() 就能出声。
   */
  const [pendingPlayUrl, setPendingPlayUrl] = useState<string | null>(null);

  const bg = useMemo(() => (story ? getBgSound() : null), [story]);

  /**
   * ⚠️ 必须放在所有 early return 之前 —— React hooks 规则要求每次 render 调用顺序一致。
   * 早期版本里这个 useMemo 在 `if (!story) return` 之后，导致首次 render（story=undefined）和
   * 加载完（story≠undefined）的 hook 数量不一致，触发 Minified React error #310。
   */
  const isWeChat = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return navigator.userAgent.toLowerCase().includes('micromessenger');
  }, []);

  // 本地草稿缺失时（分享链接进来的场景），从公开分享区拉取故事
  useEffect(() => {
    if (!id) return;
    const local = getDraft(id);
    if (local) {
      setStory(local);
      setNotFound(false);
      return;
    }
    setNotFound(false);
    let alive = true;
    fetchPublicStory(id)
      .then((remote) => {
        if (!alive) return;
        if (remote) {
          setStory(remote);
          setDraft(remote);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      cancelSpeech();
      bg?.stop();
    };
  }, [bg]);

  // ===== 关键优化：进入预览页后立即后台预生成所有页语音 =====
  // 用户在阅读/审核文案时，语音已经在后台生成好了
  // 配合 localStorage 缓存，第二次打开同一故事秒开
  useEffect(() => {
    if (!story) return;
    // 先检查缓存是否已有完整音频（秒开的情况跳过）
    const cached = story.audioUrls;
    const ready = cached && cached.length === story.pages.length && cached.every(Boolean);
    if (ready) return;
    // 后台静默生成，不阻塞 UI，不显示 loading
    ensureStoryAudioUrls(story)
      .then((urls) => {
        if (urls?.some(Boolean)) {
          updateDraft(story.id, { audioUrls: urls });
        }
      })
      .catch(() => {});
  }, [story]); // eslint-disable-line react-hooks/exhaustive-deps

  // 唤醒后端（发一个轻量请求减少冷启动等待）
  useEffect(() => {
    if (!story) return;
    // 用 fetch 而不是 axios，避免错误弹窗/拦截器干扰
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000); // 5 秒超时
    fetch(`${import.meta.env.VITE_API_BASE || ''}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hi', lang: 'zh-CN', voice: 'mommy' }),
      signal: controller.signal,
    }).catch(() => {}); // 失败无所谓，只是预热
    return () => { clearTimeout(timer); controller.abort(); };
  }, [story]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-muted-foreground">没有找到这个故事，可能已被清除。</p>
        <Button className="mt-4 rounded-full" onClick={() => nav('/create')}>
          重新制作
        </Button>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        正在加载故事…
      </div>
    );
  }

  /** 用户点击「点击播放」按钮时调用（在手势上下文内） */
  const handlePendingPlay = () => {
    if (pendingPlayUrl && audioRef.current) {
      const audio = audioRef.current;
      audio.volume = story.params.volume;
      audio.src = pendingPlayUrl;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => {
        setSpeaking(false);
        setAudioError('音频播放失败，请检查网络后重试');
      };
      audio.play()
        .then(() => {
          setSpeaking(true);
          setPendingPlayUrl(null);
        })
        .catch(() => {
          setSpeaking(false);
          setPendingPlayUrl(null);
          setAudioError('播放被浏览器拦截，请再点一次试听');
        });
    }
  };

  const previewSpeak = async () => {
    // 如果正在播放或等待用户点击播放，则停止
    if (speaking || pendingPlayUrl) {
      cancelSpeech();
      audioRef.current?.pause();
      setSpeaking(false);
      setPendingPlayUrl(null);
      return;
    }

    // 先检查是否已有该页的音频 URL
    let audioUrl = story.audioUrls?.[page];
    const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';

    if (!audioUrl) {
      // 需要异步加载：脱离手势上下文，加载完后存入 pendingPlayUrl 让用户再点
      setAudioError(null);
      setPreparing(true);
      backendTried.current = true;
      try {
        audioUrl = await ensureAudioUrl(story.pages[page].text, lang, story.params.voice);
        if (audioUrl) {
          const urls = [...(story.audioUrls ?? [])];
          urls[page] = audioUrl;
          updateDraft(story.id, { audioUrls: urls });
        }
      } catch {
        audioUrl = null;
      } finally {
        setPreparing(false);
      }
    }

    if (audioUrl) {
      // 有 URL：先尝试在手势上下文内直接播放（大部分浏览器支持）
      // 微信等会拦截自动播放，此时再降级为「点击播放」按钮
      const audio = audioRef.current;
      if (audio) {
        audio.volume = story.params.volume;
        audio.src = audioUrl;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => {
          setSpeaking(false);
          setAudioError('音频播放失败，请检查网络后重试');
        };
        const played = audio.play();
        if (played !== undefined) {
          played
            .then(() => { setSpeaking(true); setPendingPlayUrl(null); })
            .catch(() => {
              // 浏览器拦截（微信常见）：显示「点击播放」让用户再点一次
              if (audioUrl) setPendingPlayUrl(audioUrl);
              setAudioError(null);
            });
        }
      } else {
        setPendingPlayUrl(audioUrl);
      }
      return;
    }

    // 没有服务端音频：尝试浏览器语音
    if (!isTTSAvailable()) {
      setSpeaking(false);
      if (backendTried.current) {
        setAudioError('语音服务暂时不可用（可能正在启动中），请稍后再试一次');
      } else {
        setAudioError('当前浏览器不支持语音朗读，需要连接后端服务才能播放语音');
      }
      return;
    }
    if (isWeChat) {
      setSpeaking(false);
      setAudioError('微信浏览器无法使用浏览器语音，正在尝试连接云端语音…');
      setPreparing(true);
      try {
        audioUrl = await ensureAudioUrl(story.pages[page].text, lang, story.params.voice);
        if (audioUrl) {
          const urls = [...(story.audioUrls ?? [])];
          urls[page] = audioUrl;
          updateDraft(story.id, { audioUrls: urls });
          setPendingPlayUrl(audioUrl);
          setAudioError(null);
        } else {
          setAudioError('无法连接语音服务，请确认网络正常或稍后再试');
        }
      } catch {
        setAudioError('无法连接语音服务，请确认网络正常或稍后再试');
      } finally {
        setPreparing(false);
      }
      return;
    }

    // 非微信普通浏览器：用 Web Speech API 播放（不需要手势）
    await speak(story.pages[page].text, {
      rate: PACE_RATE[story.params.pace],
      volume: story.params.volume,
      voiceRole: story.params.voice,
    });
    setSpeaking(false);
  };

  const regenerate = async () => {
    if (regen) return;
    setRegen(true);
    const newPages = regenerateStoryText(story);
    const updated = { ...story, pages: newPages, audioUrls: [] as (string | null)[] };
    updateDraft(story.id, { pages: newPages, audioUrls: [] });
    // 文案变了，旧音频失效，清除缓存
    invalidateAudioCache(story.id);
    setSpeaking(false);
    audioRef.current?.pause();
    toast.success('已重新生成故事文案');
    // 文案已生成完毕，按钮立即恢复（不等音频生成，音频后台静默跑）
    setRegen(false);
    // 后台预生成语音（失败不影响阅读体验）
    ensureStoryAudioUrls(updated)
      .then((urls) => updateDraft(story.id, { audioUrls: urls }))
      .catch(() => {});
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-48 pt-6 sm:px-6">
      <audio ref={audioRef} preload="none" className="hidden" playsInline />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">第 2 步 · 家长预览审核</p>
          <h1 className="text-xl font-extrabold sm:text-2xl">{story.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => nav('/create', { state: { params: story.params } })}>
            <Wand2 className="size-4" /> 调整参数
          </Button>
        </div>
      </div>

      {/* 需求 3：故事全文放最上方，文档阅读样式，家长审核优先 */}
      <Card className="mb-6 border-white/10 bg-card/60">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">故事全文（共 {story.pages.length} 页）</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={regenerate} disabled={regen}>
              <RefreshCw className={regen ? 'size-3.5 animate-spin' : 'size-3.5'} />
              {regen ? '生成中…' : '重新生成文案'}
            </Button>
          </div>
          <div className="space-y-5">
            {story.pages.map((pg, i) => (
              <div key={pg.id} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <p className="mb-1.5 text-xs font-semibold text-primary">第 {i + 1} 页</p>
                <p className="text-[15px] leading-relaxed text-foreground/90">{pg.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
              <div className="flex gap-2">
                {/* 试听这一页 / 点击播放 */}
                {pendingPlayUrl ? (
                  <Button
                    onClick={handlePendingPlay}
                    className="flex-1 rounded-full bg-primary animate-pulse"
                    size="lg"
                  >
                    <Play className="size-5" /> ▶ 点击播放
                  </Button>
                ) : (
                  <Button
                    onClick={previewSpeak}
                    className="flex-1 rounded-full"
                    disabled={preparing}
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
                )}
                <Button
                  variant={bgOn ? 'default' : 'secondary'}
                  className="rounded-full"
                  onClick={toggleBg}
                  disabled={story.params.bgSound === 'none'}
                >
                  <Volume2 className="size-4" />
                  {bgOn ? '关闭背景音' : '试听背景音'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                试听与播放的语音由云端逐页生成并缓存，需要保持网络连接；
                某一页首次生成可能需要等待几秒，生成后即可重复播放。
                {isWeChat && (
                  <span className="mt-1 block font-medium text-primary">
                    微信浏览器需点击「▶ 播放」按钮才能出声
                  </span>
                )}
              </p>
              {audioError && (
                <p className="mt-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300">
                  {audioError}
                </p>
              )}
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
              <Row k="音色" v={VOICE_LABELS[story.params.voice] ?? '宝妈'} />
              <Row k="背景音" v={BG_SOUND_LABELS[story.params.bgSound]} />
              <Row k="哄睡强度" v={`${story.params.soothing}%`} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 家长确认 — 用 Portal 挂到 body，脱离 PageTransition 的 transform 容器，
          否则 motion.div 的 transform 会让 position:fixed 相对该容器失效，无法吸底 */}
      {createPortal(
        <div className="fixed inset-x-0 bottom-0 z-50">
          <div className="mx-auto max-w-5xl px-4 pt-2 sm:px-6">
            <Card className="border-primary/30 bg-card/95 shadow-2xl backdrop-blur-md">
              <CardContent className="space-y-2.5 p-3.5 md:p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm leading-snug">
                    <span className="font-semibold">家长预览确认：</span>
                    我已检查故事内容，确认适合 {story.params.childName || '宝宝'} 睡前聆听。
                  </span>
                </label>
                <Button
                  onClick={goPlay}
                  disabled={!agreed}
                  className="h-11 w-full rounded-full bg-primary text-base font-bold text-primary-foreground md:h-12"
                >
                  <Sparkles className="size-5" /> 确认播放给孩子
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>,
        document.body,
      )}
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
