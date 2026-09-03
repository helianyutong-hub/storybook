// 故事生成引擎
// 根据家长输入的参数（孩子名字、喜欢的角色、时长、语速、音量、背景音、哄睡强度、基调、语言）
// 自动适配故事篇幅、内容风格、插画图与情绪，生成适龄（0-3岁）的哄睡故事。
// 该引擎为本地可复现生成，结构清晰、可平滑替换为真实 LLM 接口。

import { Rng } from './prng';
import {
  DURATION_PAGES,
  Story,
  StoryPage,
  StoryParams,
  StoryLang,
  SoothingTone,
  Palette,
  IllustrationSpec,
} from '@/types/story';

type Beat = 'open' | 'meet' | 'play' | 'calm' | 'sleep';

// 角色英文名映射（用于英文故事）
const CHAR_EN: Record<string, string> = {
  小熊: 'a little bear',
  小兔: 'a little bunny',
  小鸭子: 'a little duck',
  小猫咪: 'a little cat',
  小鹿: 'a little deer',
  小星星: 'a little star',
  月亮婆婆: 'Grandma Moon',
  云朵宝宝: 'Baby Cloud',
  小鲸鱼: 'a little whale',
  小狐狸: 'a little fox',
  大树爷爷: 'Old Tree',
  萤火虫: 'a firefly',
};

// 不同基调的形容词池（中文叙事用）
const TONE_WORDS: Record<SoothingTone, { adj: string[]; verb: string[] }> = {
  gentle: { adj: ['温柔的', '轻轻的', '软软的', '暖暖的'], verb: ['依偎着', '慢慢晃着', '悄悄看着'] },
  playful: { adj: ['调皮的', '笑眯眯的', '蹦蹦跳跳的'], verb: ['转了个圈', '轻轻戳了戳', '眨眨眼'] },
  calm: { adj: ['安静的', '宁静的', '平和的', '缓缓的'], verb: ['静静躺着', '慢慢呼吸', '轻轻飘着'] },
  lullaby: { adj: ['摇篮般的', '哼唱着的', '晃悠悠的'], verb: ['跟着拍子摇', '哼起小调', '随节奏晃'] },
};

// 双语模板：每个节拍提供多句、更有层次的叙事
const TEMPLATES: Record<StoryLang, Record<Beat, { text: string[]; scene: string[] }>> = {
  zh: {
    open: {
      text: [
        '夜色悄悄铺开，{name}揉了揉惺忪的眼睛。窗外的树影轻轻摇晃，像是怕惊扰了这份安静。今夜，{name}的睡前故事要开始啦。',
        '星星一颗接一颗亮起来，像有人在天边点起了小灯笼。{name}钻进软软的被窝，等着属于今晚的温柔故事。',
        '风把白天的喧闹都吹走了，屋里只剩下暖黄的灯光。{name}打了个小小的哈欠，知道该闭上眼睛听故事了。',
      ],
      scene: ['夜幕降临，孩子准备入睡', '星星亮起，钻进被窝', '灯光暖黄，准备听故事'],
    },
    meet: {
      text: [
        '门轻轻推开，{char}踮着脚走过来，在{name}床边坐下。它把毛茸茸的手放在{name}手心里，小声说：“别怕，我陪你。”',
        '{char}从窗边飘来，带着一点点月光的气息。它歪着头看{name}，眼里满是温柔：“今天也要好好睡哦。”',
        '一只{char}悄悄探出脑袋，笑眯眯地凑近{name}。它轻轻拍了拍枕头，好像在说：“来，我们慢慢来。”',
      ],
      scene: ['角色来到床边陪伴', '角色带着月光气息出现', '角色拍拍枕头，温柔靠近'],
    },
    play: {
      text: [
        '{name}和{char}一起数窗外的星星，一颗、两颗、三颗……数着数着，{name}的眼皮就变得沉甸甸的了。',
        '软软的云朵飘到窗前，{name}和{char}坐上去轻轻摇晃，像躺在最舒服的摇篮里。云朵带着他们慢慢飘，风在耳边哼着歌。',
        '{name}指着天上那颗最亮的星星问{char}：“它是不是也在看我？”{char}点点头，把{name}搂得更紧了些。',
        '小河边，{name}和{char}蹲下来，看水面上晃动的月光。{char}说：“听，水在唱歌呢。”{name}闭上眼睛，真的听见了。',
        '{char}讲了个{adj}小秘密，{name}咯咯地笑出了声，又赶紧把笑声藏进被子里。',
      ],
      scene: ['一起数星星，眼皮变沉', '坐上云朵轻轻摇晃', '指着最亮的星星提问', '小河边看月光荡漾', '听角色讲一个小秘密'],
    },
    calm: {
      text: [
        '{name}打了个大大的哈欠，困意像潮水一样慢慢漫上来。{char}轻轻拍着{name}的背，一下，又一下，和着呼吸的节奏。',
        '灯光被调得更加柔和，{name}把小被子拉到了下巴。世界一点点安静下来，只剩下{char}轻轻的陪伴。',
        '{name}的眼睛慢慢合上，长长的睫毛不再颤动。{char}守在一旁，像一棵安静的树，挡住了所有吵闹。',
      ],
      scene: ['困意袭来，轻轻拍背', '拉好被子，世界安静', '眼睛合上，角色守护'],
    },
    sleep: {
      text: [
        '{name}睡着啦，嘴角弯弯的，梦里开满了温柔的小花。晚安，{name}，愿你好梦连连。',
        '呼吸变得长长的、轻轻的，{name}滑进了甜甜的梦乡。{char}在床边轻声说：“晚安，我的小宝贝。”',
        '星星也眨累了，陪着{name}一起闭上了眼睛。{name}的梦里，有{char}，有月亮，还有数不清的温柔。好梦，{name}。',
        '{name}快要睡着啦，还偷偷笑了笑，像是梦到了好玩的事。晚安，{name}。',
        '{char}哼起轻轻的调子，{name}的眼皮越来越沉。再一会儿，{name}就稳稳地睡熟了。好梦。',
      ],
      scene: ['安然入睡，梦里开花', '滑入梦乡，轻声道晚安', '星星陪伴一起闭眼'],
    },
  },
  en: {
    open: {
      text: [
        'The night came soft and quiet, and {name} rubbed sleepy eyes. The trees outside swayed gently, as if they did not want to wake anyone. Tonight, {name}’s bedtime story was about to begin.',
        'One by one, the stars lit up like tiny lanterns in the sky. {name} snuggled into the cozy blanket, waiting for a gentle story made just for tonight.',
        'The wind blew the daytime noise far away, leaving only a warm yellow light. {name} gave a little yawn, knowing it was time to close eyes and listen.',
      ],
      scene: ['Night falls, child gets ready', 'Stars light up, into bed', 'Warm light, ready to listen'],
    },
    meet: {
      text: [
        'The door opened softly, and {char} tiptoed in to sit by {name}’s bed. It placed a fuzzy hand in {name}’s palm and whispered, "Don’t worry, I am here."',
        '{char} floated in from the window, carrying a hint of moonlight. It tilted its head and looked at {name} with a tender smile: "Time to sleep well tonight."',
        'A little {char} peeked out and leaned close to {name} with a grin. It patted the pillow gently, as if to say, "Come, let’s take it slow."',
      ],
      scene: ['Friend comes to the bedside', 'Friend arrives with moonlight', 'Friend pats the pillow'],
    },
    play: {
      text: [
        '{name} and {char} counted the stars outside: one, two, three... Counting and counting, {name}’s eyelids grew heavy and warm.',
        'A soft cloud drifted to the window, and {name} and {char} sat on it and rocked gently, like in the comfiest cradle. The cloud carried them slowly while the wind hummed a song.',
        '{name} pointed at the brightest star and asked {char}, "Is it looking at me too?" {char} nodded and held {name} a little closer.',
        'By the little river, {name} and {char} knelt to watch the moonlight dance on the water. {char} said, "Listen, the water is singing." {name} closed eyes and really heard it.',
        '{char} told a little secret, and {name} giggled, then quickly hid the laugh under the blanket.',
      ],
      scene: ['Count stars, eyes grow heavy', 'Rock on a soft cloud', 'Point at the brightest star', 'Watch moonlight by the river', 'Hear a little secret'],
    },
    calm: {
      text: [
        '{name} gave a big yawn, and sleepiness rolled in like a gentle tide. {char} patted {name}’s back, slow and steady, keeping time with the breathing.',
        'The light grew softer, and {name} pulled the blanket up to the chin. The world quieted down, leaving only {char}’s gentle company.',
        '{name}’s eyes slowly closed, the long lashes no longer fluttering. {char} stayed close, like a quiet tree, blocking all the noise.',
      ],
      scene: ['Yawn, gentle back pats', 'Blanket up, world quiets', 'Eyes close, friend stays'],
    },
    sleep: {
      text: [
        '{name} fell asleep with a tiny smile, dreaming of soft little flowers. Good night, {name}, may your dreams be sweet.',
        'Breaths grew long and light, and {name} slipped into a sweet dream. {char} whispered by the bed, "Good night, my little one."',
        'The stars grew tired too, and closed their eyes with {name}. In {name}’s dream there was {char}, the moon, and endless tenderness. Sweet dreams, {name}.',
        '{name} was almost asleep, still smiling at a funny dream. Good night, {name}.',
        '{char} hummed a lullaby, and {name}’s eyelids grew heavier. In a little while, {name} slept soundly. Sweet dreams.',
      ],
      scene: ['Asleep, dreaming of flowers', 'Slips into dream, good night', 'Stars sleep with the child'],
    },
  },
};

const TITLE_TEMPLATES: Record<StoryLang, string[]> = {
  zh: [
    '{name}和{char}的晚安时光',
    '{name}的星空摇篮曲',
    '{char}陪{name}入睡',
    '{name}的月亮小船',
    '给{name}的温柔晚安',
  ],
  en: [
    '{name} and {char}’s Bedtime',
    '{name}’s Starry Lullaby',
    '{char} Stays with {name}',
    '{name}’s Little Moon Boat',
    'A Tender Good Night for {name}',
  ],
};

function fill(tpl: string, name: string, char?: string): string {
  return tpl.replace(/\{name\}/g, name).replace(/\{char\}/g, char ?? '小伙伴');
}

// 根据总页数推导节拍序列
function deriveBeats(total: number): Beat[] {
  const beats: Beat[] = ['open', 'meet'];
  const playCount = Math.max(1, total - 4);
  for (let i = 0; i < playCount; i++) beats.push('play');
  beats.push('calm');
  beats.push('sleep');
  while (beats.length > total) beats.pop();
  while (beats.length < total) beats.splice(beats.length - 1, 0, 'play');
  return beats;
}

// 生成每一页的文本、场景与插画
function buildPage(
  rng: Rng,
  beat: Beat,
  idx: number,
  total: number,
  p: StoryParams
): { text: string; scene: string; illustration: IllustrationSpec } {
  const lang = p.lang;
  const t = TEMPLATES[lang];
  const beatTpl = t[beat];

  const name = (p.childName ?? '').trim() || (lang === 'en' ? 'little one' : '宝宝');
  const picked =
    p.characters && p.characters.length
      ? rng.pick(p.characters)
      : lang === 'en'
        ? 'a little bear'
        : '小熊';
  const char = lang === 'en' ? CHAR_EN[picked] ?? 'a little friend' : picked;
  const tone = TONE_WORDS[p.tone];

  let text = fill(rng.pick(beatTpl.text), name, char);
  // 中文叙事里点缀基调形容词（英文模板已自带语气，不需替换）
  if (lang === 'zh' && beat === 'play' && text.includes('{adj}')) {
    text = text.replace(/\{adj\}/g, rng.pick(tone.adj));
  }
  const scene = rng.pick(beatTpl.scene);

  const elements: string[] = [];
  if (beat === 'open') elements.push('moon', 'stars', 'window');
  else if (beat === 'meet') elements.push('friend', picked === '月亮婆婆' ? 'moon' : 'stars');
  else if (beat === 'play') {
    elements.push(rng.pick(['cloud', 'stars', 'river', 'hill']));
    if (rng.chance(0.5)) elements.push('friend');
  } else if (beat === 'calm') elements.push('bed', 'moon');
  else elements.push('bed', 'moon', 'stars');

  // 配色随进度由夜色过渡到温暖梦境
  let palette: Palette;
  const ratio = total <= 1 ? 0 : idx / (total - 1);
  if (ratio < 0.34) palette = 'night';
  else if (ratio < 0.7) palette = 'dream';
  else palette = 'cozy';

  const illustration: IllustrationSpec = {
    seed: rng.int(1, 1_000_000),
    palette,
    elements: Array.from(new Set(elements)),
    mood: p.tone,
    hasChild: beat !== 'open' || rng.chance(0.3),
  };

  return { text, scene, illustration };
}

/** 根据参数生成完整故事（nonce 用于「重新生成」时产生不同文案） */
export function generateStory(input: StoryParams, nonce = 0): Story {
  const p: StoryParams = {
    childName: input.childName ?? '',
    characters: input.characters ?? [],
    duration: input.duration ?? 'medium',
    pace: input.pace ?? 'slow',
    volume: input.volume ?? 0.8,
    bgSound: input.bgSound ?? 'rain',
    soothing: input.soothing ?? 70,
    tone: input.tone ?? 'gentle',
    lang: input.lang ?? 'zh',
  };
  const total = DURATION_PAGES[p.duration];
  const seedBase = `${p.childName}|${p.characters.join(',')}|${p.duration}|${p.tone}|${p.soothing}|${p.bgSound}|${p.lang}|${nonce}`;
  const rng = new Rng(seedBase);

  const beats = deriveBeats(total);
  const pages: StoryPage[] = beats.map((beat, idx) => {
    const { text, scene, illustration } = buildPage(rng, beat, idx, beats.length, p);
    return {
      id: `p${idx}-${rng.int(1000, 9999)}`,
      text,
      scene,
      illustration,
    };
  });

  const title = makeTitle(rng, p);

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${rng.int(100, 999)}`,
    title,
    params: p,
    pages,
    createdAt: new Date().toISOString(),
    approved: false,
  };
}

function makeTitle(rng: Rng, p: StoryParams): string {
  const lang = p.lang;
  const name = (p.childName ?? '').trim() || (lang === 'en' ? 'little one' : '宝宝');
  const picked =
    p.characters && p.characters.length ? rng.pick(p.characters) : lang === 'en' ? 'a little bear' : '小熊';
  const char = lang === 'en' ? CHAR_EN[picked] ?? 'a little friend' : picked;
  return fill(rng.pick(TITLE_TEMPLATES[lang]), name, char);
}

/** 重新生成故事文案：保留原有插画与页数，仅替换文本与场景 */
export function regenerateStoryText(story: Story): StoryPage[] {
  const p = story.params;
  const beats = deriveBeats(story.pages.length);
  const rng = new Rng(
    `${p.childName}|${p.characters.join(',')}|${p.tone}|${p.soothing}|${p.lang}|regen|${Date.now()}|${Math.floor(
      Math.random() * 1_000_000
    )}`
  );
  return story.pages.map((pg, idx) => {
    const { text, scene } = buildPage(rng, beats[idx], idx, story.pages.length, p);
    return { ...pg, text, scene };
  });
}

/**
 * 根据 LLM 返回的标题与每页 {text, scene} 构建完整故事。
 * 插画规格按进度由夜色过渡到温暖梦境，并依据每页 scene 文本关键词
 * 挑选场景元素，让插画尽量匹配该页情节（需求 4：每页插画随情节匹配）。
 */
export function buildStoryFromLLM(
  raw: { title: string; pages: { text: string; scene: string }[] },
  input: StoryParams,
): Story {
  const p: StoryParams = {
    childName: input.childName ?? '',
    characters: input.characters ?? [],
    duration: input.duration ?? 'medium',
    pace: input.pace ?? 'slow',
    volume: input.volume ?? 0.8,
    bgSound: input.bgSound ?? 'rain',
    soothing: input.soothing ?? 70,
    tone: input.tone ?? 'gentle',
    lang: input.lang ?? 'zh',
  };
  const total = raw.pages.length;
  const rng = new Rng(`llm|${p.childName}|${p.characters.join(',')}|${p.lang}|${Date.now()}|${Math.floor(Math.random() * 1_000_000)}`);

  const pages: StoryPage[] = raw.pages.map((pg, idx) => ({
    id: `p${idx}-${rng.int(1000, 9999)}`,
    text: pg.text,
    scene: pg.scene,
    illustration: makeIllustrationForLLM(rng, idx, total, p, pg.scene),
  }));

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${rng.int(100, 999)}`,
    title: raw.title || makeTitle(rng, p),
    params: p,
    pages,
    createdAt: new Date().toISOString(),
    approved: false,
  };
}

// 依据 scene 文本关键词挑选插画元素，并随进度过渡配色
function makeIllustrationForLLM(
  rng: Rng,
  idx: number,
  total: number,
  p: StoryParams,
  sceneText: string,
): IllustrationSpec {
  const t = sceneText || '';
  const elements = new Set<string>();

  if (/月|moon/i.test(t)) elements.add('moon');
  if (/星|star/i.test(t)) elements.add('stars');
  if (/云|cloud/i.test(t)) elements.add('cloud');
  if (/河|溪|水|river|stream/i.test(t)) elements.add('river');
  if (/山|丘|hill|原|forest|树|tree/i.test(t)) elements.add('hill');
  if (/床|被|睡|sleep|枕|bed/i.test(t)) {
    elements.add('bed');
    elements.add('moon');
  }
  if (
    /朋|伙|伴|friend|小熊|小兔|小狐狸|小鹿|小鸭|小鲸|猫咪|小星星|月亮婆婆|云朵|萤火|大樹|大树/i.test(t) ||
    p.characters.length
  ) {
    elements.add('friend');
  }

  // 保底元素，避免页面太空
  if (!elements.has('stars') && !elements.has('moon')) elements.add('stars');
  if (idx < total - 1 && !elements.has('cloud') && rng.chance(0.5)) elements.add('cloud');

  const ratio = total <= 1 ? 0 : idx / (total - 1);
  let palette: Palette;
  if (ratio < 0.34) palette = 'night';
  else if (ratio < 0.7) palette = 'dream';
  else palette = 'cozy';

  return {
    seed: rng.int(1, 1_000_000),
    palette,
    elements: Array.from(elements),
    mood: p.tone,
    hasChild: idx === 0 ? rng.chance(0.4) : true,
  };
}

/** 把故事对象压缩为历史列表用的摘要 */
export function toSummary(s: Story) {
  return {
    id: s.id,
    title: s.title,
    childName: s.params.childName || '宝宝',
    tone: s.params.tone,
    bgSound: s.params.bgSound,
    duration: s.params.duration,
    pageCount: s.pages.length,
    createdAt: s.createdAt,
    approved: s.approved,
  };
}
