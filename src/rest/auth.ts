/**
 * REST API: Authentication Endpoints
 * POST /v1/auth/register - Register new user
 * POST /v1/auth/login - Login
 * POST /v1/auth/refresh - Refresh access token
 * POST /v1/auth/verify-email - Verify email
 * POST /v1/auth/forgot-password - Request password reset
 * POST /v1/auth/reset-password - Reset password
 * POST /v1/auth/logout - Logout
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  logout,
} from '../auth/registration.js';

export function setupAuthRoutes(app: TemplatedApp): void {
  /**
   * POST /v1/auth/register
   * Register a new user
   */
  app.post('/v1/auth/register', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleRegister(res, Buffer.from(buffer));
      }
    });
  });

  /**
   * POST /v1/auth/login
   * Login user
   */
  app.post('/v1/auth/login', (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    const ip_address = req.getHeader('x-forwarded-for') || req.getHeader('x-real-ip') || '';
    const user_agent = req.getHeader('user-agent') || '';

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleLogin(res, Buffer.from(buffer), ip_address, user_agent);
      }
    });
  });

  /**
   * POST /v1/auth/refresh
   * Refresh access token
   */
  app.post('/v1/auth/refresh', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleRefresh(res, Buffer.from(buffer));
      }
    });
  });

  /**
   * POST /v1/auth/verify-email
   * Verify email with token
   */
  app.post('/v1/auth/verify-email', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleVerifyEmail(res, Buffer.from(buffer));
      }
    });
  });

  /**
   * POST /v1/auth/forgot-password
   * Request password reset
   */
  app.post('/v1/auth/forgot-password', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleForgotPassword(res, Buffer.from(buffer));
      }
    });
  });

  /**
   * POST /v1/auth/reset-password
   * Reset password with token
   */
  app.post('/v1/auth/reset-password', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleResetPassword(res, Buffer.from(buffer));
      }
    });
  });

  /**
   * POST /v1/auth/logout
   * Logout (invalidate refresh token)
   */
  app.post('/v1/auth/logout', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        handleLogout(res, Buffer.from(buffer));
      }
    });
  });
}

// Handlers

async function handleRegister(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const { user, verification_token } = await registerUser({
      email: body.email,
      password: body.password,
      invitation_token: body.invitation_token,
    });

    console.log(`👤 User registered: ${user.email}`);

    res.writeStatus('201 Created');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      user: {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
      },
      verification_token, // Send via email in production
    }));
  } catch (err: any) {
    console.error('❌ Registration error:', err.message);
    res.writeStatus('400 Bad Request');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleLogin(
  res: HttpResponse,
  bodyBuffer: Buffer,
  ip_address: string,
  user_agent: string
): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const { user, tokens } = await loginUser({
      email: body.email,
      password: body.password,
      device_info: user_agent,
      ip_address,
    });

    console.log(`✅ User logged in: ${user.email}`);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      user: {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
      },
      tokens,
    }));
  } catch (err: any) {
    console.error('❌ Login error:', err.message);
    res.writeStatus('401 Unauthorized');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleRefresh(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const tokens = await refreshAccessToken(body.refresh_token);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ tokens }));
  } catch (err: any) {
    console.error('❌ Refresh error:', err.message);
    res.writeStatus('401 Unauthorized');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleVerifyEmail(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const user = await verifyEmail(body.token);

    console.log(`✅ Email verified: ${user.email}`);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      user: {
        user_id: user.user_id,
        email: user.email,
        email_verified: user.email_verified,
      },
    }));
  } catch (err: any) {
    console.error('❌ Verification error:', err.message);
    res.writeStatus('400 Bad Request');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleForgotPassword(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    const token = await requestPasswordReset(body.email);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      message: 'If email exists, reset link has been sent',
      reset_token: token, // Send via email in production
    }));
  } catch (err: any) {
    console.error('❌ Password reset request error:', err.message);
    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

async function handleResetPassword(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    await resetPassword(body.token, body.new_password);

    console.log(`🔐 Password reset successful`);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Password reset successful' }));
  } catch (err: any) {
    console.error('❌ Password reset error:', err.message);
    res.writeStatus('400 Bad Request');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handleLogout(res: HttpResponse, bodyBuffer: Buffer): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    await logout(body.refresh_token);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Logged out successfully' }));
  } catch (err: any) {
    console.error('❌ Logout error:', err.message);
    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
