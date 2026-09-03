import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Phone, MessageCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import { login } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login: setAuth } = useApp();
  const next = (loc.state as { next?: string } | null)?.next ?? '/history';
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const doLogin = async (method: 'phone' | 'wechat', identifier: string, displayName?: string) => {
    setLoading(true);
    try {
      const res = await login(method, identifier, displayName);
      setAuth({ token: res.token, user: res.user });
      toast.success(`欢迎，${res.user.name}`);
      nav(next, { replace: true });
    } catch {
      toast.error('登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const phoneLogin = () => {
    const p = phone.trim();
    if (!/^1\d{10}$/.test(p)) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    doLogin('phone', p);
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6">
      <button
        onClick={() => nav(-1)}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> 返回
      </button>

      <div className="rounded-[2rem] border border-white/10 bg-card/60 p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Moon className="size-7" />
          </span>
          <h1 className="text-2xl font-extrabold">登录账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            登录后故事与偏好云端同步，可跨设备回看历史。
          </p>
        </div>

        <label className="mb-1.5 block text-sm font-semibold">手机号</label>
        <div className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11 位手机号"
            inputMode="numeric"
            maxLength={11}
            className="rounded-2xl bg-white/[0.04]"
          />
          <Button
            className="rounded-2xl"
            onClick={phoneLogin}
            disabled={loading}
          >
            <Phone className="size-4" /> 登录
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          演示环境：无需真实验证码，输入任意 11 位手机号即可登录。
        </p>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-white/10" /> 或 <span className="h-px flex-1 bg-white/10" />
        </div>

        <Button
          variant="secondary"
          className="h-12 w-full rounded-2xl"
          onClick={() => doLogin('wechat', `wx_${Date.now()}`, `微信用户${String(Date.now()).slice(-4)}`)}
          disabled={loading}
        >
          <MessageCircle className="size-4" /> 微信一键登录
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        我们仅用于同步你的故事与偏好，不会用于任何社交或商业用途。
      </p>
    </div>
  );
}
