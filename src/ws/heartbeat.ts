/**
 * WebSocket Heartbeat
 * Ping/Pong every 45 seconds to detect dead connections
 */

import type { WebSocket } from 'uwebsockets.js';
import { config } from '../config.js';

interface WebSocketUserData {
  userId: string;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

/**
 * Active heartbeat timers
 * Map: deviceId → NodeJS.Timeout
 */
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

/**
 * Start heartbeat for a WebSocket connection
 */
export function startHeartbeat(ws: WebSocket<WebSocketUserData>): void {
  const userData = ws.getUserData();
  const { deviceId } = userData;

  // Clear any existing timer
  stopHeartbeat(ws);

  const interval = setInterval(() => {
    if (!userData.isAlive) {
      console.warn(`⚠️  Heartbeat timeout: device=${deviceId}`);
      clearInterval(interval);
      heartbeatTimers.delete(deviceId);
      ws.close();
      return;
    }

    // Mark as not alive, will be set true on pong
    userData.isAlive = false;
    userData.lastPing = Date.now();

    // Send ping
    ws.ping();
  }, config.websocket.heartbeatIntervalMs);

  heartbeatTimers.set(deviceId, interval);

  // Set initial alive state
  userData.isAlive = true;
}

/**
 * Stop heartbeat for a WebSocket connection
 */
export function stopHeartbeat(ws: WebSocket<WebSocketUserData>): void {
  const { deviceId } = ws.getUserData();
  const timer = heartbeatTimers.get(deviceId);

  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(deviceId);
  }
}

/**
 * Mark connection as alive (called on pong)
 */
export function markAlive(ws: WebSocket<WebSocketUserData>): void {
  const userData = ws.getUserData();
  userData.isAlive = true;
  userData.lastPing = Date.now();
}

/**
 * Get heartbeat stats
 */
export function getHeartbeatStats(): {
  activeHeartbeats: number;
  interval: number;
} {
  return {
    activeHeartbeats: heartbeatTimers.size,
    interval: config.websocket.heartbeatIntervalMs,
  };
}
