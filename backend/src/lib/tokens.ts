import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import type { Role } from '@prisma/client';

export interface TokenPayload {
  sub: string;
  role: Role;
  sv: number;
}

export function signToken(payload: TokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token');
  }
  const sub = decoded.sub;
  const role = decoded.role;
  const sv = decoded.sv;
  if (typeof sub !== 'string' || (role !== 'MEMBER' && role !== 'PROFESSIONAL') || typeof sv !== 'number') {
    throw new Error('Invalid token');
  }
  return { sub, role, sv };
}
