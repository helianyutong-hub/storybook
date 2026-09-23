// 简易 JSON 文件存储（沙箱内可靠持久化，可平滑替换为 TCB / 数据库）
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { scryptSync, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

function findDataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'backend/data'),
    path.resolve('/workspace/backend/data'),
  ];
  // 优先使用已有 db.json 的目录，保证数据连续性
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'db.json'))) return dir;
  }
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const test = path.join(dir, `.write_test_${Date.now()}`);
      fs.writeFileSync(test, '');
      fs.unlinkSync(test);
      return dir;
    } catch {
      continue;
    }
  }
  return candidates[0];
}

const DATA_DIR = findDataDir();
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface User {
  id: string;
  name: string;
  method: 'phone' | 'wechat';
  identifier: string;
  /** 密码哈希：新注册/改密为 bcrypt（`$2a$...`），历史数据为 scrypt（`salt:hash`）；仅设置过密码的用户才有 */
  passwordHash?: string;
}

export interface StoredStory {
  id: string;
  userId: string;
  title: string;
  childName: string;
  tone: string;
  bgSound: string;
  duration: string;
  pageCount: number;
  createdAt: string;
  approved: boolean;
  data: unknown;
}

export interface Preferences {
  childName: string;
  characters: string[];
  lastParams: Record<string, unknown>;
}

interface DB {
  users: User[];
  tokens: Record<string, string>; // token -> userId
  stories: StoredStory[];
  preferences: Record<string, Preferences>;
  /** 公开分享的故事（不绑定 userId，任何人凭 id 即可读取，用于「分享给好友」） */
  publicStories: StoredStory[];
}

function defaultDB(): DB {
  return { users: [], tokens: {}, stories: [], preferences: {}, publicStories: [] };
}

function read(): DB {
  try {
    if (!fs.existsSync(DB_FILE)) return defaultDB();
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return { ...defaultDB(), ...(JSON.parse(raw) as DB) };
  } catch {
    return defaultDB();
  }
}

function write(db: DB) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---------- 用户 / 鉴权 ----------
/** 手机号登录的随机昵称前缀（可爱风，贴合睡前故事场景） */
const NICKNAME_PREFIXES = [
  '小月亮', '小云朵', '小星星', '小海豚', '小萤火',
  '小奶油', '小棉球', '小夜莺', '小灯笼', '小清风',
];

function randomNickname(): string {
  const prefix = NICKNAME_PREFIXES[Math.floor(Math.random() * NICKNAME_PREFIXES.length)];
  return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
}

export function findOrCreateUser(method: 'phone' | 'wechat', identifier: string, name?: string): User {
  const db = read();
  let user = db.users.find((u) => u.method === method && u.identifier === identifier);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: name || (method === 'phone' ? randomNickname() : '微信用户'),
      method,
      identifier,
    };
    db.users.push(user);
    write(db);
  }
  return user;
}

// ---------- 密码（bcrypt 加盐哈希，绝不明文存储；兼容旧 scrypt 哈希平滑迁移） ----------
const SCRYPT_KEYLEN = 64;
const BCRYPT_ROUNDS = 12;

/** 生成 bcrypt 哈希（自带 salt，格式 `$2a$...`），用于新注册 / 改密 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

/** 是否为 bcrypt 格式（以 $2 开头），否则视为旧 scrypt 哈希 */
function isBcryptHash(stored?: string): boolean {
  return !!stored && stored.startsWith('$2');
}

/**
 * 校验密码。为何兼容双算法：历史数据存的是 scrypt `salt:hash`，
 * 直接切 bcrypt 会导致老用户无法登录；故旧格式走 scrypt 校验，新格式走 bcrypt。
 */
export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    try {
      return bcrypt.compareSync(password, stored);
    } catch {
      return false;
    }
  }
  // 旧 scrypt 哈希兼容路径：保证已注册用户仍能登录，不破坏已有功能
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const computed = scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

/**
 * 登录校验并静默升级：旧 scrypt 用户在登录成功后，自动用 bcrypt 重写哈希，
 * 让历史密码平滑迁移到 bcrypt 且对用户无感。登录接口应改用本函数替代 verifyPassword。
 */
export function verifyPasswordAndUpgrade(phone: string, password: string): boolean {
  const db = read();
  const user = db.users.find((u) => u.method === 'phone' && u.identifier === phone);
  if (!user) return false;
  const ok = verifyPassword(password, user.passwordHash);
  if (ok && user.passwordHash && !isBcryptHash(user.passwordHash)) {
    // 登录成功且仍是旧 scrypt 哈希 → 静默升级为 bcrypt，下次登录即走新算法
    user.passwordHash = hashPassword(password);
    write(db);
  }
  return ok;
}

/** 按手机号查找用户（method='phone'） */
export function findUserByPhone(phone: string): User | null {
  const db = read();
  return db.users.find((u) => u.method === 'phone' && u.identifier === phone) ?? null;
}

/**
 * 注册：手机号 + 密码。
 * 手机号已存在时：若从未设过密码 → 补设密码（视为老用户升级）；否则抛错（已注册）。
 */
export function registerWithPassword(
  phone: string,
  password: string,
  name?: string,
): { user: User; upgraded: boolean } {
  const db = read();
  const existing = db.users.find((u) => u.method === 'phone' && u.identifier === phone);
  if (existing) {
    if (existing.passwordHash) {
      throw new Error('该手机号已注册，请直接用密码登录');
    }
    // 老用户（此前用验证码登录过）→ 补设密码
    existing.passwordHash = hashPassword(password);
    if (name) existing.name = name;
    write(db);
    return { user: existing, upgraded: true };
  }
  const user: User = {
    id: crypto.randomUUID(),
    name: name || randomNickname(),
    method: 'phone',
    identifier: phone,
    passwordHash: hashPassword(password),
  };
  db.users.push(user);
  write(db);
  return { user, upgraded: false };
}

/** 设置 / 修改密码（需登录，调用前应已鉴权） */
export function setUserPassword(userId: string, password: string): User {
  const db = read();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('用户不存在');
  user.passwordHash = hashPassword(password);
  write(db);
  return user;
}

/**
 * 忘记密码：按手机号直接重置密码。
 * 注意：本实现为演示模式，未做短信/邮箱验证（当前服务器未配置阿里云短信）。
 * 生产环境应改为「发送验证码 → 校验验证码 → 再重置」，避免任何人凭手机号直接改密。
 */
export function resetPasswordByPhone(phone: string, newPassword: string): User {
  const db = read();
  const user = db.users.find((u) => u.method === 'phone' && u.identifier === phone);
  if (!user) throw new Error('该手机号未注册');
  user.passwordHash = hashPassword(newPassword);
  write(db);
  return user;
}

/** 修改用户昵称（不存在时返回原样，调用前应先鉴权） */
export function updateUserName(userId: string, name: string): User {
  const db = read();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('用户不存在');
  user.name = name;
  write(db);
  return user;
}

export function createToken(userId: string): string {
  const db = read();
  const token = crypto.randomUUID();
  db.tokens[token] = userId;
  write(db);
  return token;
}

export function getUserByToken(token?: string): User | null {
  if (!token) return null;
  const db = read();
  const userId = db.tokens[token];
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

// ---------- 故事 ----------
export function upsertStory(story: StoredStory): StoredStory {
  const db = read();
  const idx = db.stories.findIndex((s) => s.id === story.id && s.userId === story.userId);
  if (idx >= 0) db.stories[idx] = story;
  else db.stories.push(story);
  write(db);
  return story;
}

export function listStories(userId: string): StoredStory[] {
  const db = read();
  return db.stories
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getStory(id: string, userId: string): StoredStory | null {
  const db = read();
  return db.stories.find((s) => s.id === id && s.userId === userId) ?? null;
}

export function deleteStory(id: string, userId: string): boolean {
  const db = read();
  const before = db.stories.length;
  db.stories = db.stories.filter((s) => !(s.id === id && s.userId === userId));
  if (db.stories.length !== before) {
    write(db);
    return true;
  }
  return false;
}

// ---------- 公开分享的故事（分享给好友，不绑定用户） ----------
export function upsertPublicStory(story: StoredStory): StoredStory {
  const db = read();
  const idx = db.publicStories.findIndex((s) => s.id === story.id);
  if (idx >= 0) db.publicStories[idx] = story;
  else db.publicStories.push(story);
  write(db);
  return story;
}

export function getPublicStory(id: string): StoredStory | null {
  const db = read();
  return db.publicStories.find((s) => s.id === id) ?? null;
}

// ---------- 偏好 ----------
export function getPreferences(userId: string): Preferences | null {
  const db = read();
  return db.preferences[userId] ?? null;
}

export function setPreferences(userId: string, prefs: Preferences): Preferences {
  const db = read();
  db.preferences[userId] = prefs;
  write(db);
  return prefs;
}
