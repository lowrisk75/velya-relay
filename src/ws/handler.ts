/**
 * WebSocket Handler
 * Manages WebSocket lifecycle: upgrade, open, message, close
 */

import type { TemplatedApp, HttpRequest, HttpResponse, WebSocket } from 'uwebsockets.js';
import { verifyJWT, type AccessTokenPayload } from '../auth/jwt.js';
import { config } from '../config.js';
import { routeMessage } from './router.js';
import { startHeartbeat, stopHeartbeat } from './heartbeat.js';
import { upsertDevice } from '../db/devices.js';
import { getDeviceAlarms, cleanupPastAlarms } from '../db/alarms.js';

interface WebSocketUserData {
  userId: string;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

/**
 * Active WebSocket connections
 * Map: deviceId → WebSocket
 */
const activeSockets = new Map<string, WebSocket<WebSocketUserData>>();

/**
 * Setup WebSocket route /v1/relay
 */
export function setupWebSocketRoute(app: TemplatedApp): void {
  app.ws<WebSocketUserData>('/v1/relay', {
    compression: 0, // CRIME vulnerability mitigation
    maxPayloadLength: config.websocket.maxPayloadLength,
    idleTimeout: config.websocket.idleTimeoutMs / 1000, // uWS expects seconds
    sendPingsAutomatically: true,
    maxBackpressure: config.websocket.maxBackpressure,

    /**
     * Upgrade HTTP to WebSocket
     * Validates JWT token before upgrade
     */
    upgrade: (res: HttpResponse, req: HttpRequest, context) => {
      // Extract token from query (?token=...) or Sec-WebSocket-Protocol header
      const token =
        req.getQuery('token') ||
        extractTokenFromProtocol(req.getHeader('sec-websocket-protocol'));

      if (!token) {
        res.writeStatus('401 Unauthorized');
        res.end('Missing token');
        return;
      }

      try {
        const payload = verifyJWT(token) as AccessTokenPayload;

        // Validate it's an access token (not refresh)
        if (!payload.aud || payload.aud !== 'velya-ios') {
          throw new Error('Invalid token audience');
        }

        const userData: WebSocketUserData = {
          userId: payload.sub,
          deviceId: payload.device_id,
          connectedAt: Date.now(),
          lastPing: Date.now(),
          isAlive: true,
        };

        res.upgrade(
          userData,
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        );
      } catch (err: any) {
        console.error('❌ WebSocket upgrade failed:', err.message);
        res.writeStatus('401 Unauthorized');
        res.end(err.message || 'Invalid token');
      }
    },

    /**
     * Connection opened
     */
    open: async (ws: WebSocket<WebSocketUserData>) => {
      const { deviceId, userId } = ws.getUserData();
      console.log(`✅ WebSocket connected: device=${deviceId} user=${userId}`);

      // Register device in database
      try {
        await upsertDevice(deviceId, userId);
        console.log(`💾 Device registered: ${deviceId}`);
      } catch (err: any) {
        console.error(`⚠️  Failed to register device: ${err.message}`);
      }

      // Store active connection
      activeSockets.set(deviceId, ws);

      // Start heartbeat
      startHeartbeat(ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        device_id: deviceId,
        timestamp: Date.now(),
        connected: true,
      }), false);

      // Cleanup past one-time alarms before syncing
      try {
        await cleanupPastAlarms();
      } catch (err: any) {
        console.error(`⚠️  Failed to cleanup past alarms: ${err.message}`);
      }

      // Send all active alarms to sync device state
      try {
        const alarms = await getDeviceAlarms(deviceId);
        if (alarms.length > 0) {
          console.log(`📤 Sending ${alarms.length} alarms to ${deviceId}`);
          ws.send(JSON.stringify({
            type: 'alarms_sync',
            alarms: alarms.map(alarm => ({
              alarm_id: alarm.alarm_id,
              hour: alarm.hour,
              minute: alarm.minute,
              repeat_days: alarm.repeat_days,
              label: alarm.label,
              scheduled_date: alarm.scheduled_date,
              timezone: alarm.timezone,
              created_at: alarm.created_at,
              created_by: alarm.created_by,
            })),
            count: alarms.length,
          }), false);
        }
      } catch (err: any) {
        console.error(`⚠️  Failed to fetch alarms: ${err.message}`);
      }
    },

    /**
     * Message received
     */
    message: async (ws: WebSocket<WebSocketUserData>, message: ArrayBuffer, isBinary: boolean) => {
      if (isBinary) {
        console.warn('⚠️  Received binary message, ignoring');
        return;
      }

      try {
        const text = Buffer.from(message).toString('utf8');
        const data = JSON.parse(text);
        await routeMessage(ws, data);
      } catch (err: any) {
        console.error('❌ Message parse error:', err.message);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format',
        }), false);
      }
    },

    /**
     * Connection closed
     */
    close: (ws: WebSocket<WebSocketUserData>, code: number, _message: ArrayBuffer) => {
      const { deviceId } = ws.getUserData();
      console.log(`❌ WebSocket closed: device=${deviceId} code=${code}`);

      // Remove from active connections
      activeSockets.delete(deviceId);

      // Stop heartbeat
      stopHeartbeat(ws);
    },

    /**
     * Drain handler (backpressure)
     */
    drain: (_ws: WebSocket<WebSocketUserData>) => {
      console.warn('⚠️  WebSocket backpressure drained');
    },
  });
}

/**
 * Send message to a specific device
 * @returns true if sent, false if device offline
 */
export function sendToDevice(deviceId: string, message: any): boolean {
  const ws = activeSockets.get(deviceId);
  if (!ws) {
    return false;
  }

  try {
    const text = JSON.stringify(message);
    ws.send(text, false);
    return true;
  } catch (err: any) {
    console.error(`❌ Failed to send to device ${deviceId}:`, err.message);
    return false;
  }
}

/**
 * Get active connection count
 */
export function getActiveConnectionCount(): number {
  return activeSockets.size;
}

/**
 * Get all active device IDs
 */
export function getActiveDevices(): string[] {
  return Array.from(activeSockets.keys());
}

/**
 * Check if device is online
 */
export function isDeviceOnline(deviceId: string): boolean {
  return activeSockets.has(deviceId);
}

/**
 * Extract JWT from Sec-WebSocket-Protocol header
 * Format: "bearer.<token>" or just "<token>"
 */
function extractTokenFromProtocol(protocol: string): string | null {
  if (!protocol) return null;

  // Format: "bearer.eyJhbGc..."
  if (protocol.startsWith('bearer.')) {
    return protocol.substring(7);
  }

  // Fallback: entire protocol is token
  return protocol;
}
