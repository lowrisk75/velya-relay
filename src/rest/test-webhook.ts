/**
 * TEST ENDPOINT - Trigger webhook manually
 * DELETE THIS FILE in production
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import { getUserWebhooks } from '../db/webhooks.js';
import { deliverWebhook } from '../webhooks/deliver.js';
import { extractApiKey } from '../auth/middleware.js';
import { validateApiKey } from '../auth/apiKey.js';

export function setupTestWebhookRoute(app: TemplatedApp): void {
  app.post('/v1/test/trigger-webhook', async (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.writeStatus('401 Unauthorized');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing API key' }));
      return;
    }

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
      const webhooks = await getUserWebhooks(userId);

      if (webhooks.length === 0) {
        res.writeStatus('404 Not Found');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'No webhooks configured' }));
        return;
      }

      // Trigger all webhooks with test event
      const event = {
        event: 'alarm_fired',
        alarm_id: 'test-webhook-' + Date.now(),
        device_id: '1b85196c-0a97-43ae-a1c9-aa1b217b396f',
        timestamp: new Date().toISOString(),
        test: true,
      };

      const results = [];
      for (const webhook of webhooks) {
        try {
          await deliverWebhook(webhook.webhook_id, webhook.url, webhook.secret, event, 'alarm_fired');
          results.push({ webhook_id: webhook.webhook_id, status: 'delivered' });
        } catch (err: any) {
          results.push({ webhook_id: webhook.webhook_id, status: 'failed', error: err.message });
        }
      }

      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        message: 'Webhooks triggered',
        event,
        results,
      }));
    } catch (err: any) {
      console.error('❌ Error triggering webhooks:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}
