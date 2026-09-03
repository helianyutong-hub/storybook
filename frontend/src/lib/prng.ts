// 可复现的伪随机数生成器（mulberry32）
// 用于让同一份参数 / 同一颗种子生成稳定的故事与插画

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 将字符串转成数字种子 */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private next: () => number;
  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashSeed(seed) : seed;
    this.next = mulberry32(s);
  }
  /** [0,1) */
  float() {
    return this.next();
  }
  /** [min,max] 整数 */
  int(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  /** 从数组中随机取一个 */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** 随机取 n 个不重复元素 */
  sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    while (out.length < n && copy.length) {
      const i = Math.floor(this.next() * copy.length);
      out.push(copy.splice(i, 1)[0]);
    }
    return out;
  }
  /** 概率为 p 时返回 true */
  chance(p: number) {
    return this.next() < p;
  }
}
