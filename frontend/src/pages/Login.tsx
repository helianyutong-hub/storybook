import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Moon,
  Phone,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import {
  login,
  registerWithPassword,
  fetchAuthConfig,
  sendSmsCode,
  checkPhone,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESEND_SECONDS = 60;

/** 登录方式：password=账号密码（免费）；code=短信验证码 */
type Tab = 'password' | 'code';
/** 当前页面形态 */
type Mode = 'login' | 'register';

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login: setAuth } = useApp();
  const next = (loc.state as { next?: string } | null)?.next ?? '/history';

  const [mode, setMode] = useState<Mode>('login');
  const [tab, setTab] = useState<Tab>('password');

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const [loading, setLoading] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
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
  const pwdOk = password.length >= 6 && password.length <= 20;

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

  const afterAuth = (name: string) => {
    toast.success(`欢迎，${name}`);
    nav(next, { replace: true });
  };

  /** 密码登录 */
  const doPasswordLogin = async () => {
    if (!phoneOk) return toast.error('请输入正确的 11 位手机号');
    if (!password) return toast.error('请输入密码');
    setLoading(true);
    try {
      const res = await login('phone', phone.trim(), undefined, undefined, 'password', password);
      setAuth({ token: res.token, user: res.user });
      afterAuth(res.user.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  /** 验证码登录 */
  const doCodeLogin = async () => {
    if (!phoneOk) return toast.error('请输入正确的 11 位手机号');
    if (smsEnabled && !/^\d{4,6}$/.test(code.trim())) return toast.error('请输入短信验证码');
    setLoading(true);
    try {
      const res = await login(
        'phone',
        phone.trim(),
        undefined,
        smsEnabled ? code.trim() : undefined,
        'code',
      );
      setAuth({ token: res.token, user: res.user });
      afterAuth(res.user.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  /** 注册 */
  const doRegister = async () => {
    if (!phoneOk) return toast.error('请输入正确的 11 位手机号');
    if (smsEnabled && !/^\d{4,6}$/.test(code.trim())) return toast.error('请输入短信验证码');
    if (!pwdOk) return toast.error('密码需要 6-20 位');
    if (password !== password2) return toast.error('两次输入的密码不一致');
    setLoading(true);
    try {
      const res = await registerWithPassword(
        phone.trim(),
        password,
        undefined,
        smsEnabled ? code.trim() : undefined,
      );
      setAuth({ token: res.token, user: res.user });
      toast.success(res.upgraded ? '密码已设置，欢迎回来' : '注册成功');
      nav(next, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '注册失败';
      toast.error(msg);
      // 已注册 → 自动切到密码登录并保留手机号，少走一步
      if (msg.includes('已注册')) {
        setMode('login');
        setTab('password');
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  };

  /** 手机号填完失焦时探一下：未注册就提示可去注册（仅提示，不阻断） */
  const probePhone = async () => {
    if (!phoneOk || mode !== 'login' || tab !== 'password') return;
    const info = await checkPhone(phone.trim());
    if (!info.hasPassword) {
      toast('这个手机号还没设置密码，可以先注册一个账号', {
        action: {
          label: '去注册',
          onClick: () => {
            setMode('register');
            setPassword('');
            setPassword2('');
          },
        },
      });
    }
  };

  const isRegister = mode === 'register';

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
            {isRegister ? <UserPlus className="size-7" /> : <Moon className="size-7" />}
          </span>
          <h1 className="text-2xl font-extrabold">{isRegister ? '注册账号' : '登录账号'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            登录后故事与偏好云端同步，可跨设备回看历史。
          </p>
        </div>

        {/* 登录/注册 切换 */}
        {!isRegister && (
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.05] p-1">
            <button
              onClick={() => setTab('password')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              密码登录
            </button>
            <button
              onClick={() => setTab('code')}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                tab === 'code' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              验证码登录
            </button>
          </div>
        )}

        {/* 手机号 */}
        <label className="mb-1.5 block text-sm font-semibold">手机号</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          onBlur={probePhone}
          placeholder="11 位手机号"
          inputMode="numeric"
          maxLength={11}
          className="rounded-2xl bg-white/[0.04]"
        />

        {/* 验证码（验证码登录 / 注册且短信已开通） */}
        {((!isRegister && tab === 'code') || (isRegister && smsEnabled)) && (
          <>
            <label className="mb-1.5 mt-4 block text-sm font-semibold">短信验证码</label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder={smsEnabled ? '6 位验证码' : '短信服务开通中'}
                inputMode="numeric"
                maxLength={6}
                disabled={!smsEnabled}
                className="rounded-2xl bg-white/[0.04]"
              />
              <Button
                variant="secondary"
                className="w-28 shrink-0 rounded-2xl"
                onClick={getCode}
                disabled={!smsEnabled || countdown > 0 || sending || !phoneOk}
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
            {!smsEnabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                短信服务开通中：验证码暂不可用，可直接用密码登录或注册。
              </p>
            )}
          </>
        )}

        {/* 密码 */}
        {isRegister || tab === 'password' ? (
          <>
            <label className="mb-1.5 mt-4 block text-sm font-semibold">
              {isRegister ? '设置密码' : '密码'}
            </label>
            <div className="relative">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6-20 位密码"
                type={showPwd ? 'text' : 'password'}
                maxLength={20}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className="rounded-2xl bg-white/[0.04] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPwd ? '隐藏密码' : '显示密码'}
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </>
        ) : null}

        {/* 确认密码（仅注册） */}
        {isRegister && (
          <>
            <label className="mb-1.5 mt-4 block text-sm font-semibold">确认密码</label>
            <Input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="再输入一次密码"
              type={showPwd ? 'text' : 'password'}
              maxLength={20}
              autoComplete="new-password"
              className="rounded-2xl bg-white/[0.04]"
            />
          </>
        )}

        {/* 主按钮 */}
        <Button
          className="mt-6 h-12 w-full rounded-2xl text-base"
          onClick={isRegister ? doRegister : tab === 'password' ? doPasswordLogin : doCodeLogin}
          disabled={loading || !phoneOk}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isRegister ? (
            <UserPlus className="size-4" />
          ) : tab === 'password' ? (
            <Lock className="size-4" />
          ) : (
            <Phone className="size-4" />
          )}
          {isRegister ? '注册并登录' : tab === 'password' ? '登录' : smsEnabled ? '登录' : '直接登录'}
        </Button>

        {/* 登录 / 注册 互切 */}
        <div className="mt-4 text-center text-sm">
          {isRegister ? (
            <button
              onClick={() => {
                setMode('login');
                setPassword('');
                setPassword2('');
              }}
              className="font-semibold text-primary hover:underline"
            >
              已有账号？去登录
            </button>
          ) : (
            <button
              onClick={() => {
                setMode('register');
                setPassword('');
                setPassword2('');
              }}
              className="font-semibold text-primary hover:underline"
            >
              还没有账号？注册一个（不收短信费）
            </button>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-white/[0.03] p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isRegister
              ? '密码加密存储，只有注册时可能需要一次短信验证码。注册后即可用「手机号 + 密码」免费登录。'
              : '密码登录不发送短信、不产生任何费用；登录状态会一直保留，除非你主动退出。'}
          </p>
        </div>
      </div>
    </div>
  );
}
