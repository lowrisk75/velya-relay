/**
 * ACK Protocol
 * Tracks command delivery and acknowledgments
 */

import type { WebSocket } from 'uwebsockets.js';
import { ackCommand } from '../db/redis.js';

interface WebSocketUserData {
  userId: string;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

interface AckMessage {
  type: 'ack';
  request_id: string;
  message_id: string;
  status: 'ok' | 'error';
  error_code?: string;
}

/**
 * Pending ACK waiters
 * Map: request_id → { resolve, reject, timer }
 */
const pendingAcks = new Map<
  string,
  {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: NodeJS.Timeout;
    deviceId: string;
  }
>();

/**
 * Handle ACK message from iPhone
 */
export async function handleAck(
  ws: WebSocket<WebSocketUserData>,
  message: AckMessage
): Promise<void> {
  const { deviceId } = ws.getUserData();
  const { request_id, message_id, status, error_code } = message;

  console.log(`📩 ACK received: request_id=${request_id} status=${status} device=${deviceId}`);

  // If status is ok, delete from Redis Stream
  if (status === 'ok') {
    try {
      await ackCommand(deviceId, message_id);
      console.log(`✅ Command acknowledged and deleted: ${request_id}`);
    } catch (err: any) {
      console.error(`❌ Failed to ack command in Redis: ${request_id}`, err);
    }
  } else {
    console.warn(`⚠️  Command failed on device: ${request_id} error=${error_code}`);
  }

  // Resolve pending waiter if exists
  const pending = pendingAcks.get(request_id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingAcks.delete(request_id);

    if (status === 'ok') {
      pending.resolve({ status, request_id, message_id });
    } else {
      pending.reject(new Error(error_code || 'Command failed on device'));
    }
  }
}

/**
 * Wait for ACK from device
 * @param requestId Request ID to wait for
 * @param deviceId Device ID (for logging)
 * @param timeoutMs Timeout in milliseconds (default 10s)
 * @returns Promise that resolves on ACK or rejects on timeout
 */
export function waitForAck(
  requestId: string,
  deviceId: string,
  timeoutMs: number = 10000
): Promise<{ status: string; request_id: string; message_id: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(requestId);
      reject(new Error(`ACK timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingAcks.set(requestId, {
      resolve,
      reject,
      timer,
      deviceId,
    });
  });
}

/**
 * Get pending ACK count
 */
export function getPendingAckCount(): number {
  return pendingAcks.size;
}

/**
 * Clear all pending ACKs for a device (on disconnect)
 */
export function clearPendingAcksForDevice(deviceId: string): void {
  for (const [requestId, pending] of pendingAcks.entries()) {
    if (pending.deviceId === deviceId) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Device disconnected'));
      pendingAcks.delete(requestId);
    }
  }
}
