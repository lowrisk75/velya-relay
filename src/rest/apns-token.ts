/**
 * APNs Token Registration Endpoint
 * PUT /v1/devices/:device_id/apns-token
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import { setAPNsToken } from '../db/devices.js';
import { extractApiKey } from '../auth/middleware.js';
import { verifyJWT } from '../auth/jwt.js';

export function setupAPNsTokenRoute(app: TemplatedApp): void {
  /**
   * PUT /v1/devices/:device_id/apns-token
   * Register or update APNs device token
   * Requires JWT authentication
   */
  app.put('/v1/devices/:device_id/apns-token', (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    // Extract device_id and Authorization header BEFORE onData
    const deviceId = req.getParameter(0);
    const bearerToken = extractApiKey(req); // This extracts "Bearer <token>" → returns token

    if (!deviceId) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing device_id' }));
      return;
    }

    if (!bearerToken) {
      res.writeStatus('401 Unauthorized');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing Authorization header' }));
      return;
    }

    // Collect body
    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        const finalBuffer = Buffer.from(buffer);
        handleAPNsTokenRequest(res, deviceId, bearerToken, finalBuffer);
      }
    });
  });
}

async function handleAPNsTokenRequest(
  res: HttpResponse,
  deviceId: string,
  bearerToken: string,
  bodyBuffer: Buffer
): Promise<void> {
  if ((res as any).aborted) return;

  // Validate JWT
  let payload;
  try {
    payload = verifyJWT(bearerToken);
  } catch (err: any) {
    res.writeStatus('401 Unauthorized');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid or expired JWT' }));
    return;
  }

  // Verify device_id matches JWT
  if (payload.device_id !== deviceId) {
    res.writeStatus('403 Forbidden');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Device ID mismatch' }));
    return;
  }

  try {
    // Parse body
    const body = JSON.parse(bodyBuffer.toString('utf8'));
    const apnsToken = body.apns_token;

    if (!apnsToken || typeof apnsToken !== 'string') {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing or invalid apns_token' }));
      return;
    }

    // Validate token format (64 hex characters)
    if (!/^[0-9a-f]{64}$/i.test(apnsToken)) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid APNs token format (expected 64 hex chars)' }));
      return;
    }

    // Store token in database
    await setAPNsToken(deviceId, apnsToken);

    console.log(`✅ APNs token registered for device ${deviceId}: ${apnsToken.substring(0, 16)}...`);

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      device_id: deviceId,
    }));
  } catch (err: any) {
    console.error('❌ Error handling APNs token request:', err);
    if ((res as any).aborted) return;

    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: err.message || 'Internal server error',
    }));
  }
}
