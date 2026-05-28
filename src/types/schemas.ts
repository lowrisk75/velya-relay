/**
 * Zod Schemas for Request/Response Validation
 */

import { z } from 'zod';

/**
 * Alarm command payload
 */
export const AlarmCommandSchema = z.object({
  alarm_id: z.string().uuid(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  enabled: z.boolean().optional(),
  label: z.string().max(100).optional(),
  repeat_days: z.array(z.number().int().min(0).max(6)).optional(), // 0=Sunday, 6=Saturday
});

/**
 * WebSocket message from iPhone
 */
export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  // ACK message
  z.object({
    type: z.literal('ack'),
    request_id: z.string().uuid(),
    message_id: z.string(), // Redis Stream ID
    status: z.enum(['ok', 'error']),
    error_code: z.string().optional(),
  }),

  // Fetch pending commands (on reconnect)
  z.object({
    type: z.literal('fetch_pending'),
    device_id: z.string().uuid(),
  }),

  // Heartbeat pong (implicit via WebSocket protocol, but can be explicit)
  z.object({
    type: z.literal('pong'),
    timestamp: z.number(),
  }),

  // Phase 2B: Alarm event callbacks
  z.object({
    type: z.literal('alarm_fired'),
    alarm_id: z.string().uuid(),
    timestamp: z.string().datetime(), // ISO 8601
  }),

  z.object({
    type: z.literal('alarm_snoozed'),
    alarm_id: z.string().uuid(),
    snooze_until: z.string().datetime(), // ISO 8601
    timestamp: z.string().datetime(),
  }),

  z.object({
    type: z.literal('alarm_dismissed'),
    alarm_id: z.string().uuid(),
    timestamp: z.string().datetime(),
  }),
]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

/**
 * REST API command request (from Node-RED)
 */
export const CommandRequestSchema = z.object({
  device_id: z.string().uuid(),
  request_id: z.string().uuid(),
  command: z.enum(['alarm.set', 'alarm.delete', 'alarm.cancel', 'alarm.toggle', 'alarm.list']),
  payload: z.record(z.any()), // Generic payload, validated per command type
});

export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/**
 * App Attest challenge response
 */
export const ChallengeResponseSchema = z.object({
  challenge: z.string().min(16).max(128),
});

/**
 * App Attest attestation request
 */
export const AttestationRequestSchema = z.object({
  keyId: z.string().min(1),
  attestation: z.string().min(100), // Base64 encoded
  challenge: z.string().min(16).max(128),
});

/**
 * Token response
 */
export const TokenResponseSchema = z.object({
  accessToken: z.string().min(100),
  refreshToken: z.string().min(100),
  deviceId: z.string().uuid(),
});

/**
 * Error response
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  error_code: z.string().optional(),
  request_id: z.string().uuid().optional(),
});
