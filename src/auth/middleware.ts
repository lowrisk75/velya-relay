/**
 * Authentication Middleware
 * Extract and validate API keys from Authorization header
 */

import type { HttpRequest } from 'uwebsockets.js';
import { validateApiKey } from './apiKey.js';

/**
 * Extract API key from Authorization header
 * Format: "Bearer <key>"
 */
export function extractApiKey(req: HttpRequest): string | null {
  const authHeader = req.getHeader('authorization');
  if (!authHeader) {
    return null;
  }

  // Format: "Bearer velya_nr_..."
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.substring(7);
}

/**
 * Validate API key and return userId
 * @throws Error if invalid
 */
export async function requireApiKey(req: HttpRequest): Promise<string> {
  const key = extractApiKey(req);

  if (!key) {
    throw new Error('Missing API key');
  }

  const userId = await validateApiKey(key);

  if (!userId) {
    throw new Error('Invalid API key');
  }

  return userId;
}
