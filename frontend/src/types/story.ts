// 故事书相关类型定义

/** 哄睡基调 */
export type SoothingTone = 'gentle' | 'playful' | 'calm' | 'lullaby';

/** 朗读语言 */
export type StoryLang = 'zh' | 'en';

/** 背景音效 */
export type BgSound = 'none' | 'rain' | 'waves' | 'wind' | 'heartbeat' | 'music';

/** 故事时长档位（决定页数） */
export type Duration = 'short' | 'medium' | 'long';

/** 语速档位（决定朗读节奏） */
export type Pace = 'slow' | 'normal' | 'bright';

/** 插画配色方案 */
export type Palette = 'night' | 'dawn' | 'dream' | 'cozy';

/** 家长输入的定制参数 */
export interface StoryParams {
  /** 孩子名字 */
  childName: string;
  /** 喜欢的角色 */
  characters: string[];
  /** 故事时长 */
  duration: Duration;
  /** 语速 */
  pace: Pace;
  /** 音量 0-1 */
  volume: number;
  /** 背景音效 */
  bgSound: BgSound;
  /** 哄睡强度 0-100 */
  soothing: number;
  /** 哄睡基调 */
  tone: SoothingTone;
  /** 朗读语言 */
  lang: StoryLang;
}

/** 单页插画规格（由故事引擎生成，喂给插画生成器） */
export interface IllustrationSpec {
  /** 随机种子，保证同一页插画稳定 */
  seed: number;
  /** 配色方案 */
  palette: Palette;
  /** 场景元素关键词 */
  elements: string[];
  /** 情绪基调 */
  mood: SoothingTone;
  /** 是否包含孩子形象 */
  hasChild: boolean;
}

/** 故事单页 */
export interface StoryPage {
  id: string;
  /** 该页旁白文本 */
  text: string;
  /** 插画规格 */
  illustration: IllustrationSpec;
  /** 简短场景提示（用于家长预览） */
  scene: string;
}

/** 一个完整的故事书 */
export interface Story {
  id: string;
  title: string;
  /** 制作时使用的参数 */
  params: StoryParams;
  pages: StoryPage[];
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 是否已在家长预览中确认 */
  approved: boolean;
  /** 服务端生成的每页语音 URL（微信等不支持 Web Speech 的浏览器会用到；生成失败的页为 null） */
  audioUrls?: (string | null)[];
}

/** 可保存的故事摘要（历史列表用） */
export interface StorySummary {
  id: string;
  title: string;
  childName: string;
  tone: SoothingTone;
  bgSound: BgSound;
  duration: Duration;
  pageCount: number;
  createdAt: string;
  approved: boolean;
}

/** 用户偏好（云端同步） */
export interface UserPreferences {
  childName: string;
  characters: string[];
  lastParams: Partial<StoryParams>;
}

/** 登录用户 */
export interface AuthUser {
  id: string;
  name: string;
  method: 'phone' | 'wechat';
}

/** 时长 → 页数映射 */
export const DURATION_PAGES: Record<Duration, number> = {
  short: 4,
  medium: 6,
  long: 8,
};

/** 语速 → 朗读速率映射（SpeechSynthesis rate） */
export const PACE_RATE: Record<Pace, number> = {
  slow: 0.78,
  normal: 0.92,
  bright: 1.05,
};

export const TONE_LABELS: Record<SoothingTone, string> = {
  gentle: '温柔轻缓',
  playful: '活泼可爱',
  calm: '宁静安详',
  lullaby: '摇篮曲风',
};

export const LANG_LABELS: Record<StoryLang, string> = {
  zh: '中文',
  en: 'English',
};

export const BG_SOUND_LABELS: Record<BgSound, string> = {
  none: '无',
  rain: '细雨',
  waves: '海浪',
  wind: '微风',
  heartbeat: '心跳',
  music: '轻柔乐',
};

export const DURATION_LABELS: Record<Duration, string> = {
  short: '短（4页）',
  medium: '中（6页）',
  long: '长（8页）',
};

export const PACE_LABELS: Record<Pace, string> = {
  slow: '慢（更催眠）',
  normal: '适中',
  bright: '轻快',
};

/** 可选角色库 */
export const CHARACTER_LIBRARY = [
  '小熊',
  '小兔',
  '小鸭子',
  '小猫咪',
  '小鹿',
  '小星星',
  '月亮婆婆',
  '云朵宝宝',
  '小鲸鱼',
  '小狐狸',
  '大树爷爷',
  '萤火虫',
];
