import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Moon,
  RotateCcw,
  Loader2,
  Share2,
  Copy,
  Plus,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Story } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { getBgSound } from '@/lib/bgSound';
import { fetchStory, startStoryAudioJob, pollStoryAudioJob, getCachedAudioUrls } from '@/lib/api';
import { cancelSpeech } from '@/lib/tts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

/** 把后端增量返回的 urls 合并进已有的 audioUrls（保留已有、补齐缺失的页） */
function mergeAudioUrls(
  prev: (string | null)[] | undefined,
  incoming: (string | null)[],
  total: number,
): (string | null)[] {
  const out: (string | null)[] = new Array(total).fill(null);
  if (prev) for (let i = 0; i < Math.min(prev.length, total); i++) out[i] = prev[i] ?? null;
  for (let i = 0; i < Math.min(incoming.length, total); i++) if (incoming[i]) out[i] = incoming[i];
  return out;
}

export default function Player() {
  const { id } = useParams();
  const nav = useNavigate();
  const { getDraft, setDraft, updateDraft } = useApp();
  const [story, setStory] = useState<Story | undefined>(id ? getDraft(id) : undefined);
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(story?.params.volume ?? 0.8);
  const [bgOn, setBgOn] = useState(false);
  const [finished, setFinished] = useState(false);
  const [audioGen, setAudioGen] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ done: 0, total: 0 });
  const loaded = useRef(false);
  const audioGenRound = useRef(0);
  const audioGenerating = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioMode, setAudioMode] = useState<'none' | 'mp3' | 'speech'>('none');
  /** 每一页因加载失败而重新生成语音的次数，用于限制自动重试、避免死循环 */
  const reloadTried = useRef<Record<number, number>>({});
  /** 用户期望的播放状态：暂停后再播时为 true（避免在 audio 加载完成前被 React 覆盖） */
  const wantPlayingRef = useRef(false);
  /** 当前 <audio> 已加载的 src，用于判断是否需要重新设置 src（续播不重置） */
  const loadedUrlRef = useRef<string | null>(null);
  /** 事件回调里读到最新 page / last（避免 effect 闭包过期） */
  const pageRef = useRef(0);
  const lastRef = useRef(0);
  /** 用户主动点击暂停的锁：防止微信浏览器 onPlay 事件或加载 effect 在 pause() 之后又把 playing 设回 true */
  const pausedByUserRef = useRef(false);
  /** 语音相关的错误提示 */
  const [audioError, setAudioError] = useState<string | null>(null);
  /** 是否显示"分享给好友"浮层 */
  const [shareOpen, setShareOpen] = useState(false);
  /** 复制链接后短暂打勾 */
  const [copied, setCopied] = useState(false);

  const bg = useMemo(() => (story ? getBgSound() : null), [story]);

  /** 当前故事的对外分享链接（不依赖 basename，全地址） */
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !story) return '';
    const base = window.location.origin;
    // GitHub Pages 子路径部署时 `import.meta.env.BASE_URL` 是 '/storybook/'，本地是 '/'
    const sub = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    return `${base}${sub}/preview/${story.id}`;
  }, [story]);

  // 若本地草稿缺失，尝试从云端拉取（支持跨设备回看）
  useEffect(() => {
    if (loaded.current || !id) return;
    loaded.current = true;
    const local = getDraft(id);
    if (local) {
      setStory(local);
      setVolume(local.params.volume);
      return;
    }
    fetchStory(id).then((remote) => {
      if (remote) {
        setStory(remote);
        setVolume(remote.params.volume);
        setDraft(remote);
      } else {
        nav('/create', { replace: true });
      }
    });
  }, [id, getDraft, setDraft, nav]);

  // 未确认预览则先回预览页
  useEffect(() => {
    if (story && !story.approved) nav(`/preview/${story.id}`, { replace: true });
  }, [story, nav]);

  // ===== 核心优化：边播边生成模式 =====
  // 1. 先从 localStorage 缓存读取（秒开，见进入播放页的 effect）
  // 2. 没有缓存时：启动后端任务，轮询进度；第 1 页音频一就绪就开播，
  //    其余页在后台并发补齐（不再等整本 10 页全部生成完才出声）
  const generateAllAudio = useCallback(
    async (force = false) => {
      if (!story) return null;
      if (audioGenerating.current && !force) return null;
      if (!force && audioGenRound.current >= 2) return null; // 最多自动重试 2 轮
      audioGenerating.current = true;
      audioGenRound.current = force ? 1 : audioGenRound.current + 1;
      setAudioGen(true);
      setAudioError(null);
      setAudioProgress({ done: 0, total: story.pages.length });
      try {
        const lang: 'zh' | 'en' = story.params.lang === 'en' ? 'en' : 'zh';
        const jobId = await startStoryAudioJob(
          story.pages.map((p) => p.text),
          lang,
          story.params.voice,
        );
        if (!jobId) throw new Error('无法创建语音生成任务');

        let startedPlaying = false;
        for (let i = 0; i < 300; i++) {
          const data = await pollStoryAudioJob(jobId);
          const incoming = Array.isArray(data.urls) ? data.urls : [];
          if (incoming.length) {
            setStory((s) =>
              s ? { ...s, audioUrls: mergeAudioUrls(s.audioUrls, incoming, story.pages.length) } : s,
            );
            setAudioProgress({
              done: Number(data.done || 0),
              total: Number(data.total || story.pages.length),
            });
            // 第 1 页就绪后**不自动开播**——等用户点击播放按钮才播
            // （避免用户刚进页面就被突如其来的声音吓到，也避免微信兼容性问题）
            if (!startedPlaying && incoming[0]) {
              startedPlaying = true;
              // 不再 setPlaying(true)
            }
          }
          if (data.status === 'done') break;
          await new Promise((r) => setTimeout(r, 1200));
        }
        // 写回草稿，便于跨设备/二次回看
        setStory((s) => {
          if (s) updateDraft(story.id, { audioUrls: s.audioUrls });
          return s;
        });
        return story.audioUrls;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '网络请求失败';
        if (msg.includes('405')) {
          setAudioError('语音服务正在启动中，请稍后再试');
        } else {
          setAudioError(`语音生成失败：${msg}`);
        }
        return null;
      } finally {
        audioGenerating.current = false;
        setAudioGen(false);
      }
    },
    [story, updateDraft],
  );

  // 进入播放页：缓存优先 → 有音频立即播，没有则后台生成（第 1 页好即播）
  useEffect(() => {
    if (!story) return;

    // 第一步：从 localStorage 缓存读取（可能 Preview 页已经预生成好了）
    const cached = getCachedAudioUrls(story.id);
    if (cached && cached.length >= story.pages.length) {
    // 缓存命中：直接用缓存的 URLs，但**不自动开播**——等用户点击播放按钮
    updateDraft(story.id, { audioUrls: cached });
    setStory((s) => (s ? { ...s, audioUrls: cached } : s));
    // 不再 setPlaying(true)：用户需要手动点 ▶ 才开始播（微信兼容 + 符合预期）
    return;
    }

    // 第二步：缓存没命中或部分缺失，后台生成（第 1 页就绪即开播，不阻塞 UI）
    void generateAllAudio();
  }, [story]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当前页是否有服务端音频（提前声明，供下方解锁监听依赖使用）
  const currentAudioUrl = story?.audioUrls?.[page] || null;

  const last = story ? story.pages.length - 1 : 0;

  // 背景音：由「打开环境音」按钮控制开关（bgOn 状态），仅在语音播放中且有需要时响起
  useEffect(() => {
    if (!bg || !story) return;
    const audioReady = audioMode === 'mp3' || audioMode === 'speech';
    if (playing && audioReady && bgOn && story.params.bgSound !== 'none') {
      bg.play(story.params.bgSound, volume * 0.5);
    } else {
      bg.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioMode, bgOn]);

  // 逐页朗读：用音频元素的真实 play / pause / ended 事件驱动 playing 状态，
  // 保证「播放/暂停图标」与实际声音严格同步；暂停后再次播放从断点续播（不重载音频）。
  // 把最新的 page / last 同步到 ref，供一次性绑定的事件回调读取。
  pageRef.current = page;
  lastRef.current = last;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => {
      // 用户主动暂停过：不自动恢复播放状态，等用户再点播放
      if (pausedByUserRef.current) return;
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const p = pageRef.current;
      if (p < lastRef.current) {
        setPage((x) => Math.min(lastRef.current, x + 1));
      } else {
        setFinished(true);
        wantPlayingRef.current = false;
        setPlaying(false);
      }
    };
    const onError = () => {
      // 当前页音频加载失败：多半是旧缓存被清空后 404，自动重新生成这一页（最多 2 次）
      const p = pageRef.current;
      const tries = reloadTried.current[p] ?? 0;
      if (tries < 2 && story) {
        reloadTried.current[p] = tries + 1;
        wantPlayingRef.current = true;
        void generateAllAudio(true);
      } else if (!audioError) {
        setAudioError('这一页语音加载失败，请返回预览页重试');
      }
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载并播放当前页：仅当 page 或音频 URL 变化时才执行。
  // 续播时不重新设置 src，从而保留 currentTime，从暂停处继续播放。
  useEffect(() => {
    if (!story) return;
    const audio = audioRef.current;
    if (!audio) return;
    const url = currentAudioUrl;
    if (!url) {
      // 当前页音频还没生成好：保持等待态，后台生成完会自动补齐并触发本 effect
      setAudioMode('none');
      // 生成已结束但本页仍缺失：补生成一次，避免卡在「准备中」
      if (!audioGen) {
        const tried = reloadTried.current[page] ?? 0;
        if (tried < 1) {
          reloadTried.current[page] = tried + 1;
          wantPlayingRef.current = true;
          void generateAllAudio(true);
        } else if (!audioError) {
          setAudioError('这一页语音生成失败，请返回预览页重试');
        }
      }
      return;
    }
    setAudioMode('mp3');
    if (loadedUrlRef.current !== url) {
      audio.src = url;
      loadedUrlRef.current = url;
      audio.load();
    }
    if (wantPlayingRef.current && !pausedByUserRef.current) {
      audio.play().catch(() => {
        /* 微信可能拦截无手势的自动播放，用户点击中间播放按钮即可手动触发 */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, currentAudioUrl]);

  // 强制退出到预览页：微信浏览器里 React Router 不可靠，直接用 window.location 跳转
  const exitToPreview = () => {
    // 先停掉一切声音和状态
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { cancelSpeech(); } catch { /* ignore */ }
    try { bg?.stop(); } catch { /* ignore */ }
    wantPlayingRef.current = false;
    pausedByUserRef.current = false;
    setPlaying(false);
    const target = story ? `/preview/${story.id}` : '/create';
    // 微信兼容：window.location 是最可靠的跳转方式，SPA nav 经常失效
    window.location.href = target;
  };
  useEffect(() => {
    return () => {
      import('@/lib/tts').then(({ cancelSpeech }) => cancelSpeech());
      bg?.stop();
      audioRef.current?.pause();
    };
  }, [bg]);

  // 音量实时调节
  const changeVolume = (v: number) => {
    setVolume(v);
    bg?.setVolume(v * 0.5);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleBg = () => {
    if (!bg || !story) return;
    bg.resume();
    if (bgOn) {
      bg.stop();
      setBgOn(false);
    } else {
      bg.play(story.params.bgSound, volume * 0.5);
      setBgOn(true);
    }
  };

  // 播放/暂停按钮：直接驱动 <audio>，同时显式设置 playing 状态 + 暂停锁（微信浏览器事件不可靠时保底）
  const togglePlay = () => {
    bg?.resume();
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      // 用户主动暂停
      wantPlayingRef.current = false;
      pausedByUserRef.current = true;  // 加锁：防止 onPlay/loading effect 自动恢复
      setPlaying(false);              // 显式切换图标为 ▶
      audio.pause();
    } else {
      // 用户主动播放：清除暂停锁
      pausedByUserRef.current = false;
      wantPlayingRef.current = true;
      setPlaying(true);               // 显式切换图标为 ⏸
      const url = currentAudioUrl;
      if (url && loadedUrlRef.current !== url) {
        audio.src = url;
        loadedUrlRef.current = url;
        audio.load();
      }
      audio.play().catch(() => {
        /* 微信自动播放限制：点击本身已是用户手势，通常可正常播放 */
        // 播放失败时回退状态
        setPlaying(false);
        wantPlayingRef.current = false;
      });
    }
  };

  if (!story) {
    return <div className="grid min-h-[70vh] place-items-center text-muted-foreground">加载中…</div>;
  }

  const restart = () => {
    setFinished(false);
    setPage(0);
    setPlaying(true);
    wantPlayingRef.current = true;
    pausedByUserRef.current = false;
    const firstAudioUrl = story.audioUrls?.[0];
    const audio = audioRef.current;
    if (audio && firstAudioUrl) {
      loadedUrlRef.current = firstAudioUrl;
      audio.currentTime = 0;
      audio.src = firstAudioUrl;
      audio.volume = volume;
      audio.play().catch(() => {
        /* ignore */
      });
    }
  };

  const totalPages = audioProgress.total || story.pages.length;
  const donePages = Math.min(audioProgress.done, totalPages);

  // 复制分享链接到剪贴板（带 fallback：iOS 旧版 / 微信内置可能没 clipboard API）
  const copyShareLink = async () => {
    const url = shareUrl;
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // fallback：临时 textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success('链接已复制，去微信发给好友吧');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('复制失败，请长按上方链接手动复制');
    }
  };

  // 通用浏览器走 navigator.share；微信内置浏览器不支持，所以这步会走到 catch，
  // 提示用户长按上方链接手动发送给好友
  const shareToFriend = async () => {
    if (!story) return;
    const url = shareUrl;
    const shareData: ShareData = {
      title: story.title,
      text: `宝宝专属睡前故事：${story.title}（${story.params.childName || '宝宝'}）`,
      url,
    };
    if (typeof navigator !== 'undefined' && 'share' in navigator && navigator.canShare?.(shareData) !== false) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* 用户取消或不支持，落回复制 */
      }
    }
    // 兜底：复制链接 + 提示
    await copyShareLink();
  };

  const goCreate = () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    wantPlayingRef.current = false;
    setPlaying(false);
    // window.location 走，微信兼容
    window.location.href = '/create';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0a26]">
      {/* 隐藏音频元素，用于服务端 TTS 播放（微信兼容） */}
      <audio ref={audioRef} preload="none" className="hidden" playsInline />

      {/* 固定渐变背景（替代动态插画，提升加载速度） */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1040] via-[#2d1b69] to-[#0d0a26]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

      {/* 退出 */}
      <button
        onClick={exitToPreview}
        className="absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur"
        aria-label="退出播放"
      >
        <X className="size-5" />
      </button>

      {/* 正文 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p
          key={story.pages[page].id}
          className="rise-in max-w-2xl text-2xl font-bold leading-relaxed text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-3xl"
        >
          {story.pages[page].text}
        </p>

        {audioGen && (
          <div className="mt-6 flex max-w-sm flex-col items-center gap-1.5 rounded-2xl bg-black/45 px-5 py-4 text-center backdrop-blur">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Loader2 className="size-4 animate-spin" /> 云端语音生成中，请耐心等待…
            </p>
            <p className="text-xs text-white/75">
              已完成 {donePages} / {totalPages} 页
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/55">
              需要：保持网络连接，并留在这个页面。整本语音由云端逐页合成并缓存，
              一次性生成完后会自动开始播放。
            </p>
          </div>
        )}

        {audioError && !audioGen && (
          <p className="mt-5 max-w-sm animate-pulse rounded-2xl bg-amber-500/20 px-5 py-3 text-center text-sm font-semibold text-amber-300 backdrop-blur">
            {audioError}
          </p>
        )}

        {/* 音频还在加载/生成中：显示等待提示 */}
        {!currentAudioUrl && !audioGen && !audioError && (
          <div className="mt-6 flex max-w-sm flex-col items-center gap-1.5 rounded-2xl bg-black/30 px-5 py-3 text-center backdrop-blur">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Loader2 className="size-4 animate-spin" /> 语音准备中…
            </p>
            <p className="text-[11px] leading-relaxed text-white/50">
              正在加载语音，请稍候
            </p>
          </div>
        )}

      </div>

      {/* 控制条 */}
      <div className="relative z-10 mx-auto mb-6 w-full max-w-xl px-5">
        <div className="mb-3 flex items-center justify-center gap-1 text-xs text-white/70">
          第 {page + 1} / {story.pages.length} 页
          {audioMode === 'mp3' && <span className="ml-1 text-primary">· 云端语音</span>}
          {audioMode === 'speech' && <span className="ml-1 text-white/50">· 浏览器语音</span>}
          {audioMode === 'none' && !audioGen && (
            <span className="ml-1 text-amber-300">· 语音准备中</span>
          )}
          {audioGen && (
            <span className="ml-1 text-primary">
              · 生成中 {donePages}/{totalPages}
            </span>
          )}
        </div>
        <div className="mb-4 flex items-center justify-center gap-2">
          {Array.from({ length: story.pages.length }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === page ? 'w-6 bg-primary' : 'w-1.5 bg-white/30'
              }`}
            />
          ))}
        </div>
        {!finished && (
          <p className="mt-2 text-center text-xs text-white/60">
            {playing ? '播放中' : currentAudioUrl ? '已暂停' : '准备中'}
          </p>
        )}

        {finished ? (
          <div className="flex flex-col items-center gap-3">
            <p className="flex items-center gap-2 text-lg font-bold text-primary">
              <Moon className="size-5" /> 晚安，好梦 🌙
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={restart} className="rounded-full">
                <RotateCcw className="size-4" /> 再讲一遍
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" /> 分享给好友听
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={goCreate}
              >
                <Plus className="size-4" /> 继续创作新故事
              </Button>
              <Button
                variant="ghost"
                className="rounded-full text-white/70"
                onClick={exitToPreview}
              >
                返回预览
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <SkipBack />
            </Button>
            <Button
              size="icon-lg"
              className="size-16 rounded-full bg-primary text-primary-foreground shadow-xl"
              onClick={togglePlay}
              disabled={audioGen && !playing}
            >
              {playing ? (
                <Pause className="size-7" />
              ) : audioGen ? (
                <Loader2 className="size-7 animate-spin" />
              ) : (
                <Play className="size-7" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPage((p) => Math.min(last, p + 1))}
              disabled={page === last}
            >
              <SkipForward />
            </Button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-full bg-black/30 px-4 py-2 backdrop-blur">
          <button onClick={() => changeVolume(volume === 0 ? 0.8 : 0)} className="text-white/80">
            {volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <Slider
            value={[Math.round(volume * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={(e) => changeVolume(e[0] / 100)}
            className="flex-1"
          />
          {story.params.bgSound !== 'none' && (
            <button
              onClick={toggleBg}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                bgOn ? 'bg-primary/30 text-primary' : 'text-white/70'
              }`}
            >
              {bgOn ? '关闭环境音' : '打开环境音'}
            </button>
          )}
        </div>
      </div>

      {/* 分享给好友浮层：用 createPortal 挂到 body 脱离 motion 容器，吸底 + 居中 */}
      {shareOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShareOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Share2 className="size-5 text-primary" /> 把故事分享给好友
              </h3>
              <button onClick={() => setShareOpen(false)} className="rounded-full p-1 text-gray-500 hover:bg-gray-100" aria-label="关闭">
                <X className="size-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              把下面的链接发给好友，对方打开就能直接看到「{story.title}」。
            </p>
            <div className="mb-4 break-all rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {shareUrl}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={copyShareLink} className="rounded-full">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? '已复制' : '复制链接'}
              </Button>
              <Button variant="secondary" onClick={shareToFriend} className="rounded-full">
                <Share2 className="size-4" /> 分享给好友
              </Button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              微信内如未弹出分享面板，可直接「复制链接」后粘贴到聊天发给好友。
            </p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
