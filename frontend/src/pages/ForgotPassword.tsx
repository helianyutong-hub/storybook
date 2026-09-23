import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { forgotPassword } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SliderCaptcha } from '@/components/SliderCaptcha';

/** 忘记密码：手机号 + 新密码 + 滑块人机验证，直接重置 */
export default function ForgotPassword() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // 与登录页一致的严格手机号校验
  const phoneOk = /^1(3[0-9]|4[5-9]|5[0-35-9]|6[2567]|7[0-8]|8[0-9]|9[0-35-9])\d{8}$/.test(phone.trim());
  const phoneError = phoneTouched && phone.length > 0 && !phoneOk;
  const pwdOk = password.length >= 6 && password.length <= 20;
  const pwdMatch = password === password2;
  const canSubmit = phoneOk && pwdOk && pwdMatch && captchaOk && !loading;

  const doReset = async () => {
    if (!phoneOk) return toast.error('请输入正确的手机号');
    if (!pwdOk) return toast.error('新密码需要 6-20 位');
    if (!pwdMatch) return toast.error('两次输入的密码不一致');
    if (!captchaOk) return toast.error('请先拖动滑块完成人机验证');
    setLoading(true);
    try {
      await forgotPassword(phone.trim(), password);
      toast.success('密码已重置，请用新密码登录');
      nav('/login', { replace: true });
    } catch (err) {
      // 重置失败（手机号未注册等）→ 要求重新人机验证
      setCaptchaReset((k) => k + 1);
      setCaptchaOk(false);
      toast.error(err instanceof Error ? err.message : '重置失败，请稍后再试');
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
            <KeyRound className="size-7" />
          </span>
          <h1 className="text-2xl font-extrabold">重置密码</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            输入注册手机号，直接设置新密码。
          </p>
        </div>

        {/* 手机号 */}
        <label className="mb-1.5 block text-sm font-semibold">手机号</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          onBlur={() => setPhoneTouched(true)}
          placeholder="11 位手机号"
          inputMode="numeric"
          maxLength={11}
          className={`rounded-2xl bg-white/[0.04] ${phoneError ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
        />
        {phoneError && (
          <p className="mt-1.5 text-sm text-red-400">请输入正确的手机号</p>
        )}

        {/* 新密码 */}
        <label className="mb-1.5 mt-4 block text-sm font-semibold">新密码</label>
        <div className="relative">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6-20 位密码"
            type={showPwd ? 'text' : 'password'}
            maxLength={20}
            autoComplete="new-password"
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

        {/* 确认新密码 */}
        <label className="mb-1.5 mt-4 block text-sm font-semibold">确认新密码</label>
        <Input
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="再输入一次密码"
          type={showPwd ? 'text' : 'password'}
          maxLength={20}
          autoComplete="new-password"
          className="rounded-2xl bg-white/[0.04]"
        />

        {/* 人机验证（滑块） */}
        <div className="mt-4">
          <SliderCaptcha onVerify={setCaptchaOk} resetKey={captchaReset} />
        </div>

        <Button
          className="mt-6 h-12 w-full rounded-2xl text-base"
          onClick={doReset}
          disabled={!canSubmit}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          重置密码
        </Button>

        <div className="mt-4 text-center text-sm">
          <button
            onClick={() => nav('/login')}
            className="font-semibold text-primary hover:underline"
          >
            想起来了？去登录
          </button>
        </div>
      </div>
    </div>
  );
}
