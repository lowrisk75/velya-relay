/**
 * User Registration & Authentication
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../db/pg.js';
import { signJWT } from './jwt.js';

export interface User {
  user_id: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  invitation_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_info?: string;
  ip_address?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Register a new user
 */
export async function registerUser(
  req: RegisterRequest
): Promise<{ user: User; verification_token: string }> {
  const { email, password, invitation_token } = req;

  // Validate email format
  if (!isValidEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Check if invitation required (optional - can be disabled)
  if (process.env.REQUIRE_INVITATION === 'true' && !invitation_token) {
    throw new Error('Invitation required');
  }

  // Verify invitation if provided
  if (invitation_token) {
    const invitation = await getInvitation(invitation_token);
    if (!invitation || invitation.used_at || invitation.expires_at < new Date()) {
      throw new Error('Invalid or expired invitation');
    }
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      throw new Error('Email does not match invitation');
    }
  }

  // Check if email already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Create user
  const query = `
    INSERT INTO users (email, password_hash, email_verified)
    VALUES ($1, $2, false)
    RETURNING user_id, email, email_verified, created_at, last_login_at
  `;

  const result = await pool.query(query, [email.toLowerCase(), password_hash]);
  const user: User = result.rows[0];

  // Mark invitation as used
  if (invitation_token) {
    await markInvitationUsed(invitation_token, user.user_id);
  }

  // Generate email verification token
  const verification_token = crypto.randomBytes(32).toString('hex');
  await createEmailVerificationToken(user.user_id, verification_token);

  return { user, verification_token };
}

/**
 * Login user
 */
export async function loginUser(
  req: LoginRequest
): Promise<{ user: User; tokens: AuthTokens }> {
  const { email, password, device_info, ip_address } = req;

  // Get user
  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Update last login
  await pool.query(
    'UPDATE users SET last_login_at = NOW() WHERE user_id = $1',
    [user.user_id]
  );

  // Generate tokens
  const tokens = await generateAuthTokens(user.user_id, device_info, ip_address);

  return {
    user: {
      user_id: user.user_id,
      email: user.email,
      email_verified: user.email_verified,
      created_at: user.created_at,
      last_login_at: new Date(),
    },
    tokens,
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  refresh_token: string
): Promise<AuthTokens> {
  const query = `
    SELECT user_id, expires_at FROM sessions
    WHERE refresh_token = $1
  `;

  const result = await pool.query(query, [refresh_token]);

  if (result.rows.length === 0) {
    throw new Error('Invalid refresh token');
  }

  const { user_id, expires_at } = result.rows[0];

  if (new Date(expires_at) < new Date()) {
    throw new Error('Refresh token expired');
  }

  // Update last used
  await pool.query(
    'UPDATE sessions SET last_used_at = NOW() WHERE refresh_token = $1',
    [refresh_token]
  );

  // Generate new access token (keep same refresh token)
  const access_token = signJWT(
    {
      sub: user_id,
      aud: 'velya-web',
    },
    '15m'
  );

  return {
    access_token,
    refresh_token,
    expires_in: 900, // 15 minutes
  };
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<User> {
  const query = `
    SELECT user_id, expires_at, used_at
    FROM email_verification_tokens
    WHERE token = $1
  `;

  const result = await pool.query(query, [token]);

  if (result.rows.length === 0) {
    throw new Error('Invalid verification token');
  }

  const { user_id, expires_at, used_at } = result.rows[0];

  if (used_at) {
    throw new Error('Token already used');
  }

  if (new Date(expires_at) < new Date()) {
    throw new Error('Token expired');
  }

  // Mark email as verified
  await pool.query(
    'UPDATE users SET email_verified = true WHERE user_id = $1',
    [user_id]
  );

  // Mark token as used
  await pool.query(
    'UPDATE email_verification_tokens SET used_at = NOW() WHERE token = $1',
    [token]
  );

  const user = await getUserById(user_id);
  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const user = await getUserByEmail(email);
  if (!user) {
    // Don't reveal if email exists
    return 'If email exists, reset link has been sent';
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + 3600000); // 1 hour

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.user_id, token, expires_at]
  );

  return token;
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  new_password: string
): Promise<void> {
  if (new_password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const query = `
    SELECT user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token = $1
  `;

  const result = await pool.query(query, [token]);

  if (result.rows.length === 0) {
    throw new Error('Invalid reset token');
  }

  const { user_id, expires_at, used_at } = result.rows[0];

  if (used_at) {
    throw new Error('Token already used');
  }

  if (new Date(expires_at) < new Date()) {
    throw new Error('Token expired');
  }

  // Hash new password
  const password_hash = await bcrypt.hash(new_password, 10);

  // Update password
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE user_id = $2',
    [password_hash, user_id]
  );

  // Mark token as used
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1',
    [token]
  );

  // Invalidate all sessions
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [user_id]);
}

/**
 * Logout (invalidate session)
 */
export async function logout(refresh_token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE refresh_token = $1', [
    refresh_token,
  ]);
}

// Helper functions

async function generateAuthTokens(
  user_id: string,
  device_info?: string,
  ip_address?: string
): Promise<AuthTokens> {
  // Generate access token (short-lived)
  const access_token = signJWT(
    {
      sub: user_id,
      aud: 'velya-web',
    },
    '15m'
  );

  // Generate refresh token (long-lived)
  const refresh_token = crypto.randomBytes(64).toString('hex');
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Store session
  await pool.query(
    `INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user_id, refresh_token, device_info, ip_address, expires_at]
  );

  return {
    access_token,
    refresh_token,
    expires_in: 900, // 15 minutes
  };
}

async function getUserByEmail(email: string): Promise<any | null> {
  const query = 'SELECT * FROM users WHERE email = $1';
  const result = await pool.query(query, [email.toLowerCase()]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getUserById(user_id: string): Promise<User | null> {
  const query = 'SELECT user_id, email, email_verified, created_at, last_login_at FROM users WHERE user_id = $1';
  const result = await pool.query(query, [user_id]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function createEmailVerificationToken(
  user_id: string,
  token: string
): Promise<void> {
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user_id, token, expires_at]
  );
}

async function getInvitation(token: string): Promise<any | null> {
  const query = 'SELECT * FROM invitations WHERE token = $1';
  const result = await pool.query(query, [token]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function markInvitationUsed(
  token: string,
  user_id: string
): Promise<void> {
  await pool.query(
    'UPDATE invitations SET used_at = NOW(), used_by = $1 WHERE token = $2',
    [user_id, token]
  );
}

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
