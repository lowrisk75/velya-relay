/**
 * Velya Cloud Relay Configuration
 * Environment variables with sensible defaults
 */

import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '8080'),

  postgres: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'velya_relay',
    user: process.env.PG_USER || 'velya_app',
    password: process.env.PG_PASSWORD || '',
    max: parseInt(process.env.PG_POOL_MAX || '20'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
    retryDelayMs: 50,
    maxRetryDelay: 2000,
  },

  jwt: {
    issuer: 'velya-relay',
    audience: 'velya-ios',
    accessTokenTTL: 15 * 60, // 15 minutes
    refreshTokenTTL: 7 * 24 * 60 * 60, // 7 days
  },

  rateLimit: {
    deviceCommandsPerMinute: 10,
    deviceBurstCapacity: 20,
    apiKeyCommandsPerMinute: 20,
    apiKeyCommandsPerHour: 200,
  },

  websocket: {
    heartbeatIntervalMs: 45000, // 45 seconds
    idleTimeoutMs: 135000, // 3× heartbeat
    maxPayloadLength: 64 * 1024, // 64 KB
    maxBackpressure: 1 * 1024 * 1024, // 1 MB
  },

  apns: {
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || '',
    keyPath: process.env.APNS_KEY_PATH || '',
    bundleId: process.env.APNS_BUNDLE_ID || '',
    production: process.env.APNS_PRODUCTION === 'true',
  },
} as const;
