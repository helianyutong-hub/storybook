import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsRight } from 'lucide-react';

const KNOB = 44; // 与 size-11 对应（2.75rem = 44px）
const THRESHOLD = 92; // 拖到 92% 视为通过

interface Props {
  /** 验证通过/失败时回调（用于解锁登录按钮） */
  onVerify?: (ok: boolean) => void;
  /** 外部重置信号（如登录失败后让重新拖动验证） */
  resetKey?: number;
}

/**
 * 纯前端滑块人机验证：把滑块拖到最右侧即视为「非机器人」。
 * 不依赖任何第三方验证码服务，零成本、可离线工作。
 *
 * 修复点：
 * 1. pointerdown 时直接在 window 绑定 move/up，不依赖 state/ref 触发 effect 重订阅
 * 2. 阻止默认行为并加 user-select/touch-callout:none，避免移动端长按触发选择/菜单
 * 3. touch-action: none 防止微信/移动端拖动时页面跟着滚动
 */
export function SliderCaptcha({ onVerify, resetKey = 0 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  const [pos, setPos] = useState(0); // 滑块左偏移（px）
  const [verified, setVerified] = useState(false);

  // 测量轨道宽度（含窗口缩放）
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 外部要求重置（登录失败等）→ 回到起点
  useEffect(() => {
    setPos(0);
    setVerified(false);
  }, [resetKey]);

  const max = Math.max(0, trackW - KNOB);

  const commit = (finalPos: number) => {
    const finalPercent = max > 0 ? (finalPos / max) * 100 : 0;
    if (finalPercent >= THRESHOLD) {
      setPos(max);
      setVerified(true);
      onVerify?.(true);
    } else {
      setPos(0);
      setVerified(false);
      onVerify?.(false);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if (verified) return;
    // 阻止长按出现文本选择、菜单、缩放等默认行为
    e.preventDefault();

    const startX = e.clientX;
    const startPos = pos;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      let p = startPos + dx;
      p = Math.max(0, Math.min(max, p));
      setPos(p);
    };

    const onUp = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      let p = startPos + dx;
      p = Math.max(0, Math.min(max, p));
      commit(p);
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      ref={trackRef}
      className={`relative h-11 w-full select-none overflow-hidden rounded-2xl border text-sm transition-colors ${
        verified ? 'border-green-400/40 bg-green-400/10' : 'border-white/10 bg-white/[0.04]'
      }`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
    >
      {/* 提示文字（被滑块/高亮盖在下面也没关系，pointer-events-none） */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
        {verified ? '✓ 验证通过' : '请按住滑块，拖动到最右侧完成验证'}
      </div>

      {/* 已滑过区域高亮 */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 ${
          verified ? 'bg-green-400/20' : 'bg-primary/20'
        }`}
        style={{ width: `${pos + KNOB / 2}px` }}
      />

      {/* 滑块按钮 */}
      <button
        type="button"
        onPointerDown={onDown}
        className={`absolute left-0 top-0 grid size-11 place-items-center rounded-2xl shadow transition-colors ${
          verified ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'
        }`}
        style={{
          transform: `translateX(${pos}px)`,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        aria-label="拖动滑块完成人机验证"
      >
        {verified ? <Check className="size-5" /> : <ChevronsRight className="size-5" />}
      </button>
    </div>
  );
}
