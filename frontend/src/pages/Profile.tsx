import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  LogOut,
  Phone,
  MessageCircle,
  Moon,
  Pencil,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import { fetchMe, updateUserName, setPassword } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthUser } from '@/types/story';

export default function Profile() {
  const nav = useNavigate();
  const { auth, login: setAuth, logout } = useApp();
  const [user, setUser] = useState<AuthUser | null>(auth?.user ?? null);
  /** 昵称编辑状态 */
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  /** 密码设置状态 */
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    // 自动拉取最新用户信息（昵称等）
    if (auth) {
      fetchMe().then((u) => {
        if (u) setUser(u);
      });
    }
  }, [auth]);

  if (!auth) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <Moon className="mb-3 size-10 text-muted-foreground" />
        <p className="text-muted-foreground">你还没有登录</p>
        <Button className="mt-4 rounded-full" onClick={() => nav('/login')}>
          去登录
        </Button>
      </div>
    );
  }

  const displayUser = user ?? auth.user;

  /** 保存昵称 */
  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name) {
      toast.error('昵称不能为空');
      return;
    }
    if (name.length > 20) {
      toast.error('昵称最长 20 个字');
      return;
    }
    setSavingName(true);
    try {
      const updated = await updateUserName(name);
      setUser(updated);
      // 同步更新全局登录态（本地 token 对应的用户名也要变）
      setAuth({ token: auth.token, user: updated });
      toast.success('昵称已更新');
      setEditing(false);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '昵称保存失败，请稍后再试');
    } finally {
      setSavingName(false);
    }
  };

  /** 设置 / 修改密码：之后即可用「手机号 + 密码」免费登录，不用再发短信 */
  const savePwd = async () => {
    if (pwd.length < 6 || pwd.length > 20) {
      toast.error('密码需要 6-20 位');
      return;
    }
    if (pwd !== pwd2) {
      toast.error('两次输入的密码不一致');
      return;
    }
    setSavingPwd(true);
    try {
      await setPassword(pwd);
      toast.success('密码已设置，下次可用手机号 + 密码登录');
      setPwdOpen(false);
      setPwd('');
      setPwd2('');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || '密码设置失败，请稍后再试');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-20 pt-6 sm:px-6">
      <button
        onClick={() => nav(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 返回
      </button>

      <div className="rounded-[2rem] border border-white/10 bg-card/60 p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-20 place-items-center rounded-full bg-primary/15 text-primary">
            <User className="size-9" />
          </div>

          {/* 昵称：点击铅笔可编辑 */}
          {editing ? (
            <div className="mx-auto flex max-w-xs items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={20}
                autoFocus
                className="rounded-2xl bg-white/[0.04] text-center"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <Button
                size="icon"
                className="size-9 shrink-0 rounded-full"
                onClick={saveName}
                disabled={savingName}
                aria-label="保存昵称"
              >
                <Check className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-9 shrink-0 rounded-full"
                onClick={() => setEditing(false)}
                aria-label="取消"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <button
              className="group inline-flex items-center gap-2"
              onClick={() => {
                setNameDraft(displayUser.name);
                setEditing(true);
              }}
              aria-label="修改昵称"
            >
              <h1 className="text-xl font-extrabold">{displayUser.name}</h1>
              <Pencil className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </button>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {displayUser.method === 'wechat' ? '微信登录' : '手机号登录'}
            {!editing && <span className="mx-1">·</span>}
            {!editing && <span className="text-xs">点昵称可修改</span>}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-white/5 text-primary">
              {displayUser.method === 'wechat' ? <MessageCircle className="size-4" /> : <Phone className="size-4" />}
            </span>
            <div>
              <p className="text-xs text-muted-foreground">登录方式</p>
              <p className="text-sm font-semibold">
                {displayUser.method === 'wechat' ? '微信一键登录' : '手机号登录'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-white/5 text-primary">
              <Moon className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">故事同步</p>
              <p className="text-sm font-semibold">已开启云端历史同步</p>
            </div>
          </div>

          {/* 登录密码：设置后可用「手机号 + 密码」登录，不花短信费 */}
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setPwdOpen((v) => !v)}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-primary">
                <Lock className="size-4" />
              </span>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">登录密码</p>
                <p className="text-sm font-semibold">
                  {pwdOpen ? '设置后可用密码登录' : '设置密码（之后登录不花短信费）'}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-primary">
                {pwdOpen ? '收起' : '去设置'}
              </span>
            </button>

            {pwdOpen && (
              <div className="mt-3 space-y-2">
                <Input
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="6-20 位新密码"
                  type="password"
                  maxLength={20}
                  autoComplete="new-password"
                  className="rounded-2xl bg-white/[0.04]"
                />
                <Input
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  placeholder="再输入一次"
                  type="password"
                  maxLength={20}
                  autoComplete="new-password"
                  className="rounded-2xl bg-white/[0.04]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') savePwd();
                    if (e.key === 'Escape') setPwdOpen(false);
                  }}
                />
                <Button
                  className="w-full rounded-2xl"
                  onClick={savePwd}
                  disabled={savingPwd || !pwd || !pwd2}
                >
                  {savingPwd ? '保存中…' : '保存密码'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <Button
          variant="destructive"
          className="mt-6 w-full rounded-2xl"
          onClick={() => {
            logout();
            toast.success('已退出登录');
            nav('/');
          }}
        >
          <LogOut className="size-4" /> 退出登录
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        你的故事与偏好已云端保存，重新登录后可恢复。
      </p>
    </div>
  );
}
