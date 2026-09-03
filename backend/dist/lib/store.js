"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrCreateUser = findOrCreateUser;
exports.createToken = createToken;
exports.getUserByToken = getUserByToken;
exports.upsertStory = upsertStory;
exports.listStories = listStories;
exports.getStory = getStory;
exports.deleteStory = deleteStory;
exports.getPreferences = getPreferences;
exports.setPreferences = setPreferences;
// 简易 JSON 文件存储（沙箱内可靠持久化，可平滑替换为 TCB / 数据库）
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
function findDataDir() {
    const candidates = [
        path_1.default.resolve(process.cwd(), 'data'),
        path_1.default.resolve(process.cwd(), 'backend/data'),
        path_1.default.resolve('/workspace/backend/data'),
    ];
    // 优先使用已有 db.json 的目录，保证数据连续性
    for (const dir of candidates) {
        if (fs_1.default.existsSync(path_1.default.join(dir, 'db.json')))
            return dir;
    }
    for (const dir of candidates) {
        try {
            fs_1.default.mkdirSync(dir, { recursive: true });
            const test = path_1.default.join(dir, `.write_test_${Date.now()}`);
            fs_1.default.writeFileSync(test, '');
            fs_1.default.unlinkSync(test);
            return dir;
        }
        catch {
            continue;
        }
    }
    return candidates[0];
}
const DATA_DIR = findDataDir();
const DB_FILE = path_1.default.join(DATA_DIR, 'db.json');
function defaultDB() {
    return { users: [], tokens: {}, stories: [], preferences: {} };
}
function read() {
    try {
        if (!fs_1.default.existsSync(DB_FILE))
            return defaultDB();
        const raw = fs_1.default.readFileSync(DB_FILE, 'utf-8');
        return { ...defaultDB(), ...JSON.parse(raw) };
    }
    catch {
        return defaultDB();
    }
}
function write(db) {
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs_1.default.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs_1.default.renameSync(tmp, DB_FILE);
}
// ---------- 用户 / 鉴权 ----------
function findOrCreateUser(method, identifier, name) {
    const db = read();
    let user = db.users.find((u) => u.method === method && u.identifier === identifier);
    if (!user) {
        user = {
            id: crypto_1.default.randomUUID(),
            name: name || (method === 'phone' ? `宝宝家长${identifier.slice(-4)}` : '微信用户'),
            method,
            identifier,
        };
        db.users.push(user);
        write(db);
    }
    return user;
}
function createToken(userId) {
    const db = read();
    const token = crypto_1.default.randomUUID();
    db.tokens[token] = userId;
    write(db);
    return token;
}
function getUserByToken(token) {
    if (!token)
        return null;
    const db = read();
    const userId = db.tokens[token];
    if (!userId)
        return null;
    return db.users.find((u) => u.id === userId) ?? null;
}
// ---------- 故事 ----------
function upsertStory(story) {
    const db = read();
    const idx = db.stories.findIndex((s) => s.id === story.id && s.userId === story.userId);
    if (idx >= 0)
        db.stories[idx] = story;
    else
        db.stories.push(story);
    write(db);
    return story;
}
function listStories(userId) {
    const db = read();
    return db.stories
        .filter((s) => s.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
function getStory(id, userId) {
    const db = read();
    return db.stories.find((s) => s.id === id && s.userId === userId) ?? null;
}
function deleteStory(id, userId) {
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
function getPreferences(userId) {
    const db = read();
    return db.preferences[userId] ?? null;
}
function setPreferences(userId, prefs) {
    const db = read();
    db.preferences[userId] = prefs;
    write(db);
    return prefs;
}
//# sourceMappingURL=store.js.map