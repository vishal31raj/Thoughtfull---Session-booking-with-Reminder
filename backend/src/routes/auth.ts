import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/http';
import { clearSessionCookie, CSRF_COOKIE, setSessionCookie } from '../lib/cookies';
import { verifyToken } from '../lib/tokens';
import { SESSION_COOKIE } from '../lib/cookies';
import { AppError } from '../lib/errors';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { loginSchema, profileSchema, registerSchema } from './schemas';
import { loginUser, logoutUser, registerUser, updateProfile } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { publicUserSelect, toPublicUser } from '../services/user-view';

export const authRouter = Router();

const authRateLimit = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' } },
});

authRouter.get('/csrf', (req, res) => {
  sendData(res, { csrfToken: req.cookies?.[CSRF_COOKIE] ?? null });
});

authRouter.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    setSessionCookie(res, result.token);
    sendData(res, { user: result.user }, 201);
  }),
);

authRouter.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body.email, req.body.password);
    setSessionCookie(res, result.token);
    sendData(res, { user: result.user });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') {
      try {
        const payload = verifyToken(token);
        await logoutUser(payload.sub);
      } catch {
        // The cookie is cleared even when the token is already invalid.
      }
    }
    clearSessionCookie(res);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.authUser!.id }, select: publicUserSelect });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    sendData(res, toPublicUser(user));
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const user = await updateProfile(req.authUser!.id, req.body);
    sendData(res, user);
  }),
);
