// 阿里云短信服务（dysmsapi）：发送登录验证码
// - 未配置密钥时 smsEnabled()=false，登录自动回退为演示模式（不校验验证码）
// - 需要的环境变量（全部配置才算启用）：
//     ALIYUN_SMS_ACCESS_KEY_ID / ALIYUN_SMS_ACCESS_KEY_SECRET
//     ALIYUN_SMS_SIGN_NAME（短信签名，如：安睡小故事）
//     ALIYUN_SMS_TEMPLATE_CODE（验证码模板 code，模板需含 ${code} 变量）
import crypto from 'crypto';

const SMS_ENDPOINT = 'https://dysmsapi.aliyuncs.com';

/** 验证码有效期 5 分钟 */
const CODE_TTL_MS = 5 * 60 * 1000;
/** 同一手机号两次发送的最小间隔 */
const SEND_INTERVAL_MS = 60 * 1000;
/** 同一手机号每日发送上限 */
const DAILY_LIMIT = 10;
/** 验证码连续输错次数上限，超过作废 */
const MAX_VERIFY_ATTEMPTS = 5;

interface SmsCodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
  sentDate: string; // YYYY-MM-DD，用于每日限额
  sentCount: number;
  wrongAttempts: number;
}

/** 内存验证码存储（重启即清空，验证码场景可接受） */
const codeStore = new Map<string, SmsCodeEntry>();

export function smsEnabled(): boolean {
  return !!(
    process.env.ALIYUN_SMS_ACCESS_KEY_ID?.trim() &&
    process.env.ALIYUN_SMS_ACCESS_KEY_SECRET?.trim() &&
    process.env.ALIYUN_SMS_SIGN_NAME?.trim() &&
    process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim()
  );
}

/** RFC3986 百分号编码（阿里云 RPC 签名要求） */
function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/** 阿里云经典 RPC 签名请求（GET + HMAC-SHA1） */
async function rpcCall(action: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const AK = process.env.ALIYUN_SMS_ACCESS_KEY_ID!.trim();
  const SK = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET!.trim();

  const all: Record<string, string> = {
    AccessKeyId: AK,
    Action: action,
    Format: 'JSON',
    RegionId: 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
    ...params,
  };

  const qs = Object.keys(all)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`)
    .join('&');
  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(qs)}`;
  const signature = crypto.createHmac('sha1', `${SK}&`).update(stringToSign).digest('base64');

  const res = await fetch(`${SMS_ENDPOINT}?Signature=${percentEncode(signature)}&${qs}`, {
    method: 'GET',
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.json()) as Record<string, unknown>;
}

export type SendResult = { ok: true } | { ok: false; message: string };

/** 给手机号发送验证码（带防刷限制）。返回 ok=false 时 message 可直接展示给用户 */
export async function sendSmsCode(phone: string): Promise<SendResult> {
  if (!smsEnabled()) return { ok: false, message: '短信服务未配置' };

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const entry = codeStore.get(phone);

  if (entry) {
    if (now - entry.lastSentAt < SEND_INTERVAL_MS) {
      const wait = Math.ceil((SEND_INTERVAL_MS - (now - entry.lastSentAt)) / 1000);
      return { ok: false, message: `发送太频繁，请 ${wait} 秒后再试` };
    }
    if (entry.sentDate === today && entry.sentCount >= DAILY_LIMIT) {
      return { ok: false, message: '今日验证码发送次数已达上限，请明天再试' };
    }
  }

  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  let resp: Record<string, unknown>;
  try {
    resp = await rpcCall('SendSms', {
      PhoneNumbers: phone,
      SignName: process.env.ALIYUN_SMS_SIGN_NAME!.trim(),
      TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE!.trim(),
      TemplateParam: JSON.stringify({ code }),
    });
  } catch (err) {
    console.error('[SMS] 发送异常:', err instanceof Error ? err.message : err);
    return { ok: false, message: '短信发送失败，请稍后再试' };
  }

  if (resp.Code !== 'OK') {
    console.warn('[SMS] 发送失败:', JSON.stringify(resp).slice(0, 300));
    // isv.BUSINESS_LIMIT_CONTROL 等限流类错误给用户友好提示
    const bizCode = String(resp.Code ?? '');
    if (bizCode.includes('BUSINESS_LIMIT') || bizCode.includes('LIMIT')) {
      return { ok: false, message: '发送太频繁，请稍后再试' };
    }
    return { ok: false, message: '短信发送失败，请稍后再试' };
  }

  console.log(`[SMS] 验证码已发送至 ${phone.slice(0, 3)}****${phone.slice(-4)}`);
  codeStore.set(phone, {
    code,
    expiresAt: now + CODE_TTL_MS,
    lastSentAt: now,
    sentDate: today,
    sentCount: (entry && entry.sentDate === today ? entry.sentCount : 0) + 1,
    wrongAttempts: 0,
  });
  return { ok: true };
}

/** 校验验证码。成功返回 true（并立即作废该验证码） */
export function verifySmsCode(phone: string, code: string): { ok: boolean; message?: string } {
  const entry = codeStore.get(phone);
  if (!entry) return { ok: false, message: '请先获取验证码' };
  if (entry.wrongAttempts >= MAX_VERIFY_ATTEMPTS) {
    codeStore.delete(phone);
    return { ok: false, message: '错误次数过多，请重新获取验证码' };
  }
  if (Date.now() > entry.expiresAt) {
    codeStore.delete(phone);
    return { ok: false, message: '验证码已过期，请重新获取' };
  }
  if (entry.code !== code.trim()) {
    entry.wrongAttempts += 1;
    return { ok: false, message: '验证码不正确' };
  }
  codeStore.delete(phone);
  return { ok: true };
}
