import { Request } from 'express';
import { getUserByToken } from '../lib/store';

export function getUserFromRequest(req: Request) {
  // 优先使用自定义头部，避免线上网关覆盖标准 Authorization 头
  const custom = req.headers['x-storybook-token'];
  if (typeof custom === 'string' && custom) {
    return getUserByToken(custom);
  }
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  return getUserByToken(token);
}
