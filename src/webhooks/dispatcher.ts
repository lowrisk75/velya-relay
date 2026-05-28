/**
 * Webhook Dispatcher
 * Sends events to configured webhook endpoints
 */

import crypto from 'crypto';
import {
  getWebhooksForEvent,
  recordWebhookTrigger,
  logWebhookDelivery,
} from '../db/webhooks.js';

export interface WebhookPayload {
  event: string;
  device_id: string;
  user_id: string;
  timestamp: string;
  data: any;
}

/**
 * Dispatch an event to all registered webhooks for a user
 */
export async function dispatchWebhookEvent(
  user_id: string,
  event_type: string,
  payload: WebhookPayload
): Promise<void> {
  try {
    // Get all active webhooks for this user that listen to this event
    const webhooks = await getWebhooksForEvent(user_id, event_type);

    if (webhooks.length === 0) {
      console.log(`📤 No webhooks registered for event: ${event_type}`);
      return;
    }

    console.log(`📤 Dispatching ${event_type} to ${webhooks.length} webhook(s)`);

    // Dispatch to all webhooks in parallel (don't block)
    const promises = webhooks.map((webhook) =>
      sendWebhook(webhook.webhook_id, webhook.url, webhook.secret, event_type, payload)
    );

    await Promise.allSettled(promises);
  } catch (err: any) {
    console.error(`❌ Error dispatching webhook event: ${err.message}`);
  }
}

/**
 * Send a single webhook request
 */
async function sendWebhook(
  webhook_id: string,
  url: string,
  secret: string,
  event_type: string,
  payload: WebhookPayload
): Promise<void> {
  const startTime = Date.now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    // Generate HMAC-SHA256 signature
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Send POST request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Velya-Cloud-Relay/1.0',
        'X-Velya-Signature': signature,
        'X-Velya-Event': event_type,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    statusCode = response.status;
    responseBody = await response.text();

    if (!response.ok) {
      error = `HTTP ${statusCode}: ${responseBody.substring(0, 200)}`;
      console.error(`⚠️  Webhook failed: ${url} - ${error}`);
      await recordWebhookTrigger(webhook_id, false);
    } else {
      console.log(`✅ Webhook delivered: ${url} - ${statusCode}`);
      await recordWebhookTrigger(webhook_id, true);
    }
  } catch (err: any) {
    error = err.message;
    console.error(`❌ Webhook error: ${url} - ${error}`);
    await recordWebhookTrigger(webhook_id, false);
  } finally {
    const duration = Date.now() - startTime;

    // Log delivery attempt
    await logWebhookDelivery(
      webhook_id,
      event_type,
      payload,
      statusCode,
      responseBody,
      error,
      duration
    );
  }
}

/**
 * Helper: Create alarm event payload
 */
export function createAlarmEventPayload(
  event_type: string,
  device_id: string,
  user_id: string,
  alarm_id: string,
  timestamp: Date,
  extra?: any
): WebhookPayload {
  return {
    event: event_type,
    device_id,
    user_id,
    timestamp: timestamp.toISOString(),
    data: {
      alarm_id,
      ...extra,
    },
  };
}
