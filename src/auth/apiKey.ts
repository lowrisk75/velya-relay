/**
 * API Key Authentication
 * For Node-RED to authenticate REST API calls
 */

import bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { pool } from '../db/pg.js';

/**
 * Validate API key from Authorization header
 * @returns userId if valid, null if invalid
 */
export async function validateApiKey(key: string): Promise<string | null> {
  try {
    // Query all non-revoked API keys
    const result = await pool.query(
      `SELECT user_id, key_hash FROM node_red_keys
       WHERE revoked_at IS NULL`
    );

    // Check each key hash (bcrypt compare)
    for (const row of result.rows) {
      const isValid = await bcrypt.compare(key, row.key_hash);
      if (isValid) {
        return row.user_id;
      }
    }

    return null;
  } catch (err: any) {
    console.error('❌ Error validating API key:', err);
    return null;
  }
}

/**
 * Generate new API key for a user
 * @returns Plain text API key (store securely, only shown once)
 */
export async function generateApiKey(userId: string): Promise<string> {
  // Generate secure random key
  // Format: velya_nr_<base62-encoded-32-bytes>
  const randomBytes = crypto.randomBytes(32);
  const base62 = randomBytes.toString('base64url').replace(/[^a-zA-Z0-9]/g, '').substring(0, 43);
  const key = `velya_nr_${base62}`;

  // Hash with bcrypt (cost factor 12)
  const hash = await bcrypt.hash(key, 12);

  // Store in database
  await pool.query(
    `INSERT INTO node_red_keys (user_id, key_hash) VALUES ($1, $2)`,
    [userId, hash]
  );

  console.log(`✅ API key generated for user ${userId}`);
  return key;
}

/**
 * Revoke API key
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  await pool.query(
    `UPDATE node_red_keys SET revoked_at = NOW() WHERE key_id = $1`,
    [keyId]
  );
  console.log(`🔒 API key revoked: ${keyId}`);
}

/**
 * List all API keys for a user
 */
export async function listApiKeys(userId: string): Promise<
  Array<{
    key_id: string;
    created_at: Date;
    revoked_at: Date | null;
    scopes: string[];
  }>
> {
  const result = await pool.query(
    `SELECT key_id, created_at, revoked_at, scopes
     FROM node_red_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}
