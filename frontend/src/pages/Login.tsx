import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Moon, Phone, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import { login, fetchAuthConfig, sendSmsCode } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESEND_SECONDS = 60;

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login: setAuth } = useApp();
  const next = (loc.state as { next?: string } | null)?.next ?? '/history';
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null); // null=查询中
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 查询后端是否已启用真实短信验证码（未配置密钥 → 演示模式）
  useEffect(() => {
    fetchAuthConfig().then((c) => setSmsEnabled(c.smsEnabled));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [countdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const phoneOk = /^1\d{10}$/.test(phone.trim());

  /** 获取验证码 */
  const getCode = async () => {
    if (!phoneOk) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    if (countdown > 0 || sending) return;
    setSending(true);
    try {
      await sendSmsCode(phone.trim());
      toast.success('验证码已发送，注意查收短信');
      setCountdown(RESEND_SECONDS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  /** 登录 */
  const doLogin = async () => {
    const p = phone.trim();
    if (!phoneOk) {
      toast.error('请输入正确的 11 位手机号');
      return;
    }
    if (smsEnabled && !/^\d{4,6}$/.test(code.trim())) {
      toast.error('请输入短信验证码');
      return;
    }
    setLoading(true);
    try {
      const res = await login('phone', p, undefined, smsEnabled ? code.trim() : undefined);
      setAuth({ token: res.token, user: res.user });
      toast.success(`欢迎，${res.user.name}`);
      nav(next, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
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
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="11 位手机号"
          inputMode="numeric"
          maxLength={11}
          className="rounded-2xl bg-white/[0.04]"
        />

        {smsEnabled === false ? (
          <p className="mt-2 text-xs text-muted-foreground">
            短信服务开通中：输入手机号即可直接登录（演示模式）。
          </p>
        ) : (
          <>
            <label className="mb-1.5 mt-4 block text-sm font-semibold">短信验证码</label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder={
                  smsEnabled === null ? '加载中…' : smsEnabled ? '6 位验证码' : '短信服务开通中'
                }
                inputMode="numeric"
                maxLength={6}
                disabled={smsEnabled !== true}
                className="rounded-2xl bg-white/[0.04]"
              />
              <Button
                variant="secondary"
                className="w-28 shrink-0 rounded-2xl"
                onClick={getCode}
                disabled={smsEnabled !== true || countdown > 0 || sending || !phoneOk}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : countdown > 0 ? (
                  `${countdown}s 后重发`
                ) : (
                  '获取验证码'
                )}
              </Button>
            </div>
          </>
        )}

        <Button
          className="mt-6 h-12 w-full rounded-2xl text-base"
          onClick={doLogin}
          disabled={loading || !phoneOk}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
          {smsEnabled ? '登录' : '直接登录'}
        </Button>

        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-white/[0.03] p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            首次登录会自动创建账号并生成随机昵称，可在「个人中心」修改。
            我们仅用于同步你的故事与偏好，不会用于任何社交或商业用途。
          </p>
        </div>
      </div>
    </div>
  );
}
