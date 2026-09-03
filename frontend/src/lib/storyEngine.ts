// 故事生成引擎
// 根据家长输入的参数（孩子名字、喜欢的角色、时长、语速、音量、背景音、哄睡强度、基调、语言）
// 自动生成有起承转合、角色连贯、页数随情节伸缩的哄睡故事（适龄 0-3 岁）。
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

type Beat = 'open' | 'meet' | 'setoff' | 'discover' | 'help' | 'resolve' | 'calm' | 'sleep';

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

// 贯穿全篇的「小任务」——让故事有完整的起承转合（类似童话里的小冒险）
const QUEST_POOL: Record<StoryLang, string[]> = {
  zh: [
    '那颗迷路的小星星',
    '月亮婆婆掉落的银光',
    '一只不敢飘远的小云朵',
    '一朵忘了怎么笑的小花',
    '走丢的小萤火虫',
  ],
  en: [
    'a little lost star',
    'the silver light Grandma Moon dropped',
    'a tiny cloud too shy to drift',
    'a small flower that forgot how to smile',
    'a firefly that wandered off',
  ],
};

// 冒险发生的地方
const PLACE_POOL: Record<StoryLang, string[]> = {
  zh: ['窗外的草地', '软软的云路', '安静的小河边', '开满星星的花园', '月亮的银色山坡'],
  en: ['the grass outside the window', 'a soft road of clouds', 'a quiet little river', 'a garden full of stars', 'the moon’s silver hill'],
};

// 把地点文字映射到插画元素
function placeElement(place: string): string {
  if (/河|溪|水|river/i.test(place)) return 'river';
  if (/云|cloud/i.test(place)) return 'cloud';
  if (/山|坡|丘|hill|园|草|森|树|garden|grass/i.test(place)) return 'hill';
  return 'cloud';
}

// 双语模板：每个节拍提供多句、更有层次的叙事
const TEMPLATES: Record<StoryLang, Record<Beat, { text: string[]; scene: string[] }>> = {
  zh: {
    open: {
      text: [
        '夜色悄悄铺开，{name}揉了揉惺忪的眼睛。窗外的树影轻轻摇晃，像是怕惊扰了这份安静。今夜，{name}的睡前故事要开始啦。',
        '星星一颗接一颗亮起来，像有人在天边点起了小灯笼。{name}钻进软软的被窝，心里却还醒着，像在等一件温柔的事发生。',
        '风把白天的喧闹都吹走了，屋里只剩下暖黄的灯光。{name}打了个小小的哈欠，知道今晚会有一个不一样的故事。',
      ],
      scene: ['夜幕降临，孩子准备入睡', '星星亮起，钻进被窝', '灯光暖黄，等着今夜的故事'],
    },
    meet: {
      text: [
        '门轻轻推开，{char}踮着脚走过来，在{name}床边坐下。它把毛茸茸的手放在{name}手心里，小声说：“别怕，我陪你。”',
        '{char}从窗边飘来，带着一点点月光的气息。它歪着头看{name}，眼里满是温柔：“今晚睡不着吧？那我们去做件温柔的事。”',
        '一只{char}悄悄探出脑袋，笑眯眯地凑近{name}。它轻轻拍了拍枕头，好像在说：“来，我们慢慢来，今天有任务哦。”',
      ],
      scene: ['角色来到床边陪伴', '角色带着月光气息出现', '角色拍拍枕头，温柔靠近'],
    },
    setoff: {
      text: [
        '{name}牵着{char}的手，轻轻跳下床，跟着它走向{place}。夜风软软的，像在给两人悄悄让路。',
        '他们踮着脚从窗台溜出去，踏上了{place}。头頂的星星排成了一条发亮的小路，一直通到远方。',
        '{char}变出一片云当小船，{name}坐上去，两人慢悠悠飘向{place}。风在耳边轻轻哼着歌。',
      ],
      scene: ['牵手出发，走向目的地', '从窗台溜出，踏上星路', '坐云船飘向目的地'],
    },
    discover: {
      text: [
        '到了{place}，{name}一眼就看见了{quest}——它正安安静静地待着，好像早就知道{name}和{char}会来。',
        '{place}上，{quest}微微发着光。{char}悄悄说：“看，就是它。我们轻轻靠近，别吓着它。”',
        '顺着{char}指的方向，{name}在{place}看见了{quest}。它有点孤单，却又努力朝着两人亮了亮。',
      ],
      scene: ['到达目的地，发现小任务', '小任务微微发光，悄悄靠近', '顺着指引看见孤单的小任务'],
    },
    help: {
      text: [
        '{char}蹲下身，把温暖的手放在{quest}旁边。{name}也学它的样子，轻轻吹了口气，光一点点亮了起来。',
        '“别怕，”{char}对{quest}说，又转头对{name}笑，“有你在，什么事情都会变好的。”两人一起，慢慢把它安顿好。',
        '{name}把{quest}轻轻抱起来，{char}在旁边哼起歌。风把白天的烦恼都吹散了，只剩下这一刻的安心。',
        '{char}讲了个{adj}小秘密，{name}咯咯地笑出了声，又赶紧把笑声藏进风里——原来帮忙别人，自己也会变开心。',
      ],
      scene: ['一起帮忙，光慢慢亮起', '鼓励小任务，共同安顿', '抱起小任务，风里哼歌', '听个小秘密，开心地笑'],
    },
    resolve: {
      text: [
        '{quest}稳稳地好了，{place}也变得更亮更暖。{name}和{char}相视一笑——原来帮了别人，自己也会变得更困、更甜。',
        '事情办妥了，{quest}朝他们弯了弯腰，像在说谢谢。{name}心里满满的，眼皮也开始发沉。',
        '{quest}重新亮了起来，把{place}照得温柔又安静。{char}轻轻抱了抱{name}：“我们回去吧，该睡觉啦。”',
      ],
      scene: ['小任务安好，地方更暖', '小任务道谢，心里满足', '小任务重新亮起，准备回家'],
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
        '星星也眨累了，陪着{name}一起闭上了眼睛。{name}的梦里，有{char}，有月亮，还有今夜那件温柔的小事。好梦，{name}。',
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
        'One by one, the stars lit up like tiny lanterns in the sky. {name} snuggled into the cozy blanket, still a little awake, as if waiting for something tender to happen.',
        'The wind blew the daytime noise far away, leaving only a warm yellow light. {name} gave a little yawn, knowing tonight’s story would be a different one.',
      ],
      scene: ['Night falls, child gets ready', 'Stars light up, into bed', 'Warm light, ready to listen'],
    },
    meet: {
      text: [
        'The door opened softly, and {char} tiptoed in to sit by {name}’s bed. It placed a fuzzy hand in {name}’s palm and whispered, "Don’t worry, I am here."',
        '{char} floated in from the window, carrying a hint of moonlight. It tilted its head and looked at {name} with a tender smile: "Can’t sleep? Then let’s do something gentle."',
        'A little {char} peeked out and leaned close to {name} with a grin. It patted the pillow gently, as if to say, "Come, we have a small task tonight."',
      ],
      scene: ['Friend comes to the bedside', 'Friend arrives with moonlight', 'Friend pats the pillow'],
    },
    setoff: {
      text: [
        '{name} held {char}’s hand and stepped softly out of bed, following it toward {place}. The night wind made a gentle path for the two.',
        'They tiptoed out the window and onto {place}. The stars above lined up into a glowing little road that reached far away.',
        '{char} made a cloud into a small boat, {name} climbed in, and they drifted slowly toward {place}. The wind hummed a song by their ear.',
      ],
      scene: ['Hold hands, set off', 'Out the window onto the star road', 'Drift on a cloud boat'],
    },
    discover: {
      text: [
        'At {place}, {name} spotted {quest} right away — it waited quietly, as if it always knew {name} and {char} would come.',
        'On {place}, {quest} glowed softly. {char} whispered, "Look, that’s it. Let’s go close, slowly, so we don’t scare it."',
        'Following where {char} pointed, {name} saw {quest} at {place}. It looked a little lonely, yet tried to brighten for them.',
      ],
      scene: ['Arrive, find the small task', 'Task glows, go close', 'See the lonely little task'],
    },
    help: {
      text: [
        '{char} knelt and put a warm hand near {quest}. {name} did the same and blew a tiny breath — the light grew, little by little.',
        '"Don’t be afraid," {char} told {quest}, then smiled at {name}, "With you here, everything turns out fine." Together they settled it gently.',
        '{name} held {quest} softly while {char} hummed a song. The daytime worries blew away, leaving only this calm moment.',
      ],
      scene: ['Help together, light grows', 'Encourage, settle gently', 'Hold close, hum a song'],
    },
    resolve: {
      text: [
        '{quest} was safe and steady now, and {place} felt warmer and brighter. {name} and {char} smiled at each other — helping someone else made them sleepier and sweeter too.',
        'All done, {quest} bowed to them like saying thank you. {name}’s heart felt full, and the eyelids grew heavy.',
        '{quest} lit up again, softening {place} with a quiet glow. {char} hugged {name} gently: "Let’s go home, time to sleep."',
      ],
      scene: ['Task safe, place warmer', 'Task thanks, heart full', 'Task glows, time to go home'],
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
        'The stars grew tired too, and closed their eyes with {name}. In {name}’s dream there was {char}, the moon, and the tender little thing from tonight. Sweet dreams, {name}.',
        '{name} was almost asleep, still smiling at a funny dream. Good night, {name}.',
        '{char} hummed a lullaby, and {name}’s eyelids grew heavier. In a little while, {name} slept soundly. Sweet dreams.',
      ],
      scene: ['Asleep, dreaming of flowers', 'Slips into dream, good night', 'Stars sleep with the child'],
    },
  },
};

const TITLE_TEMPLATES: Record<StoryLang, string[]> = {
  zh: [
    '{name}和{char}的晚安小任务',
    '{name}的星空小冒险',
    '{char}陪{name}寻光记',
    '{name}的月亮小船',
    '给{name}的温柔晚安',
  ],
  en: [
    '{name} and {char}’s Bedtime Task',
    '{name}’s Starry Little Adventure',
    '{char} and {name}’s Quest for Light',
    '{name}’s Little Moon Boat',
    'A Tender Good Night for {name}',
  ],
};

function fill(tpl: string, name: string, char?: string, quest?: string, place?: string): string {
  return tpl
    .replace(/\{name\}/g, name)
    .replace(/\{char\}/g, char ?? '小伙伴')
    .replace(/\{quest\}/g, quest ?? '一件温柔的小事')
    .replace(/\{place\}/g, place ?? '安静的夜里');
}

// 根据总页数推导「有起承转合」的节拍序列（页数随情节伸缩）
// 结构：开场(open) → 伙伴出现(meet) → 小冒险(setoff/discover/help/resolve) → 安静(calm) → 入睡(sleep)
function deriveBeats(total: number): Beat[] {
  const beats: Beat[] = ['open', 'meet'];
  const journey = Math.max(0, total - 4); // open/meet/calm/sleep 占 4 页，其余是冒险
  if (journey === 1) {
    beats.push('resolve');
  } else if (journey >= 2) {
    beats.push('setoff');
    if (journey >= 3) beats.push('discover');
    const helps = journey - 2 - (journey >= 3 ? 1 : 0);
    for (let i = 0; i < Math.max(0, helps); i++) beats.push('help');
    beats.push('resolve');
  }
  beats.push('calm');
  beats.push('sleep');
  return beats;
}

// 生成每一页的文本、场景与插画
function buildPage(
  rng: Rng,
  beat: Beat,
  idx: number,
  total: number,
  p: StoryParams,
  quest: string,
  place: string,
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

  let text = fill(rng.pick(beatTpl.text), name, char, quest, place);
  // 中文叙事里点缀基调形容词（英文模板已自带语气，不需替换）
  if (lang === 'zh' && beat === 'help' && text.includes('{adj}')) {
    text = text.replace(/\{adj\}/g, rng.pick(tone.adj));
  }
  const scene = rng.pick(beatTpl.scene);

  const elements: string[] = [];
  if (beat === 'open') elements.push('moon', 'stars', 'window');
  else if (beat === 'meet') elements.push('friend', picked === '月亮婆婆' ? 'moon' : 'stars');
  else if (beat === 'setoff') elements.push('cloud', 'stars');
  else if (beat === 'discover') {
    elements.push(placeElement(place));
    if (rng.chance(0.5)) elements.push('friend');
  } else if (beat === 'help') {
    elements.push('friend');
    elements.push(rng.pick(['cloud', 'stars', 'moon']));
  } else if (beat === 'resolve') elements.push('friend', 'moon', 'stars');
  else if (beat === 'calm') elements.push('bed', 'moon');
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

  const quest = rng.pick(QUEST_POOL[p.lang]);
  const place = rng.pick(PLACE_POOL[p.lang]);

  const beats = deriveBeats(total);
  const pages: StoryPage[] = beats.map((beat, idx) => {
    const { text, scene, illustration } = buildPage(rng, beat, idx, beats.length, p, quest, place);
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

/** 重新生成故事文案：保留原有插画与页数，仅替换文本与场景（小任务/地点也会换新，文案更不同） */
export function regenerateStoryText(story: Story): StoryPage[] {
  const p = story.params;
  const rng = new Rng(
    `${p.childName}|${p.characters.join(',')}|${p.tone}|${p.soothing}|${p.lang}|regen|${Date.now()}|${Math.floor(
      Math.random() * 1_000_000
    )}`
  );
  const quest = rng.pick(QUEST_POOL[p.lang]);
  const place = rng.pick(PLACE_POOL[p.lang]);
  const beats = deriveBeats(story.pages.length);
  return story.pages.map((pg, idx) => {
    const { text, scene } = buildPage(rng, beats[idx], idx, story.pages.length, p, quest, place);
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
