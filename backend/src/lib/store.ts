// 简易 JSON 文件存储（沙箱内可靠持久化，可平滑替换为 TCB / 数据库）
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
}

function defaultDB(): DB {
  return { users: [], tokens: {}, stories: [], preferences: {} };
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
export function findOrCreateUser(method: 'phone' | 'wechat', identifier: string, name?: string): User {
  const db = read();
  let user = db.users.find((u) => u.method === method && u.identifier === identifier);
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      name: name || (method === 'phone' ? `宝宝家长${identifier.slice(-4)}` : '微信用户'),
      method,
      identifier,
    };
    db.users.push(user);
    write(db);
  }
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
