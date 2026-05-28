/**
 * REST API: Command Endpoint
 * POST /v1/command - Send command from Node-RED to iPhone
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import { CommandRequestSchema } from '../types/schemas.js';
import { addCommand } from '../db/redis.js';
import { sendToDevice } from '../ws/handler.js';
import { extractApiKey } from '../auth/middleware.js';
import { validateApiKey } from '../auth/apiKey.js';
import { checkDeviceRateLimit, checkApiKeyRateLimit } from '../rateLimit/middleware.js';
import { upsertAlarm, deleteAlarmByTime, getUserIdFromDevice } from '../db/alarms.js';
import { broadcastAlarmChange } from '../ws/multiDevice.js';
import { dispatchWebhookEvent, createAlarmEventPayload } from '../webhooks/dispatcher.js';
import { sendSilentPush } from '../apns.js';
import { getAPNsToken } from '../db/devices.js';

/**
 * Setup REST command routes
 */
export function setupCommandRoutes(app: TemplatedApp): void {
  /**
   * POST /v1/command
   * Send command to iPhone via WebSocket or queue if offline
   * Requires API key authentication
   */
  app.post('/v1/command', (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    // Extract ALL data from HttpRequest BEFORE onData (uWS requirement)
    const apiKey = extractApiKey(req);

    // Collect body
    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        // CRITICAL: Copy buffer before async call to prevent GC/reference issues
        const finalBuffer = Buffer.from(buffer);
        // Now handle asynchronously (req is no longer accessible)
        handleCommandRequestWithAuth(res, apiKey, finalBuffer);
      }
    });
  });
}

/**
 * Handle command request with authentication
 */
async function handleCommandRequestWithAuth(
  res: HttpResponse,
  apiKey: string | null,
  bodyBuffer: Buffer
): Promise<void> {
  if ((res as any).aborted) return;

  // Validate API key
  if (!apiKey) {
    res.writeStatus('401 Unauthorized');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing API key' }));
    return;
  }

  // Now validate asynchronously
  let userId: string | null;
  try {
    userId = await validateApiKey(apiKey);
  } catch (err: any) {
    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Validation error' }));
    return;
  }

  if (!userId) {
    res.writeStatus('401 Unauthorized');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid API key' }));
    return;
  }

  if ((res as any).aborted) return;

  try {
    // Parse and validate body
    const body = JSON.parse(bodyBuffer.toString('utf8'));
    const parseResult = CommandRequestSchema.safeParse(body);

    if (!parseResult.success) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Invalid request',
        details: parseResult.error.issues,
      }));
      return;
    }

    const { device_id, request_id, command, payload } = parseResult.data;

    // Check rate limits
    const apiKeyAllowed = await checkApiKeyRateLimit(userId);
    if (!apiKeyAllowed) {
      res.writeStatus('429 Too Many Requests');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'API key rate limit exceeded',
        request_id,
      }));
      return;
    }

    const deviceAllowed = await checkDeviceRateLimit(device_id);
    if (!deviceAllowed) {
      res.writeStatus('429 Too Many Requests');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Device rate limit exceeded',
        request_id,
      }));
      return;
    }

    // Persist alarm commands to PostgreSQL
    try {
      if (command === 'alarm.set') {
        const user_id = await getUserIdFromDevice(device_id);
        if (user_id) {
          const alarm = await upsertAlarm({
            device_id,
            user_id,
            hour: payload.hour,
            minute: payload.minute,
            repeat_days: payload.repeat_days || [],
            label: payload.label || null,
            scheduled_date: payload.scheduled_date || null,
            timezone: payload.timezone || 'UTC',
            created_by: 'remote',
          });
          const dateInfo = payload.scheduled_date ? ` on ${payload.scheduled_date}` : '';
          console.log(`💾 Alarm persisted: ${device_id} ${payload.hour}:${payload.minute}${dateInfo}`);

          // Multi-device sync: broadcast to other devices
          await broadcastAlarmChange(user_id, 'alarm_set', {
            alarm_id: alarm.alarm_id,
            hour: alarm.hour,
            minute: alarm.minute,
            repeat_days: alarm.repeat_days,
            label: alarm.label,
            scheduled_date: alarm.scheduled_date,
            timezone: alarm.timezone,
          });

          // Webhook: notify external systems
          const webhookPayload = createAlarmEventPayload(
            'alarm_set',
            device_id,
            user_id,
            alarm.alarm_id,
            new Date(),
            {
              hour: alarm.hour,
              minute: alarm.minute,
              repeat_days: alarm.repeat_days,
              label: alarm.label,
              scheduled_date: alarm.scheduled_date,
              timezone: alarm.timezone,
            }
          );
          await dispatchWebhookEvent(user_id, 'alarm_set', webhookPayload);
        }
      } else if (command === 'alarm.delete' || command === 'alarm.cancel') {
        const user_id = await getUserIdFromDevice(device_id);
        if (user_id) {
          await deleteAlarmByTime(device_id, payload.hour, payload.minute);
          console.log(`🗑️  Alarm deleted: ${device_id} ${payload.hour}:${payload.minute}`);

          // Multi-device sync: broadcast cancellation
          await broadcastAlarmChange(user_id, 'alarm_cancelled', {
            hour: payload.hour,
            minute: payload.minute,
          });

          // Webhook: notify external systems
          const webhookPayload = createAlarmEventPayload(
            'alarm_cancelled',
            device_id,
            user_id,
            '', // No alarm_id for cancellation by time
            new Date(),
            {
              hour: payload.hour,
              minute: payload.minute,
            }
          );
          await dispatchWebhookEvent(user_id, 'alarm_cancelled', webhookPayload);
        }
      }
    } catch (err: any) {
      console.error(`⚠️  Failed to persist alarm command: ${err.message}`);
      // Continue anyway - relay is primary, persistence is secondary
    }

    // Add to Redis Stream (persistent queue)
    const messageId = await addCommand(device_id, request_id, command, payload);

    // Try to send immediately if device is online
    const sent = sendToDevice(device_id, {
      type: 'command',
      request_id,
      message_id: messageId,
      command,
      payload,
    });

    if (sent) {
      console.log(`✅ Command sent to ${device_id}: ${request_id}`);

      // Optionally wait for ACK (commented out for async behavior)
      // try {
      //   await waitForAck(request_id, device_id, 10000);
      //   res.writeStatus('200 OK');
      //   res.writeHeader('Content-Type', 'application/json');
      //   res.end(JSON.stringify({
      //     request_id,
      //     message_id: messageId,
      //     status: 'delivered',
      //   }));
      // } catch (err: any) {
      //   res.writeStatus('202 Accepted');
      //   res.writeHeader('Content-Type', 'application/json');
      //   res.end(JSON.stringify({
      //     request_id,
      //     message_id: messageId,
      //     status: 'sent_no_ack',
      //     error: err.message,
      //   }));
      // }

      // Async response (don't wait for ACK)
      res.writeStatus('202 Accepted');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        request_id,
        message_id: messageId,
        status: 'sent',
      }));
    } else {
      console.log(`📥 Command queued for offline device ${device_id}: ${request_id}`);

      // Try to wake device with silent push
      try {
        const apnsToken = await getAPNsToken(device_id);
        if (apnsToken) {
          await sendSilentPush(apnsToken, {
            command: 'wake',
            has_pending: true,
          });
          console.log(`📲 Silent push sent to wake device ${device_id}`);
        } else {
          console.log(`⚠️  No APNs token registered for ${device_id}`);
        }
      } catch (err: any) {
        console.error(`❌ Failed to send silent push: ${err.message}`);
        // Continue anyway - command is queued
      }

      res.writeStatus('202 Accepted');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        request_id,
        message_id: messageId,
        status: 'queued',
      }));
    }
  } catch (err: any) {
    console.error('❌ Error handling command:', err);
    if ((res as any).aborted) return;

    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: err.message || 'Internal server error',
    }));
  }
}
