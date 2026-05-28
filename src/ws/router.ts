/**
 * WebSocket Message Router
 * Routes incoming messages to appropriate handlers
 */

import type { WebSocket } from 'uwebsockets.js';
import { WebSocketMessageSchema, type WebSocketMessage } from '../types/schemas.js';
import { handleAck } from './ack.js';
import { getPendingCommands } from '../db/redis.js';
import { handleAlarmEvent } from './alarmEventHandler.js';

interface WebSocketUserData {
  userId: string;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

/**
 * Route incoming message to handler
 */
export async function routeMessage(
  ws: WebSocket<WebSocketUserData>,
  data: any
): Promise<void> {
  const { deviceId } = ws.getUserData();

  // Validate message schema
  const parseResult = WebSocketMessageSchema.safeParse(data);
  if (!parseResult.success) {
    console.error(`❌ Invalid message from ${deviceId}:`, parseResult.error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Invalid message schema',
      details: parseResult.error.issues,
    }), false);
    return;
  }

  const message: WebSocketMessage = parseResult.data;

  try {
    switch (message.type) {
      case 'ack':
        await handleAck(ws, message);
        break;

      case 'fetch_pending':
        await handleFetchPending(ws, message.device_id);
        break;

      case 'pong':
        // Heartbeat pong received (already handled by uWS, but log if explicit)
        console.log(`🏓 Explicit pong from ${deviceId}`);
        break;

      case 'alarm_fired':
      case 'alarm_snoozed':
      case 'alarm_dismissed':
        await handleAlarmEvent(ws, message);
        break;

      default:
        // TypeScript exhaustiveness check
        console.warn(`⚠️  Unknown message type from ${deviceId}`);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type',
        }), false);
    }
  } catch (err: any) {
    console.error(`❌ Error handling message from ${deviceId}:`, err);
    ws.send(JSON.stringify({
      type: 'error',
      error: err.message || 'Internal server error',
    }), false);
  }
}

/**
 * Handle fetch_pending request
 * Sends all pending commands from Redis Stream to device
 */
async function handleFetchPending(
  ws: WebSocket<WebSocketUserData>,
  deviceId: string
): Promise<void> {
  const { deviceId: wsDeviceId } = ws.getUserData();

  // Security: device can only fetch its own pending commands
  if (deviceId !== wsDeviceId) {
    console.warn(`⚠️  Device ${wsDeviceId} tried to fetch pending for ${deviceId}`);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Unauthorized',
    }), false);
    return;
  }

  const pending = await getPendingCommands(deviceId);

  if (pending.length === 0) {
    ws.send(JSON.stringify({
      type: 'pending_empty',
      device_id: deviceId,
    }), false);
    return;
  }

  // Send each pending command
  for (const cmd of pending) {
    ws.send(JSON.stringify({
      type: 'command',
      request_id: cmd.request_id,
      message_id: cmd.message_id,
      command: cmd.command,
      payload: cmd.payload,
      issued_by: cmd.issued_by,
      ts: parseInt(cmd.ts, 10),
    }), false);
  }

  console.log(`📤 Sent ${pending.length} pending commands to ${deviceId}`);
}
