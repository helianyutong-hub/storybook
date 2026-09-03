// 全局应用状态：草稿故事、登录态、上次参数（本地持久化）
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Story, StoryParams, AuthUser, UserPreferences } from '@/types/story';
import { fetchMe } from '@/lib/api';

const DRAFTS_KEY = 'storybook_drafts';
const AUTH_KEY = 'storybook_auth';
const PREFS_KEY = 'storybook_lastparams';

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AppState {
  drafts: Record<string, Story>;
  auth: AuthState | null;
  lastParams: Partial<StoryParams>;
  setDraft: (s: Story) => void;
  getDraft: (id: string) => Story | undefined;
  updateDraft: (id: string, patch: Partial<Story>) => void;
  removeDraft: (id: string) => void;
  login: (auth: AuthState) => void;
  logout: () => void;
  setLastParams: (p: Partial<StoryParams>) => void;
  syncPreferences: (p: UserPreferences) => void;
}

const Ctx = createContext<AppState | null>(null);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, Story>>(() => load(DRAFTS_KEY, {}));
  const [auth, setAuth] = useState<AuthState | null>(() => load(AUTH_KEY, null));
  const [lastParams, setLastParamsState] = useState<Partial<StoryParams>>(() => load(PREFS_KEY, {}));

  useEffect(() => {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);
  useEffect(() => {
    if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    else localStorage.removeItem(AUTH_KEY);
  }, [auth]);
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(lastParams));
  }, [lastParams]);

  // 启动时校验本地 token：若服务端不认识（常见于重新部署后数据重置），则自动退出登录
  useEffect(() => {
    if (!auth) return;
    let alive = true;
    fetchMe().then((user) => {
      if (!alive) return;
      if (!user) setAuth(null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<AppState>(
    () => ({
      drafts,
      auth,
      lastParams,
      setDraft: (s) => setDrafts((d) => ({ ...d, [s.id]: s })),
      getDraft: (id) => drafts[id],
      updateDraft: (id, patch) =>
        setDrafts((d) => (d[id] ? { ...d, [id]: { ...d[id], ...patch } } : d)),
      removeDraft: (id) =>
        setDrafts((d) => {
          const next = { ...d };
          delete next[id];
          return next;
        }),
      login: (a) => setAuth(a),
      logout: () => setAuth(null),
      setLastParams: (p) => setLastParamsState((prev) => ({ ...prev, ...p })),
      syncPreferences: (p) =>
        setLastParamsState((prev) => ({
          ...prev,
          childName: p.childName,
          characters: p.characters,
          ...p.lastParams,
        })),
    }),
    [drafts, auth, lastParams]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
