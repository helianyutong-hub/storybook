import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Moon,
  ArrowLeft,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/store/AppStore';
import { login, registerWithPassword, checkPhone } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SliderCaptcha } from '@/components/SliderCaptcha';

/** 当前页面形态：login=密码登录 / register=注册（设密码） */
type Mode = 'login' | 'register';

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const { login: setAuth } = useApp();
  const next = (loc.state as { next?: string } | null)?.next ?? '/history';

  const [mode, setMode] = useState<Mode>('login');

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const [loading, setLoading] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // 严格校验中国大陆手机号号段，避免 11111111111 这类假号走到后端
  const phoneOk = /^1(3[0-9]|4[5-9]|5[0-35-9]|6[2567]|7[0-8]|8[0-9]|9[0-35-9])\d{8}$/.test(phone.trim());
  const phoneError = phoneTouched && phone.length > 0 && !phoneOk;
  const pwdOk = password.length >= 6 && password.length <= 20;
  const pwdMatch = password === password2;

  const afterAuth = (name: string) => {
    toast.success(`欢迎，${name}`);
    nav(next, { replace: true });
  };

  /** 密码登录（账号 + 密码 + 人机验证） */
  const doPasswordLogin = async () => {
    if (!phoneOk) return toast.error('请输入正确的手机号');
    if (!password) return toast.error('请输入密码');
    if (!captchaOk) return toast.error('请先拖动滑块完成人机验证');
    setLoading(true);
    try {
      const res = await login('phone', phone.trim(), undefined, undefined, 'password', password);
      setAuth({ token: res.token, user: res.user });
      afterAuth(res.user.name);
    } catch (err) {
      // 登录失败 → 要求重新人机验证
      setCaptchaReset((k) => k + 1);
      setCaptchaOk(false);
      toast.error(err instanceof Error ? err.message : '登录失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  /** 注册（手机号 + 设密码 + 人机验证） */
  const doRegister = async () => {
    if (!phoneOk) return toast.error('请输入正确的手机号');
    if (!pwdOk) return toast.error('密码需要 6-20 位');
    if (!pwdMatch) return toast.error('两次输入的密码不一致');
    if (!captchaOk) return toast.error('请先拖动滑块完成人机验证');
    setLoading(true);
    try {
      const res = await registerWithPassword(phone.trim(), password);
      setAuth({ token: res.token, user: res.user });
      toast.success(res.upgraded ? '密码已设置，欢迎回来' : '注册成功');
      nav(next, { replace: true });
    } catch (err) {
      setCaptchaReset((k) => k + 1);
      setCaptchaOk(false);
      const msg = err instanceof Error ? err.message : '注册失败';
      toast.error(msg);
      // 已注册 → 自动切到密码登录并保留手机号
      if (msg.includes('已注册')) {
        setMode('login');
        setPassword('');
        setPassword2('');
      }
    } finally {
      setLoading(false);
    }
  };

  /** 手机号填完失焦时探一下：未设密码就提示可去注册 */
  const probePhone = async () => {
    if (!phoneOk || mode !== 'login') return;
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
  const canSubmit = phoneOk && captchaOk && !loading && (isRegister ? pwdOk && pwdMatch : !!password);

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

        {/* 手机号 */}
        <label className="mb-1.5 block text-sm font-semibold">手机号</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            setPhoneTouched(true);
            probePhone();
          }}
          placeholder="11 位手机号"
          inputMode="numeric"
          maxLength={11}
          className={`rounded-2xl bg-white/[0.04] ${phoneError ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
        />
        {phoneError && (
          <p className="mt-1.5 text-sm text-red-400">请输入正确的手机号</p>
        )}

        {/* 密码 */}
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

        {/* 忘记密码入口（仅密码登录模式展示） */}
        {!isRegister && (
          <div className="mt-1.5 text-right">
            <button
              type="button"
              onClick={() => nav('/forgot-password')}
              className="text-sm font-semibold text-primary hover:underline"
            >
              忘记密码？
            </button>
          </div>
        )}

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

        {/* 人机验证（滑块） */}
        <div className="mt-4">
          <SliderCaptcha onVerify={setCaptchaOk} resetKey={captchaReset} />
        </div>

        {/* 主按钮 */}
        <Button
          className="mt-6 h-12 w-full rounded-2xl text-base"
          onClick={isRegister ? doRegister : doPasswordLogin}
          disabled={!canSubmit}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isRegister ? (
            <UserPlus className="size-4" />
          ) : (
            <Lock className="size-4" />
          )}
          {isRegister ? '注册并登录' : '登录'}
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
              还没有账号？注册一个（免费）
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
