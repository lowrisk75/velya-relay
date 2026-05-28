/**
 * Webhook Delivery
 * HTTP POST with HMAC-SHA256 signature
 */

import crypto from 'crypto';
import { logWebhookDelivery } from '../db/webhooks.js';

/**
 * Deliver webhook event to URL
 */
export async function deliverWebhook(
  webhook_id: string,
  url: string,
  secret: string,
  payload: any,
  event_type: string
): Promise<void> {
  const startTime = Date.now();

  try {
    const payloadString = JSON.stringify(payload);

    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    // Send HTTP POST
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-velya-signature': signature,
        'User-Agent': 'Velya-Relay/1.0',
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const duration_ms = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Log successful delivery
    const responseBody = await response.text();
    await logWebhookDelivery(
      webhook_id,
      event_type,
      payload,
      response.status,
      responseBody,
      null,
      duration_ms
    );

    console.log(`✅ Webhook delivered: ${webhook_id} - ${event_type} (${duration_ms}ms)`);
  } catch (err: any) {
    const duration_ms = Date.now() - startTime;

    // Log failed delivery
    await logWebhookDelivery(
      webhook_id,
      event_type,
      payload,
      null,
      null,
      err.message,
      duration_ms
    );

    console.error(`❌ Webhook delivery failed: ${webhook_id} - ${err.message}`);
    throw err;
  }
}
