// 背景音效引擎（基于 Web Audio API 程序化生成，无需音频素材）
// 提供：细雨、海浪、微风、心跳、轻柔乐 五种安抚音效。

import { BgSound } from '@/types/story';

export class BgSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private current: BgSound = 'none';
  private volume = 0.4;

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** 在用户点击/触摸时调用，解除自动播放限制 */
  resume() {
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        /* ignore */
      });
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startRain(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    src.connect(hp).connect(lp).connect(this.master!);
    src.start();
    this.nodes.push(src);
  }

  private startWaves(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain).connect(lp.frequency);
    src.connect(lp).connect(this.master!);
    src.start();
    lfo.start();
    this.nodes.push(src, lfo);
  }

  private startWind(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency);
    src.connect(bp).connect(this.master!);
    src.start();
    lfo.start();
    this.nodes.push(src, lfo);
  }

  private startHeartbeat(ctx: AudioContext) {
    const beat = (t: number, gain: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(60, ctx.currentTime + t);
      o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(this.master!);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    };
    const interval = 1.1;
    let count = 0;
    const timer = window.setInterval(() => {
      if (!this.ctx) return;
      beat(0, 0.5);
      beat(0.22, 0.32);
      count++;
      if (count > 600) window.clearInterval(timer);
    }, interval * 1000);
    (this as any)._hbTimer = timer;
  }

  private startMusic(ctx: AudioContext) {
    // 五声音阶轻柔 pad
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0];
    const pad = ctx.createGain();
    pad.gain.value = 0.18;
    pad.connect(this.master!);
    scale.forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.16 / scale.length;
      o.connect(g).connect(pad);
      o.start();
      this.nodes.push(o);
    });
    // 缓慢飘动的旋律音
    const melody = ctx.createOscillator();
    melody.type = 'triangle';
    const mg = ctx.createGain();
    mg.gain.value = 0.0;
    melody.connect(mg).connect(this.master!);
    const notes = [329.63, 392.0, 440.0, 392.0, 293.66];
    let i = 0;
    const timer = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      melody.frequency.setValueAtTime(notes[i % notes.length], t);
      mg.gain.cancelScheduledValues(t);
      mg.gain.setValueAtTime(0.0001, t);
      mg.gain.linearRampToValueAtTime(0.12, t + 0.4);
      mg.gain.linearRampToValueAtTime(0.0001, t + 1.6);
      i++;
      if (i > 400) window.clearInterval(timer);
    }, 1800);
    melody.start();
    this.nodes.push(melody);
    (this as any)._musTimer = timer;
  }

  /** 切换背景音效 */
  play(type: BgSound, volume?: number) {
    this.stop();
    if (type === 'none') {
      this.current = 'none';
      return;
    }
    if (volume != null) this.setVolume(volume);
    const ctx = this.ensureCtx();
    switch (type) {
      case 'rain':
        this.startRain(ctx);
        break;
      case 'waves':
        this.startWaves(ctx);
        break;
      case 'wind':
        this.startWind(ctx);
        break;
      case 'heartbeat':
        this.startHeartbeat(ctx);
        break;
      case 'music':
        this.startMusic(ctx);
        break;
    }
    this.current = type;
  }

  stop() {
    if ((this as any)._hbTimer) window.clearInterval((this as any)._hbTimer);
    if ((this as any)._musTimer) window.clearInterval((this as any)._musTimer);
    this.nodes.forEach((n) => {
      try {
        (n as any).stop?.();
        n.disconnect();
      } catch {
        /* ignore */
      }
    });
    this.nodes = [];
    this.current = 'none';
  }

  get currentType() {
    return this.current;
  }
}

let engine: BgSoundEngine | null = null;
export function getBgSound(): BgSoundEngine {
  if (!engine) engine = new BgSoundEngine();
  return engine;
}
