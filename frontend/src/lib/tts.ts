// 语音朗读引擎（基于浏览器原生 Web Speech API）
// 无需任何密钥，离线可用；可调节语速、音量、音色，朗读轻柔适合哄睡。

export interface SpeakOptions {
  rate?: number; // 0.1 - 10
  volume?: number; // 0 - 1
  lang?: string;
  voiceName?: string;
  onBoundary?: (charIndex: number) => void;
  onEnd?: () => void;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) cachedVoices = v;
  return cachedVoices;
}

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices(): SpeechSynthesisVoice[] {
  return loadVoices();
}

/** 挑选最适合哄睡的轻柔中文音色（优先中文女声） */
export function pickGentleVoice(lang = 'zh-CN'): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  if (!voices.length) return undefined;
  const sameLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.split('-')[0]));
  const pool = sameLang.length ? sameLang : voices;
  // 优先包含 "Female / 女 / 婷 / 丫 / 小 / 甜" 等关键字
  const prefer = pool.find((v) => /female|女|婷|丫|甜|meng|mei|ling|yan/i.test(v.name));
  return prefer ?? pool[0];
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!isTTSAvailable()) {
      opts.onEnd?.();
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? 'zh-CN';
    u.rate = opts.rate ?? 0.9;
    u.volume = opts.volume ?? 0.9;
    if (opts.voiceName) {
      const v = loadVoices().find((x) => x.name === opts.voiceName);
      if (v) u.voice = v;
    } else {
      const gv = pickGentleVoice(u.lang);
      if (gv) u.voice = gv;
    }
    if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary!(e.charIndex);
    u.onend = () => {
      opts.onEnd?.();
      resolve();
    };
    u.onerror = () => {
      opts.onEnd?.();
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech() {
  if (isTTSAvailable()) window.speechSynthesis.cancel();
}

// 预加载音色（部分浏览器需触发一次才可用）
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
}
