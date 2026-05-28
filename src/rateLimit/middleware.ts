/**
 * Rate Limiting Middleware
 * Token bucket algorithm using Redis Lua script
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { redis } from '../db/redis.js';
import { config } from '../config.js';

// Load Lua script
const luaScript = fs.readFileSync(
  path.join(process.cwd(), 'src/rateLimit/tokenBucket.lua'),
  'utf8'
);

/**
 * Check rate limit for a device
 * @param deviceId Device UUID
 * @returns true if allowed, false if rate limited
 */
export async function checkDeviceRateLimit(deviceId: string): Promise<boolean> {
  const key = `bucket:device:${deviceId}`;
  const capacity = config.rateLimit.deviceBurstCapacity;
  const refillRate = config.rateLimit.deviceCommandsPerMinute / 60; // per second
  const now = Date.now();

  try {
    const result = await redis.eval(
      luaScript,
      1, // number of keys
      key,
      capacity.toString(),
      refillRate.toString(),
      now.toString()
    );

    return result === 1;
  } catch (err: any) {
    console.error('❌ Rate limit check failed:', err);
    // Fail open (allow request if Redis fails)
    return true;
  }
}

/**
 * Check rate limit for an API key
 * @param userId User ID from API key
 * @returns true if allowed, false if rate limited
 */
export async function checkApiKeyRateLimit(userId: string): Promise<boolean> {
  const key = `bucket:api_key:${userId}`;
  const capacity = config.rateLimit.apiKeyCommandsPerMinute * 2; // Burst capacity
  const refillRate = config.rateLimit.apiKeyCommandsPerMinute / 60; // per second
  const now = Date.now();

  try {
    const result = await redis.eval(
      luaScript,
      1,
      key,
      capacity.toString(),
      refillRate.toString(),
      now.toString()
    );

    return result === 1;
  } catch (err: any) {
    console.error('❌ Rate limit check failed:', err);
    return true;
  }
}

/**
 * Get rate limit status (for debugging)
 */
export async function getRateLimitStatus(key: string): Promise<{
  tokens: number;
  lastRefill: number;
} | null> {
  try {
    const bucket = await redis.hmget(key, 'tokens', 'last_refill');
    if (!bucket[0]) return null;

    return {
      tokens: parseFloat(bucket[0]),
      lastRefill: parseInt(bucket[1] || '0', 10),
    };
  } catch (err: any) {
    console.error('❌ Failed to get rate limit status:', err);
    return null;
  }
}

/**
 * Reset rate limit for a key (admin function)
 */
export async function resetRateLimit(key: string): Promise<void> {
  await redis.del(key);
  console.log(`🔓 Rate limit reset: ${key}`);
}
