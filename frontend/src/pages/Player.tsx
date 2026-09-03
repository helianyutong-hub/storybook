import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { PACE_RATE, Story } from '@/types/story';
import { useApp } from '@/store/AppStore';
import { getBgSound } from '@/lib/bgSound';
import { fetchStory, ensureStoryAudioUrls, getCachedAudioUrls } from '@/lib/api';
import { isTTSAvailable } from '@/lib/tts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

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
  /** 语音相关的错误提示 */
  const [audioError, setAudioError] = useState<string | null>(null);
  /** 是否在微信内置浏览器中 */
  const isWeChat = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /micromessenger/i.test(navigator.userAgent);
  }, []);

  const bg = useMemo(() => (story ? getBgSound() : null), [story]);

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
  // 1. 先从 localStorage 缓存读取（秒开）
  // 2. 缓存有当前页音频 → 立即开始播放
  // 3. 同时后台生成缺失页（不阻塞播放）
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
        const urls = await ensureStoryAudioUrls(story, (p) => setAudioProgress(p));
        const allOk = urls && urls.length === story.pages.length && urls.every(Boolean);
        if (!allOk && !urls?.some(Boolean)) {
          setAudioError('语音生成失败，请检查网络后重试');
        }
        setStory((s) => (s ? { ...s, audioUrls: urls } : s));
        updateDraft(story.id, { audioUrls: urls });
        return urls;
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

  // 进入播放页：缓存优先 → 有音频立即播，没有则后台生成
  useEffect(() => {
    if (!story) return;

    // 第一步：从 localStorage 缓存读取（可能 Preview 页已经预生成好了）
    const cached = getCachedAudioUrls(story.id);
    if (cached && cached.length >= story.pages.length) {
      // 缓存命中：直接用缓存的 URLs，立即开始播放
      const allReady = cached.every(Boolean);
      updateDraft(story.id, { audioUrls: cached });
      setStory((s) => (s ? { ...s, audioUrls: cached } : s));
      if (allReady || cached[0]) {
        // 第一页有音频就可以开始了
        setPlaying(true);
        return;
      }
      // 缓存部分命中：开始播 + 后台补剩余
      if (cached.some(Boolean)) setPlaying(true);
    }

    // 第二步：缓存没命中或部分缺失，后台生成（不阻塞 UI）
    void generateAllAudio().then((urls) => {
      if (!urls) return;
      // 只要第一页有音频就开始播放
      if (urls[0]) {
        setPlaying(true);
      } else if (urls.some(Boolean)) {
        // 第一页没有但其他页有，也尝试播放（会跳到有音频的页）
        setPlaying(true);
      }
    });
  }, [story]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当前页是否有服务端音频（提前声明，供下方解锁监听依赖使用）
  const currentAudioUrl = story?.audioUrls?.[page] || null;

  const last = story ? story.pages.length - 1 : 0;

  // 背景音随播放状态开关（等语音真正就绪后才启动，不和语音抢戏）
  useEffect(() => {
    if (!bg || !story) return;
    // 只有在「语音已就绪且正在播放」时才开背景音，避免语音还没出来背景音先响了
    const audioReady = audioMode === 'mp3' || audioMode === 'speech';
    if (playing && audioReady && story.params.bgSound !== 'none') {
      bg.play(story.params.bgSound, volume * 0.5);
      setBgOn(true);
    } else {
      bg.stop();
      setBgOn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, audioMode]);

  // 逐页朗读 / 播放
  useEffect(() => {
    if (!playing || !story) return;
    const s = story;
    let cancelled = false;

    if (currentAudioUrl) {
      setAudioMode('mp3');
      const audio = audioRef.current;
      if (audio) {
        audio.volume = volume;
        audio.src = currentAudioUrl;
        audio.load();
        audio
          .play()
          .then(() => {})
          .catch(() => {
            /* 微信可能拦截自动播放，用户可点击中间播放按钮手动触发 */
          });
        audio.oncanplay = undefined;
        const onEnd = () => {
          if (cancelled) return;
          if (page < last) {
            setPage((p) => Math.min(last, p + 1));
          } else {
            setFinished(true);
            setPlaying(false);
          }
        };
        audio.onended = onEnd;
        audio.onerror = () => {
          if (cancelled) return;
          // 音频加载失败：微信不支持浏览器语音，回退等于静音。
          // 改为重新生成这一页语音（最多自动重试 2 次），实在不行再提示用户轻点。
          if (isTTSAvailable()) {
            setAudioMode('speech');
            playSpeech();
            return;
          }
          const tries = reloadTried.current[page] ?? 0;
          if (tries >= 2) {
            return;
          }
          reloadTried.current[page] = tries + 1;
          setAudioMode('none');
          setPlaying(false);
          void generateAllAudio(true).then((urls) => {
            if (cancelled) return;
            if (urls?.[page]) setPlaying(true);
          });
        };
      }
    } else {
      // 当前页还没有音频（可能还在后台生成中）
      // 策略：等 2 秒再检查一次（边播边生成模式下，后台可能刚生成完）
      // 如果生成已完成且仍无音频，跳到下一页
      const retryTimer = setTimeout(() => {
        if (cancelled) return;
        // 重新检查当前 story 状态（后台可能已更新 audioUrls）
        const updatedUrl = story.audioUrls?.[page] || getCachedAudioUrls(story.id)?.[page];
        if (updatedUrl) {
          // 音频已经好了，触发重新播放（通过切换 page 触发 effect 重新执行）
          setPage(page); // 同一个值也会触发 re-render + effect 重跑
          return;
        }
        // 还是没有：尝试找下一页有音频的
        if (page < last) {
          setPage((p) => Math.min(last, p + 1));
        } else {
          // 最后一页都没音频，停止播放
          if (!story.audioUrls?.some(Boolean)) {
            setAudioError('语音生成失败，请检查网络后点击重试');
          }
          setFinished(true);
          setPlaying(false);
        }
      }, 2000);

      // 标记为等待中
      setAudioMode('none');

      return () => {
        clearTimeout(retryTimer);
      };
    }

    function playSpeech() {
      // 浏览器原生语音（微信内置浏览器不支持，仅作兜底）
      import('@/lib/tts').then(({ speak }) => {
        speak(s.pages[page].text, {
          rate: PACE_RATE[s.params.pace],
          volume,
          voiceRole: s.params.voice,
          onEnd: () => {
            if (cancelled) return;
            if (page < last) {
              setTimeout(() => !cancelled && setPage((p) => Math.min(last, p + 1)), 700);
            } else {
              setFinished(true);
              setPlaying(false);
            }
          },
        });
      });
    }

    return () => {
      cancelled = true;
      import('@/lib/tts').then(({ cancelSpeech }) => cancelSpeech());
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.oncanplay = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, page, currentAudioUrl]);

  // 离开页面清理
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

  // 播放/暂停按钮
  const togglePlay = () => {
    bg?.resume();
    setPlaying((p) => {
      const next = !p;
      if (next && audioRef.current && currentAudioUrl) {
        audioRef.current.src = currentAudioUrl;
        audioRef.current.volume = volume;
        audioRef.current.play().catch(() => {
          /* 微信可能拦截，用户可再次点击播放按钮 */
        });
      }
      return next;
    });
  };

  if (!story) {
    return <div className="grid min-h-[70vh] place-items-center text-muted-foreground">加载中…</div>;
  }

  const restart = () => {
    setFinished(false);
    setPage(0);
    setPlaying(true);
    const firstAudioUrl = story.audioUrls?.[0];
    if (audioRef.current && firstAudioUrl) {
      audioRef.current.currentTime = 0;
      audioRef.current.src = firstAudioUrl;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(() => {
        /* ignore */
      });
    }
  };

  const totalPages = audioProgress.total || story.pages.length;
  const donePages = Math.min(audioProgress.done, totalPages);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0a26]">
      {/* 隐藏音频元素，用于服务端 TTS 播放（微信兼容） */}
      <audio ref={audioRef} preload="none" className="hidden" playsInline />

      {/* 固定渐变背景（替代动态插画，提升加载速度） */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1040] via-[#2d1b69] to-[#0d0a26]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

      {/* 退出 */}
      <button
        onClick={() => {
          setPlaying(false);
          nav(`/preview/${story.id}`);
        }}
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
        {playing && audioMode === 'none' && !audioGen && !audioError && (
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

        {finished ? (
          <div className="flex flex-col items-center gap-3">
            <p className="flex items-center gap-2 text-lg font-bold text-primary">
              <Moon className="size-5" /> 晚安，好梦 🌙
            </p>
            <div className="flex gap-2">
              <Button onClick={restart} className="rounded-full">
                <RotateCcw className="size-4" /> 再讲一遍
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => nav(`/preview/${story.id}`)}
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
              disabled={audioGen}
            >
              {audioGen ? (
                <Loader2 className="size-7 animate-spin" />
              ) : playing ? (
                <Pause className="size-7" />
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
              背景音
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
