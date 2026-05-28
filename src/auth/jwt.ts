/**
 * JWT RS256 Authentication
 * Access tokens (15min) + Refresh tokens (7d) with rotation
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../config.js';

const PRIVATE_KEY = fs.readFileSync(
  path.join(process.cwd(), 'keys/jwt-private.pem'),
  'utf8'
);
const PUBLIC_KEY = fs.readFileSync(
  path.join(process.cwd(), 'keys/jwt-public.pem'),
  'utf8'
);

export interface AccessTokenPayload {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  device_id: string;
  scopes: string[];
}

export interface RefreshTokenPayload {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string; // format: "family-uuid:rotation-N"
  device_id: string;
}

function base64UrlEncode(data: Buffer): string {
  return data.toString('base64url');
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Sign JWT with RS256
 */
export function signJWT(payload: AccessTokenPayload | RefreshTokenPayload | any, expiry?: string): string {
  // If expiry is provided (e.g., "15m"), calculate exp
  if (expiry && !payload.exp) {
    const duration = parseDuration(expiry);
    payload.iat = Math.floor(Date.now() / 1000);
    payload.exp = payload.iat + duration;
    if (!payload.iss) payload.iss = config.jwt.issuer;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(PRIVATE_KEY);

  return `${signatureInput}.${base64UrlEncode(signature)}`;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('Invalid duration format');

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error('Invalid duration unit');
  }
}

/**
 * Verify JWT signature and expiration
 * @throws Error if invalid or expired
 */
export function verifyJWT(token: string): AccessTokenPayload | RefreshTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlDecode(encodedSignature);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signatureInput);
  const isValid = verifier.verify(PUBLIC_KEY, signature);

  if (!isValid) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));

  // Check expiration
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error('JWT expired');
  }

  return payload;
}

/**
 * Issue access token (15 min lifetime)
 */
export function issueAccessToken(userId: string, deviceId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    iss: config.jwt.issuer,
    sub: userId,
    aud: config.jwt.audience,
    iat: now,
    exp: now + config.jwt.accessTokenTTL,
    jti: crypto.randomUUID(),
    device_id: deviceId,
    scopes: ['alarm:read', 'alarm:write', 'device:control'],
  };
  return signJWT(payload);
}

/**
 * Issue refresh token (7 day lifetime)
 * @param familyId Rotation family UUID (same across rotations)
 * @param rotationN Rotation counter (0, 1, 2, ...)
 */
export function issueRefreshToken(
  userId: string,
  deviceId: string,
  familyId: string,
  rotationN: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: RefreshTokenPayload = {
    iss: config.jwt.issuer,
    sub: userId,
    iat: now,
    exp: now + config.jwt.refreshTokenTTL,
    jti: `${familyId}:${rotationN}`,
    device_id: deviceId,
  };
  return signJWT(payload);
}

/**
 * Parse refresh token JTI into family and rotation
 */
export function parseRefreshTokenJTI(jti: string): { family: string; rotation: number } {
  const [family, rotationStr] = jti.split(':');
  return { family, rotation: parseInt(rotationStr, 10) };
}
