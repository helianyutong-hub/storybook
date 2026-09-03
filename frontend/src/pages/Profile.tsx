import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, LogOut, Phone, MessageCircle, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import { fetchMe } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AuthUser } from '@/types/story';

export default function Profile() {
  const nav = useNavigate();
  const { auth, logout } = useApp();
  const [user, setUser] = useState<AuthUser | null>(auth?.user ?? null);

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
          <h1 className="text-xl font-extrabold">{displayUser.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {displayUser.method === 'wechat' ? '微信登录' : '手机号登录'}
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
