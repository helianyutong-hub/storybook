// 程序化插画生成器
// 根据 IllustrationSpec 稳定生成柔和、适龄的睡前场景 SVG。
// 配色随故事进度从夜色过渡到温暖梦境，包含月亮、星星、云朵、小伙伴与孩子形象。

import { Rng } from './prng';
import { IllustrationSpec, Palette } from '@/types/story';

const PALETTES: Record<Palette, { sky: [string, string]; hill: string; moon: string; star: string; accent: string }> = {
  night: { sky: ['#241b4d', '#3a2a6b'], hill: '#1c1640', moon: '#ffe6a8', star: '#fff4cf', accent: '#8b7be8' },
  dream: { sky: ['#3b2a63', '#6a4a8f'], hill: '#2c2150', moon: '#ffd9e8', star: '#fff0fb', accent: '#c79bff' },
  cozy: { sky: ['#4a2f5e', '#8a5a6e'], hill: '#5a3a55', moon: '#ffe1b0', star: '#fff2d6', accent: '#ffb38a' },
  dawn: { sky: ['#2f3b6b', '#7a8bbf'], hill: '#33406b', moon: '#fff0c8', star: '#fff8e6', accent: '#a7c4ff' },
};

function Star({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <circle cx={x} cy={y} r={r} fill={color} className="ill-star" style={{ animationDelay: `${(x % 7) * 0.3}s` }}>
      <animate attributeName="opacity" values="0.3;1;0.3" dur={`${2 + (x % 3)}s`} repeatCount="indefinite" />
    </circle>
  );
}

function Moon({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 1.6} fill={color} opacity={0.18} />
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx + r * 0.35} cy={cy - r * 0.2} r={r * 0.28} fill="#000" opacity={0.06} />
      <circle cx={cx - r * 0.3} cy={cy + r * 0.25} r={r * 0.2} fill="#000" opacity={0.06} />
    </g>
  );
}

function Cloud({ x, y, s, color, opacity = 0.9 }: { x: number; y: number; s: number; color: string; opacity?: number }) {
  return (
    <g opacity={opacity} className="ill-float" style={{ animationDelay: `${(x % 5) * 0.4}s` }}>
      <ellipse cx={x} cy={y} rx={s * 0.9} ry={s * 0.5} fill={color} />
      <ellipse cx={x - s * 0.6} cy={y + s * 0.1} rx={s * 0.6} ry={s * 0.4} fill={color} />
      <ellipse cx={x + s * 0.7} cy={y + s * 0.12} rx={s * 0.65} ry={s * 0.42} fill={color} />
    </g>
  );
}

// 可爱的小伙伴形象（圆润软萌）
function Friend({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <g className="ill-float-slow" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: '0.6s' }}>
      <ellipse cx={x} cy={y + s * 0.95} rx={s * 0.55} ry={s * 0.18} fill="#000" opacity={0.12} />
      <circle cx={x} cy={y} r={s} fill={color} />
      <circle cx={x - s * 0.62} cy={y - s * 0.75} r={s * 0.42} fill={color} />
      <circle cx={x + s * 0.62} cy={y - s * 0.75} r={s * 0.42} fill={color} />
      <circle cx={x - s * 0.62} cy={y - s * 0.75} r={s * 0.22} fill={accent} opacity={0.5} />
      <circle cx={x + s * 0.62} cy={y - s * 0.75} r={s * 0.22} fill={accent} opacity={0.5} />
      <circle cx={x - s * 0.32} cy={y - s * 0.05} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x + s * 0.32} cy={y - s * 0.05} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x - s * 0.5} cy={y + s * 0.28} r={s * 0.14} fill="#ff9bb3" opacity={0.55} />
      <circle cx={x + s * 0.5} cy={y + s * 0.28} r={s * 0.14} fill="#ff9bb3" opacity={0.55} />
      <path d={`M ${x - s * 0.18} ${y + s * 0.22} Q ${x} ${y + s * 0.42} ${x + s * 0.18} ${y + s * 0.22}`} stroke="#3a2a4d" strokeWidth={s * 0.08} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Bed({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <g>
      <rect x={x - s} y={y} width={s * 2} height={s * 0.7} rx={s * 0.18} fill={color} />
      <rect x={x - s} y={y - s * 0.5} width={s * 0.5} height={s * 0.9} rx={s * 0.12} fill={accent} opacity={0.8} />
      <rect x={x - s * 0.9} y={y + s * 0.12} width={s * 1.8} height={s * 0.4} rx={s * 0.2} fill="#fff" opacity={0.85} />
    </g>
  );
}

function Child({ x, y, s, accent }: { x: number; y: number; s: number; accent: string }) {
  return (
    <g className="ill-float-slow" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: '0.2s' }}>
      <ellipse cx={x} cy={y + s * 1.1} rx={s * 0.6} ry={s * 0.2} fill="#000" opacity={0.12} />
      <rect x={x - s * 0.55} y={y + s * 0.1} width={s * 1.1} height={s * 1} rx={s * 0.4} fill="#ffe0c2" />
      <circle cx={x} cy={y - s * 0.15} r={s * 0.55} fill="#ffd9b8" />
      <path d={`M ${x - s * 0.55} ${y - s * 0.2} Q ${x} ${y - s * 0.9} ${x + s * 0.55} ${y - s * 0.2}`} fill={accent} />
      <circle cx={x - s * 0.2} cy={y - s * 0.12} r={s * 0.08} fill="#3a2a4d" />
      <circle cx={x + s * 0.2} cy={y - s * 0.12} r={s * 0.08} fill="#3a2a4d" />
      <path d={`M ${x - s * 0.14} ${y + s * 0.12} Q ${x} ${y + s * 0.22} ${x + s * 0.14} ${y + s * 0.12}`} stroke="#c2707f" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Hill({ y, color }: { y: number; color: string }) {
  return <path d={`M0 ${y} Q 120 ${y - 60} 240 ${y - 10} T 480 ${y - 30} V300 H0 Z`} fill={color} />;
}

// 远山（大场景时出现）
function Mountain({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <path
      d={`M${x} ${y} L${x - s} ${y + s * 0.85} L${x + s} ${y + s * 0.85} Z`}
      fill={color}
      opacity={0.55}
    />
  );
}

// 河流/湖泊（水场景）
function River({ color }: { color: string }) {
  return (
    <g opacity={0.55}>
      <path
        d="M0 260 Q 120 245 240 255 T 480 250 V300 H0 Z"
        fill={color}
      />
      {/* 两道淡淡的水波 */}
      <path d="M60 270 Q 180 260 300 270" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.25} fill="none" />
      <path d="M200 282 Q 320 272 440 282" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.2} fill="none" />
    </g>
  );
}

// 树木（森林/树林场景）
function Tree({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <g>
      <rect x={x - s * 0.08} y={y} width={s * 0.16} height={s * 0.55} fill="#3a2a4d" opacity={0.6} />
      <path d={`M${x} ${y - s * 0.9} L${x - s * 0.45} ${y} L${x + s * 0.45} ${y} Z`} fill={color} />
      <path d={`M${x} ${y - s * 1.35} L${x - s * 0.35} ${y - s * 0.45} L${x + s * 0.35} ${y - s * 0.45} Z`} fill={color} opacity={0.85} />
    </g>
  );
}

// 小路（出发/远行场景）
function Path({ color }: { color: string }) {
  return (
    <path
      d="M220 300 C 230 280, 250 260, 240 240 S 210 210, 230 190"
      stroke={color}
      strokeWidth={10}
      strokeLinecap="round"
      fill="none"
      opacity={0.35}
    />
  );
}

// 花朵/草丛（温暖场景）
function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={3} fill={color} />
      <circle cx={-4} cy={-2} r={2.2} fill={color} opacity={0.7} />
      <circle cx={4} cy={-2} r={2.2} fill={color} opacity={0.7} />
      <circle cx={0} cy={-5} r={2.2} fill={color} opacity={0.7} />
    </g>
  );
}

// 萤火虫（夏夜/发光场景）
function Firefly({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <circle cx={x} cy={y} r={2.5} fill="#fff6a8" opacity={0.9}>
      <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" repeatCount="indefinite" begin={`${delay}s`} />
      <animate attributeName="r" values="2;3.5;2" dur="2s" repeatCount="indefinite" begin={`${delay}s`} />
    </circle>
  );
}

export function StoryIllustration({ spec, className }: { spec: IllustrationSpec; className?: string }) {
  const rng = new Rng(spec.seed);
  const pal = PALETTES[spec.palette];
  const W = 480;
  const H = 300;
  const id = `g${spec.seed % 99999}`;

  const stars = Array.from({ length: 22 }, () => ({
    x: rng.int(10, W - 10),
    y: rng.int(10, 150),
    r: rng.float() * 1.6 + 0.6,
  }));

  const moonX = rng.int(330, 420);
  const moonY = rng.int(50, 90);
  const clouds = rng.sample([1, 2, 3], rng.int(1, 2)).map(() => ({ x: rng.int(60, 360), y: rng.int(60, 130), s: rng.int(22, 40) }));

  const hasMoon = spec.elements.includes('moon');
  const hasStars = spec.elements.includes('stars');
  const hasCloud = spec.elements.includes('cloud');
  const hasBed = spec.elements.includes('bed');
  const hasFriend = spec.elements.includes('friend');
  const hasChild = spec.hasChild;
  const hasHill = spec.elements.includes('hill') || spec.elements.includes('river');
  const hasRiver = spec.elements.includes('river');
  const hasMountain = spec.elements.includes('mountain');
  const hasTree = spec.elements.includes('tree');
  const hasPath = spec.elements.includes('path');
  const hasFlower = spec.elements.includes('flower');
  const hasFirefly = spec.elements.includes('firefly');

  const friendColor = rng.pick(['#f6c97b', '#ffb3c6', '#a7e3c9', '#b9a7ff', '#ffd6a5']);

  const treePositions = hasTree
    ? Array.from({ length: rng.int(2, 4) }, () => ({ x: rng.int(30, 450), y: rng.int(210, 255), s: rng.int(22, 36) }))
    : [];

  const flowerPositions = hasFlower
    ? Array.from({ length: rng.int(4, 7) }, () => ({ x: rng.int(20, 460), y: rng.int(255, 292) }))
    : [];

  const fireflyPositions = hasFirefly
    ? Array.from({ length: rng.int(4, 8) }, () => ({ x: rng.int(30, 450), y: rng.int(100, 240), delay: rng.float() * 2 }))
    : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="xMidYMid slice" role="img" aria-label="故事插画">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pal.sky[0]} />
          <stop offset="100%" stopColor={pal.sky[1]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />

      {stars.map((s, i) => (hasStars || i % 3 === 0 ? <Star key={i} {...s} color={pal.star} /> : null))}

      {hasMoon && <Moon cx={moonX} cy={moonY} r={rng.int(22, 30)} color={pal.moon} />}

      {clouds.map((c, i) => (hasCloud || i === 0 ? <Cloud key={i} {...c} color="#ffffff" opacity={0.85} /> : null))}

      {hasMountain && (
        <>
          <Mountain x={100} y={110} s={70} color={pal.hill} />
          <Mountain x={360} y={130} s={55} color={pal.hill} />
        </>
      )}

      {hasHill && <Hill y={210} color={pal.hill} />}

      {/* 地面 */}
      <path d={`M0 250 Q 240 220 480 255 V300 H0 Z`} fill={pal.hill} />

      {hasRiver && <River color={pal.accent} />}

      {hasPath && <Path color={pal.moon} />}

      {treePositions.map((t, i) => (
        <Tree key={i} x={t.x} y={t.y} s={t.s} color={pal.hill} />
      ))}

      {flowerPositions.map((f, i) => (
        <Flower key={i} x={f.x} y={f.y} color={rng.pick(['#ffb3c6', '#f6c97b', '#a7e3c9', '#c79bff', '#ffb38a'])} />
      ))}

      {hasBed && <Bed x={150} y={215} s={26} color={pal.accent} accent={pal.moon} />}
      {hasChild && <Child x={300} y={205} s={26} accent={pal.accent} />}
      {hasFriend && <Friend x={rng.int(120, 200)} y={rng.int(180, 210)} s={rng.int(22, 28)} color={friendColor} accent={pal.accent} />}

      {fireflyPositions.map((f, i) => (
        <Firefly key={i} x={f.x} y={f.y} delay={f.delay} />
      ))}
    </svg>
  );
}
