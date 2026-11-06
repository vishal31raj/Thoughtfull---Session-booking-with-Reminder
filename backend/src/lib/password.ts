import bcrypt from 'bcryptjs';
import { config } from '../config';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
