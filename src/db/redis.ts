/**
 * Redis Client & Streams Helpers
 * Command queue, rate limiting, session state
 */

import Redis from 'ioredis';
import { config } from '../config.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryStrategy: (times) => {
    const delay = Math.min(times * config.redis.retryDelayMs, config.redis.maxRetryDelay);
    return delay;
  },
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('🔌 Redis ready');
});

/**
 * Connect and test Redis
 */
export async function connectRedis(): Promise<void> {
  await redis.connect();
  const pong = await redis.ping();
  console.log(`   PING: ${pong}`);
}

/**
 * Add command to device queue (Redis Stream)
 * @returns Stream message ID
 */
export async function addCommand(
  deviceId: string,
  requestId: string,
  command: string,
  payload: any
): Promise<string> {
  const streamKey = `cmd:${deviceId}`;
  const id = await redis.xadd(
    streamKey,
    'MAXLEN', '~', '50', // Keep last ~50 commands per device
    '*', // Auto-generate ID
    'request_id', requestId,
    'command', command,
    'payload', JSON.stringify(payload),
    'issued_by', 'node_red',
    'ts', Date.now().toString(),
  );
  if (!id) throw new Error('Redis XADD returned null');
  return id;
}

/**
 * Acknowledge and delete command from queue
 */
export async function ackCommand(deviceId: string, messageId: string): Promise<void> {
  const streamKey = `cmd:${deviceId}`;
  // Try to create consumer group (idempotent)
  try {
    await redis.xgroup('CREATE', streamKey, 'relay', '$', 'MKSTREAM');
  } catch (err: any) {
    // BUSYGROUP - group already exists, ignore
    if (!err.message?.includes('BUSYGROUP')) {
      throw err;
    }
  }

  // Acknowledge
  await redis.xack(streamKey, 'relay', messageId);
  // Delete from stream
  await redis.xdel(streamKey, messageId);
}

/**
 * Get pending commands for a device
 */
export async function getPendingCommands(deviceId: string): Promise<any[]> {
  const streamKey = `cmd:${deviceId}`;

  // Try to create consumer group
  try {
    await redis.xgroup('CREATE', streamKey, 'relay', '0', 'MKSTREAM');
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) {
      throw err;
    }
  }

  // Read from beginning
  const result = await redis.xreadgroup(
    'GROUP', 'relay', `consumer-${deviceId}`,
    'COUNT', '10',
    'STREAMS', streamKey, '0'
  );

  if (!result || result.length === 0) {
    return [];
  }

  const [_streamKey, messages] = result[0] as [string, [string, string[]][]];
  return messages.map(([id, fields]) => {
    const obj: any = { message_id: id };
    for (let i = 0; i < fields.length; i += 2) {
      const key = fields[i];
      const value = fields[i + 1];
      obj[key] = key === 'payload' ? JSON.parse(value) : value;
    }
    return obj;
  });
}

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  console.log('📴 Redis connection closed');
}
