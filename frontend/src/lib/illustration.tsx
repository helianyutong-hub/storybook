// 程序化插画生成器
// 根据 IllustrationSpec 稳定生成柔和、适龄的睡前场景 SVG。
// 配色随故事进度从夜色过渡到温暖梦境，包含月亮、星星、云朵、小伙伴与孩子形象。
// 「小伙伴」会根据 spec.friendKind 切换动物形状（熊/兔/鹿/狐/猫/鸭/鲸鱼/星星/月亮/云/树/萤火虫），
// 让画面尽量贴合文案里提到的角色。

import { Rng } from './prng';
import { IllustrationSpec, Palette, AnimalKind } from '@/types/story';
import { kindFromName } from './storyEngine';

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

// ---------------- 小伙伴：按 kind 渲染不同动物 ---------------- //

// 共用眼睛/腮红/嘴角：原点在脸部中心，s 是基础尺寸
function Face({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g>
      <circle cx={x - s * 0.32} cy={y - s * 0.05} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x + s * 0.32} cy={y - s * 0.05} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x - s * 0.5} cy={y + s * 0.28} r={s * 0.14} fill="#ff9bb3" opacity={0.55} />
      <circle cx={x + s * 0.5} cy={y + s * 0.28} r={s * 0.14} fill="#ff9bb3" opacity={0.55} />
      <path d={`M ${x - s * 0.18} ${y + s * 0.22} Q ${x} ${y + s * 0.42} ${x + s * 0.18} ${y + s * 0.22}`} stroke="#3a2a4d" strokeWidth={s * 0.08} fill="none" strokeLinecap="round" />
    </g>
  );
}

// 通用软萌动物容器（影/浮动）
function FriendWrap({ x, y, s, children }: { x: number; y: number; s: number; children: React.ReactNode }) {
  return (
    <g className="ill-float-slow" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: '0.6s' }}>
      <ellipse cx={x} cy={y + s * 1.05} rx={s * 0.65} ry={s * 0.18} fill="#000" opacity={0.12} />
      {children}
    </g>
  );
}

// 小熊：圆耳朵 + 圆头
function BearFriend({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <circle cx={x} cy={y} r={s} fill={color} />
      <circle cx={x - s * 0.62} cy={y - s * 0.78} r={s * 0.42} fill={color} />
      <circle cx={x + s * 0.62} cy={y - s * 0.78} r={s * 0.42} fill={color} />
      <circle cx={x - s * 0.62} cy={y - s * 0.78} r={s * 0.22} fill={accent} opacity={0.55} />
      <circle cx={x + s * 0.62} cy={y - s * 0.78} r={s * 0.22} fill={accent} opacity={0.55} />
      <ellipse cx={x} cy={y + s * 0.35} rx={s * 0.5} ry={s * 0.34} fill="#fff" opacity={0.45} />
      <Face x={x} y={y} s={s} />
    </FriendWrap>
  );
}

// 小兔：长耳朵（竖直椭圆）+ 圆脸
function BunnyFriend({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <ellipse cx={x - s * 0.4} cy={y - s * 1.15} rx={s * 0.22} ry={s * 0.75} fill={color} />
      <ellipse cx={x + s * 0.4} cy={y - s * 1.15} rx={s * 0.22} ry={s * 0.75} fill={color} />
      <ellipse cx={x - s * 0.4} cy={y - s * 1.1} rx={s * 0.1} ry={s * 0.55} fill={accent} opacity={0.65} />
      <ellipse cx={x + s * 0.4} cy={y - s * 1.1} rx={s * 0.1} ry={s * 0.55} fill={accent} opacity={0.65} />
      <circle cx={x} cy={y} r={s * 0.95} fill={color} />
      <Face x={x} y={y} s={s} />
      <path d={`M ${x} ${y + s * 0.18} L ${x} ${y + s * 0.32} M ${x - s * 0.12} ${y + s * 0.3} L ${x} ${y + s * 0.18} L ${x + s * 0.12} ${y + s * 0.3}`} stroke="#3a2a4d" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 小鹿：多分叉鹿角 + 圆脸 + 浅色斑点鼻
function DeerFriend({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      {/* 左侧鹿角：主干（弧线）+ 后枝 + 顶枝（独立 stroke，让分叉更清晰） */}
      <path d={`M ${x - s * 0.45} ${y - s * 0.82} Q ${x - s * 0.72} ${y - s * 1.15} ${x - s * 0.95} ${y - s * 1.55}`} stroke="#7a5a3a" strokeWidth={s * 0.11} strokeLinecap="round" fill="none" />
      <path d={`M ${x - s * 0.6} ${y - s * 1.05} L ${x - s * 1.18} ${y - s * 1.35}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      <path d={`M ${x - s * 0.78} ${y - s * 1.25} L ${x - s * 0.58} ${y - s * 1.85}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      <path d={`M ${x - s * 0.95} ${y - s * 1.55} L ${x - s * 0.78} ${y - s * 2.05}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      {/* 右侧鹿角（对称） */}
      <path d={`M ${x + s * 0.45} ${y - s * 0.82} Q ${x + s * 0.72} ${y - s * 1.15} ${x + s * 0.95} ${y - s * 1.55}`} stroke="#7a5a3a" strokeWidth={s * 0.11} strokeLinecap="round" fill="none" />
      <path d={`M ${x + s * 0.6} ${y - s * 1.05} L ${x + s * 1.18} ${y - s * 1.35}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      <path d={`M ${x + s * 0.78} ${y - s * 1.25} L ${x + s * 0.58} ${y - s * 1.85}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      <path d={`M ${x + s * 0.95} ${y - s * 1.55} L ${x + s * 0.78} ${y - s * 2.05}`} stroke="#7a5a3a" strokeWidth={s * 0.09} strokeLinecap="round" fill="none" />
      <circle cx={x} cy={y} r={s * 0.95} fill={color} />
      <circle cx={x - s * 0.3} cy={y - s * 0.1} r={s * 0.1} fill="#3a2a4d" />
      <circle cx={x + s * 0.3} cy={y - s * 0.1} r={s * 0.1} fill="#3a2a4d" />
      <ellipse cx={x} cy={y + s * 0.25} rx={s * 0.14} ry={s * 0.1} fill="#3a2a4d" />
      <path d={`M ${x} ${y + s * 0.32} Q ${x} ${y + s * 0.5} ${x - s * 0.12} ${y + s * 0.5}`} stroke="#3a2a4d" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
      <circle cx={x - s * 0.6} cy={y + s * 0.25} r={s * 0.06} fill={accent} opacity={0.55} />
      <circle cx={x + s * 0.6} cy={y + s * 0.25} r={s * 0.06} fill={accent} opacity={0.55} />
    </FriendWrap>
  );
}

// 小狐狸：尖耳 + 长下巴
function FoxFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <path d={`M ${x - s * 0.85} ${y - s * 0.45} L ${x - s * 0.55} ${y - s * 1.1} L ${x - s * 0.3} ${y - s * 0.45} Z`} fill={color} />
      <path d={`M ${x + s * 0.85} ${y - s * 0.45} L ${x + s * 0.55} ${y - s * 1.1} L ${x + s * 0.3} ${y - s * 0.45} Z`} fill={color} />
      <path d={`M ${x - s * 0.75} ${y - s * 0.55} L ${x - s * 0.55} ${y - s * 0.95} L ${x - s * 0.4} ${y - s * 0.55} Z`} fill="#fff" opacity={0.6} />
      <path d={`M ${x + s * 0.75} ${y - s * 0.55} L ${x + s * 0.55} ${y - s * 0.95} L ${x + s * 0.4} ${y - s * 0.55} Z`} fill="#fff" opacity={0.6} />
      <circle cx={x} cy={y} r={s * 0.95} fill={color} />
      <ellipse cx={x} cy={y + s * 0.35} rx={s * 0.55} ry={s * 0.45} fill="#fff" opacity={0.85} />
      <circle cx={x - s * 0.32} cy={y - s * 0.05} r={s * 0.1} fill="#3a2a4d" />
      <circle cx={x + s * 0.32} cy={y - s * 0.05} r={s * 0.1} fill="#3a2a4d" />
      <ellipse cx={x} cy={y + s * 0.18} rx={s * 0.12} ry={s * 0.08} fill="#3a2a4d" />
      <path d={`M ${x} ${y + s * 0.25} Q ${x} ${y + s * 0.4} ${x - s * 0.1} ${y + s * 0.42} M ${x} ${y + s * 0.25} Q ${x} ${y + s * 0.4} ${x + s * 0.1} ${y + s * 0.42}`} stroke="#3a2a4d" strokeWidth={s * 0.05} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 小猫咪：尖耳 + 胡须
function CatFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <path d={`M ${x - s * 0.9} ${y - s * 0.4} L ${x - s * 0.55} ${y - s * 1.05} L ${x - s * 0.25} ${y - s * 0.4} Z`} fill={color} />
      <path d={`M ${x + s * 0.9} ${y - s * 0.4} L ${x + s * 0.55} ${y - s * 1.05} L ${x + s * 0.25} ${y - s * 0.4} Z`} fill={color} />
      <circle cx={x} cy={y} r={s * 0.95} fill={color} />
      <ellipse cx={x - s * 0.32} cy={y - s * 0.05} rx={s * 0.14} ry={s * 0.16} fill="#3a2a4d" />
      <ellipse cx={x + s * 0.32} cy={y - s * 0.05} rx={s * 0.14} ry={s * 0.16} fill="#3a2a4d" />
      <ellipse cx={x - s * 0.32} cy={y - s * 0.05} rx={s * 0.05} ry={s * 0.13} fill="#fff" opacity={0.6} />
      <ellipse cx={x + s * 0.32} cy={y - s * 0.05} rx={s * 0.05} ry={s * 0.13} fill="#fff" opacity={0.6} />
      <path d={`M ${x} ${y + s * 0.18} L ${x - s * 0.1} ${y + s * 0.28} M ${x} ${y + s * 0.18} L ${x + s * 0.1} ${y + s * 0.28}`} stroke="#3a2a4d" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
      <path d={`M ${x - s * 0.55} ${y + s * 0.32} L ${x - s * 0.95} ${y + s * 0.28} M ${x - s * 0.55} ${y + s * 0.4} L ${x - s * 0.95} ${y + s * 0.42} M ${x + s * 0.55} ${y + s * 0.32} L ${x + s * 0.95} ${y + s * 0.28} M ${x + s * 0.55} ${y + s * 0.4} L ${x + s * 0.95} ${y + s * 0.42}`} stroke="#3a2a4d" strokeWidth={s * 0.04} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 小鸭子：扁嘴 + 圆头
function DuckFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <circle cx={x} cy={y} r={s * 0.95} fill={color} />
      <ellipse cx={x} cy={y + s * 0.45} rx={s * 0.5} ry={s * 0.18} fill="#ff9a4a" />
      <circle cx={x - s * 0.28} cy={y - s * 0.1} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x + s * 0.28} cy={y - s * 0.1} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x - s * 0.31} cy={y - s * 0.13} r={s * 0.04} fill="#fff" />
      <circle cx={x + s * 0.25} cy={y - s * 0.13} r={s * 0.04} fill="#fff" />
      <path d={`M ${x} ${y - s * 0.9} Q ${x + s * 0.1} ${y - s * 1.15} ${x} ${y - s * 1.05}`} stroke={color} strokeWidth={s * 0.1} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 小鲸鱼：胖圆身体 + 尾巴
function WhaleFriend({ x, y, s, color, accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <ellipse cx={x} cy={y + s * 0.2} rx={s * 1.4} ry={s * 0.95} fill={color} />
      <ellipse cx={x} cy={y + s * 0.55} rx={s * 0.95} ry={s * 0.45} fill="#fff" opacity={0.8} />
      <path d={`M ${x + s * 1.3} ${y + s * 0.1} L ${x + s * 1.85} ${y - s * 0.4} L ${x + s * 1.85} ${y + s * 0.55} Z`} fill={color} />
      <circle cx={x - s * 0.5} cy={y - s * 0.3} r={s * 0.12} fill="#3a2a4d" />
      <circle cx={x - s * 0.53} cy={y - s * 0.34} r={s * 0.04} fill="#fff" />
      <path d={`M ${x - s * 0.7} ${y + s * 0.05} Q ${x - s * 0.4} ${y + s * 0.18} ${x - s * 0.15} ${y + s * 0.05}`} stroke="#3a2a4d" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
      <path d={`M ${x - s * 0.6} ${y - s * 0.7} Q ${x - s * 0.5} ${y - s * 1.05} ${x - s * 0.4} ${y - s * 0.7}`} stroke={accent} strokeWidth={s * 0.1} fill="none" strokeLinecap="round" opacity={0.7} />
    </FriendWrap>
  );
}

// 小星星：5 角星 + 笑脸
function StarFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  const outer = 1;
  const inner = 0.45;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 10;
    pts.push(`${(x + r * s * Math.cos(a)).toFixed(2)},${(y + r * s * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <FriendWrap x={x} y={y} s={s}>
      <polygon points={pts.join(' ')} fill={color} />
      <circle cx={x - s * 0.2} cy={y - s * 0.1} r={s * 0.08} fill="#3a2a4d" />
      <circle cx={x + s * 0.2} cy={y - s * 0.1} r={s * 0.08} fill="#3a2a4d" />
      <path d={`M ${x - s * 0.18} ${y + s * 0.1} Q ${x} ${y + s * 0.28} ${x + s * 0.18} ${y + s * 0.1}`} stroke="#3a2a4d" strokeWidth={s * 0.07} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 月亮婆婆：大月牙 + 弯眼 + 笑嘴
function MoonFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <circle cx={x} cy={y} r={s * 1.6} fill={color} opacity={0.18} />
      <path d={`M ${x + s * 0.4} ${y - s} A ${s} ${s} 0 1 0 ${x + s * 0.4} ${y + s} A ${s * 0.65} ${s} 0 1 1 ${x + s * 0.4} ${y - s} Z`} fill={color} />
      <path d={`M ${x - s * 0.2} ${y - s * 0.05} Q ${x - s * 0.05} ${y + s * 0.05} ${x + s * 0.1} ${y - s * 0.05}`} stroke="#3a2a4d" strokeWidth={s * 0.08} fill="none" strokeLinecap="round" />
      <path d={`M ${x - s * 0.2} ${y + s * 0.4} Q ${x} ${y + s * 0.6} ${x + s * 0.2} ${y + s * 0.4}`} stroke="#3a2a4d" strokeWidth={s * 0.07} fill="none" strokeLinecap="round" />
      <circle cx={x - s * 0.4} cy={y + s * 0.18} r={s * 0.1} fill="#ff9bb3" opacity={0.55} />
      <circle cx={x + s * 0.4} cy={y + s * 0.18} r={s * 0.1} fill="#ff9bb3" opacity={0.55} />
    </FriendWrap>
  );
}

// 云朵宝宝：云朵形 + 小脸
function CloudFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <ellipse cx={x} cy={y} rx={s * 1.1} ry={s * 0.7} fill={color} />
      <ellipse cx={x - s * 0.7} cy={y + s * 0.15} rx={s * 0.55} ry={s * 0.45} fill={color} />
      <ellipse cx={x + s * 0.7} cy={y + s * 0.15} rx={s * 0.6} ry={s * 0.5} fill={color} />
      <ellipse cx={x - s * 0.3} cy={y - s * 0.25} rx={s * 0.4} ry={s * 0.32} fill={color} />
      <ellipse cx={x + s * 0.4} cy={y - s * 0.22} rx={s * 0.45} ry={s * 0.36} fill={color} />
      <circle cx={x - s * 0.22} cy={y - s * 0.05} r={s * 0.1} fill="#3a2a4d" />
      <circle cx={x + s * 0.22} cy={y - s * 0.05} r={s * 0.1} fill="#3a2a4d" />
      <path d={`M ${x - s * 0.16} ${y + s * 0.22} Q ${x} ${y + s * 0.4} ${x + s * 0.16} ${y + s * 0.22}`} stroke="#3a2a4d" strokeWidth={s * 0.07} fill="none" strokeLinecap="round" />
      <circle cx={x - s * 0.42} cy={y + s * 0.22} r={s * 0.1} fill="#ff9bb3" opacity={0.55} />
      <circle cx={x + s * 0.42} cy={y + s * 0.22} r={s * 0.1} fill="#ff9bb3" opacity={0.55} />
    </FriendWrap>
  );
}

// 大树爷爷：树干 + 树冠 + 树纹脸
function TreeFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <rect x={x - s * 0.45} y={y + s * 0.2} width={s * 0.9} height={s * 1.1} rx={s * 0.1} fill="#7a5a3a" />
      <circle cx={x} cy={y - s * 0.4} r={s * 1.2} fill={color} />
      <circle cx={x - s * 0.7} cy={y + s * 0.1} r={s * 0.55} fill={color} opacity={0.9} />
      <circle cx={x + s * 0.7} cy={y + s * 0.1} r={s * 0.55} fill={color} opacity={0.9} />
      <ellipse cx={x - s * 0.15} cy={y + s * 0.45} rx={s * 0.08} ry={s * 0.18} fill="#fff" opacity={0.45} />
      <ellipse cx={x + s * 0.1} cy={y + s * 0.55} rx={s * 0.06} ry={s * 0.16} fill="#fff" opacity={0.4} />
      <ellipse cx={x + s * 0.25} cy={y + s * 0.85} rx={s * 0.07} ry={s * 0.18} fill="#fff" opacity={0.4} />
      <circle cx={x - s * 0.3} cy={y - s * 0.45} r={s * 0.1} fill="#3a2a4d" />
      <circle cx={x + s * 0.3} cy={y - s * 0.45} r={s * 0.1} fill="#3a2a4d" />
      <path d={`M ${x - s * 0.2} ${y - s * 0.15} Q ${x} ${y} ${x + s * 0.2} ${y - s * 0.15}`} stroke="#3a2a4d" strokeWidth={s * 0.07} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 萤火虫：小发光体 + 翅膀
function FireflyFriend({ x, y, s, color, accent: _accent }: { x: number; y: number; s: number; color: string; accent: string }) {
  return (
    <FriendWrap x={x} y={y} s={s}>
      <circle cx={x} cy={y} r={s * 1.4} fill={color} opacity={0.2} />
      <ellipse cx={x - s * 0.6} cy={y - s * 0.05} rx={s * 0.45} ry={s * 0.25} fill="#fff" opacity={0.75} />
      <ellipse cx={x + s * 0.6} cy={y - s * 0.05} rx={s * 0.45} ry={s * 0.25} fill="#fff" opacity={0.75} />
      <circle cx={x} cy={y} r={s * 0.5} fill={color} />
      <path d={`M ${x - s * 0.18} ${y - s * 0.4} Q ${x - s * 0.3} ${y - s * 0.8} ${x - s * 0.45} ${y - s * 0.9}`} stroke={color} strokeWidth={s * 0.05} fill="none" strokeLinecap="round" />
      <path d={`M ${x + s * 0.18} ${y - s * 0.4} Q ${x + s * 0.3} ${y - s * 0.8} ${x + s * 0.45} ${y - s * 0.9}`} stroke={color} strokeWidth={s * 0.05} fill="none" strokeLinecap="round" />
      <circle cx={x - s * 0.15} cy={y - s * 0.05} r={s * 0.06} fill="#3a2a4d" />
      <circle cx={x + s * 0.15} cy={y - s * 0.05} r={s * 0.06} fill="#3a2a4d" />
      <path d={`M ${x - s * 0.1} ${y + s * 0.15} Q ${x} ${y + s * 0.25} ${x + s * 0.1} ${y + s * 0.15}`} stroke="#3a2a4d" strokeWidth={s * 0.05} fill="none" strokeLinecap="round" />
    </FriendWrap>
  );
}

// 入口：按 kind 路由到对应动物
function Friend({
  x, y, s, color, accent, kind,
}: {
  x: number; y: number; s: number; color: string; accent: string; kind: AnimalKind;
}) {
  switch (kind) {
    case 'bunny':   return <BunnyFriend   x={x} y={y} s={s} color={color} accent={accent} />;
    case 'deer':    return <DeerFriend    x={x} y={y} s={s} color={color} accent={accent} />;
    case 'fox':     return <FoxFriend     x={x} y={y} s={s} color={color} accent={accent} />;
    case 'cat':     return <CatFriend     x={x} y={y} s={s} color={color} accent={accent} />;
    case 'duck':    return <DuckFriend    x={x} y={y} s={s} color={color} accent={accent} />;
    case 'whale':   return <WhaleFriend   x={x} y={y} s={s} color={color} accent={accent} />;
    case 'star':    return <StarFriend    x={x} y={y} s={s} color={color} accent={accent} />;
    case 'moon':    return <MoonFriend    x={x} y={y} s={s} color={color} accent={accent} />;
    case 'cloud':   return <CloudFriend   x={x} y={y} s={s} color={color} accent={accent} />;
    case 'tree':    return <TreeFriend    x={x} y={y} s={s} color={color} accent={accent} />;
    case 'firefly': return <FireflyFriend x={x} y={y} s={s} color={color} accent={accent} />;
    case 'bear':
    default:        return <BearFriend    x={x} y={y} s={s} color={color} accent={accent} />;
  }
}

// ---------------- 其他元素 ---------------- //

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

function Mountain({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <path
      d={`M${x} ${y} L${x - s} ${y + s * 0.85} L${x + s} ${y + s * 0.85} Z`}
      fill={color}
      opacity={0.55}
    />
  );
}

function River({ color }: { color: string }) {
  return (
    <g opacity={0.55}>
      <path
        d="M0 260 Q 120 245 240 255 T 480 250 V300 H0 Z"
        fill={color}
      />
      <path d="M60 270 Q 180 260 300 270" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.25} fill="none" />
      <path d="M200 282 Q 320 272 440 282" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.2} fill="none" />
    </g>
  );
}

function Tree({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <g>
      <rect x={x - s * 0.08} y={y} width={s * 0.16} height={s * 0.55} fill="#3a2a4d" opacity={0.6} />
      <path d={`M${x} ${y - s * 0.9} L${x - s * 0.45} ${y} L${x + s * 0.45} ${y} Z`} fill={color} />
      <path d={`M${x} ${y - s * 1.35} L${x - s * 0.35} ${y - s * 0.45} L${x + s * 0.35} ${y - s * 0.45} Z`} fill={color} opacity={0.85} />
    </g>
  );
}

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

function Firefly({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <circle cx={x} cy={y} r={2.5} fill="#fff6a8" opacity={0.9}>
      <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" repeatCount="indefinite" begin={`${delay}s`} />
      <animate attributeName="r" values="2;3.5;2" dur="2s" repeatCount="indefinite" begin={`${delay}s`} />
    </circle>
  );
}

// 角色名 → AnimalKind 映射（用于在没有显式 friendKind 时按 picked 猜）
function pickKindFromElements(elements: string[]): AnimalKind {
  if (elements.includes('moon')) return 'moon';
  if (elements.includes('cloud')) return 'cloud';
  if (elements.includes('firefly')) return 'firefly';
  return 'bear';
}

/**
 * 老故事兼容：用 characters / scene / pageText 给缺失 friendKind 的页面重新猜一只动物。
 * 优先级：先扫 pageText + scene 的动物关键词；再按 characters 第一个查表/匹配；
 * 再退化到 pickKindFromElements（按元素猜）；最后兜底 bear。
 */
function inferKindFromContext(
  characters: string[] | undefined,
  scene: string | undefined,
  pageText: string | undefined,
  elements: string[],
): AnimalKind {
  const text = `${scene ?? ''}\n${pageText ?? ''}`;
  // 1) 文案/场景里直接出现动物关键词
  for (const [kw, kind] of [
    ['小鹿', 'deer'], ['鹿', 'deer'],
    ['小兔', 'bunny'], ['兔子', 'bunny'], ['兔', 'bunny'],
    ['小熊', 'bear'], ['熊', 'bear'],
    ['小狐狸', 'fox'], ['狐狸', 'fox'], ['狐', 'fox'],
    ['小猫', 'cat'], ['猫咪', 'cat'], ['猫', 'cat'],
    ['小鸭', 'duck'], ['鸭子', 'duck'], ['鸭', 'duck'],
    ['鲸鱼', 'whale'], ['鲸', 'whale'],
    ['星星', 'star'], ['星', 'star'],
    ['月亮', 'moon'], ['月', 'moon'],
    ['云朵', 'cloud'], ['云', 'cloud'],
    ['大树', 'tree'], ['树', 'tree'],
    ['萤火虫', 'firefly'], ['萤火', 'firefly'],
  ] as const) {
    if (text.includes(kw)) return kind as AnimalKind;
  }
  // 2) characters 列表（标准名 / 自定义名都能识别）
  if (characters && characters.length) {
    for (const c of characters) {
      const k = kindFromName(c);
      if (k) return k;
    }
  }
  // 3) 按 elements 启发式（保持向后兼容）
  return pickKindFromElements(elements);
}

// 不同动物的配色（保持柔和、睡前的视觉调性）
const KIND_PALETTE: Record<AnimalKind, { body: string; accent: string }> = {
  bear:    { body: '#f6c97b', accent: '#8b7be8' },
  bunny:   { body: '#ffd9ec', accent: '#ffb3c6' },
  deer:    { body: '#d8a76b', accent: '#fff4cf' },
  fox:     { body: '#ff9d6b', accent: '#ffe1b0' },
  cat:     { body: '#d8d3c8', accent: '#c79bff' },
  duck:    { body: '#ffe066', accent: '#ff9a4a' },
  whale:   { body: '#9bb5e8', accent: '#a7c4ff' },
  star:    { body: '#fff4cf', accent: '#ffe6a8' },
  moon:    { body: '#ffe6a8', accent: '#ffd9e8' },
  cloud:   { body: '#ffffff', accent: '#c79bff' },
  tree:    { body: '#7fc28b', accent: '#5a9b66' },
  firefly: { body: '#fff6a8', accent: '#ffe066' },
};

export function StoryIllustration({
  spec,
  characters,
  scene,
  pageText,
  className,
}: {
  spec: IllustrationSpec;
  /** 故事级的角色列表（用于老故事没有 friendKind 字段时的兜底推断） */
  characters?: string[];
  /** 当前页的场景关键词（用于老故事没有 friendKind 字段时的兜底推断） */
  scene?: string;
  /** 当前页文案（用于老故事没有 friendKind 字段时的兜底推断） */
  pageText?: string;
  className?: string;
}) {
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

  // 决定动物的种类与配色：spec.friendKind 优先（新版数据）；缺失时按文案/角色/元素推断（兼容老数据）
  const kind: AnimalKind = spec.friendKind
    ?? (hasFriend
      ? inferKindFromContext(characters, scene, pageText, spec.elements)
      : 'bear');
  const kindPal = KIND_PALETTE[kind];

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

      {clouds.map((c, i) => (hasCloud || i === 0 ? <Cloud key={c.x} {...c} color="#ffffff" opacity={0.85} /> : null))}

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
      {hasFriend && (
        <Friend
          x={rng.int(120, 200)}
          y={rng.int(180, 210)}
          s={rng.int(22, 28)}
          color={kindPal.body}
          accent={kindPal.accent}
          kind={kind}
        />
      )}

      {fireflyPositions.map((f, i) => (
        <Firefly key={i} x={f.x} y={f.y} delay={f.delay} />
      ))}
    </svg>
  );
}