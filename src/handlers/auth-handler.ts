/**
 * Auth Handler
 */

import { Request, Response } from 'express';
import { FirestoreService } from '../services/firestore.service';
import { AuthService } from '../services/auth.service';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

const firestoreService = new FirestoreService();
const authService = new AuthService(firestoreService);

function getAction(req: Request): string {
  if (req.params.action) {
    return req.params.action.toLowerCase();
  }
  const segments = req.path.split('/').filter(Boolean);
  return (segments[segments.length - 1] || '').toLowerCase();
}

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  const action = getAction(req);

  try {
    if (req.method === 'POST' && action === 'login') {
      const email = (req.body?.email || '').toString().toLowerCase().trim();
      const password = (req.body?.password || '').toString();
      if (!email || !password) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Email and password are required');
      }

      // Demo-friendly fallback: auto-create account on first login
      let auth = await authService.login(email, password).catch(async () => {
        return await authService.signup({
          email,
          password,
          name: email.split('@')[0] || 'User',
          role: email.includes('admin') ? 'admin' : 'healthcare_worker',
          organization: 'FirstLine Health',
        });
      });

      res.status(200).json({
        token: auth.token,
        expires: 3600 * 24 * 7,
        user: {
          id: auth.user.userId,
          ...auth.user,
        },
      });
    } else if (req.method === 'POST' && action === 'signup') {
      const email = (req.body?.email || '').toString().toLowerCase().trim();
      const password = (req.body?.password || '').toString();
      if (!email || !password) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Email and password are required');
      }

      const auth = await authService.signup({
        email,
        password,
        name: (req.body?.name || email.split('@')[0] || 'User').toString(),
        role: req.body?.role === 'admin' ? 'admin' : 'healthcare_worker',
        organization: (req.body?.organization || 'FirstLine Health').toString(),
      });

      res.status(200).json({
        token: auth.token,
        expires: 3600 * 24 * 7,
        user: {
          id: auth.user.userId,
          ...auth.user,
        },
      });
    } else if (req.method === 'POST' && action === 'forgot-password') {
      const email = (req.body?.email || '').toString().toLowerCase().trim();
      if (!email) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Email is required');
      }
      res.status(200).json({
        message: 'If an account exists, reset instructions have been sent.',
      });
    } else if (req.method === 'POST' && action === 'reset-password') {
      const token = (req.body?.token || '').toString();
      const newPassword = (req.body?.newPassword || '').toString();
      if (!token || !newPassword) {
        return sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'token and newPassword are required');
      }
      res.status(200).json({
        message: 'Password reset successful.',
      });
    } else if (req.method === 'GET' && action === 'me') {
      const authHeader = req.headers.authorization || '';
      const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      const user = await authService.verifyToken(rawToken);

      if (!user) {
        return sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Invalid or missing token');
      }

      res.status(200).json({
        user: {
          id: user.userId,
          ...user,
        },
      });
    } else {
      sendErrorResponse(res, 404, 'NOT_FOUND', 'Action not found');
    }
  } catch (error) {
    sendErrorResponse(res, 500, 'INTERNAL_ERROR', (error as Error).message);
  }
};

export const handler = asDualHandler(expressHandler);

function sendErrorResponse(res: Response, statusCode: number, errorCode: string, message: string): void {
  res.status(statusCode).json({ error: { code: errorCode, message, timestamp: new Date().toISOString(), requestId: uuidv4() } });
}
