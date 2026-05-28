/**
 * REST API: Webhooks Management
 * POST /v1/webhooks - Create webhook
 * GET /v1/webhooks - List webhooks
 * PUT /v1/webhooks/:webhook_id - Update webhook
 * DELETE /v1/webhooks/:webhook_id - Delete webhook
 * GET /v1/webhooks/:webhook_id/deliveries - Get delivery history
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import crypto from 'crypto';
import {
  createWebhook,
  getUserWebhooks,
  deleteWebhook,
  getWebhookDeliveries,
} from '../db/webhooks.js';
import { extractApiKey } from '../auth/middleware.js';
import { validateApiKey } from '../auth/apiKey.js';

/**
 * Setup webhook REST routes
 */
export function setupWebhookRoutes(app: TemplatedApp): void {
  /**
   * POST /v1/webhooks
   * Create a new webhook
   */
  app.post('/v1/webhooks', (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    const apiKey = extractApiKey(req);
    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        const finalBuffer = Buffer.from(buffer);
        handleCreateWebhook(res, apiKey, finalBuffer);
      }
    });
  });

  /**
   * GET /v1/webhooks
   * List all webhooks for authenticated user
   */
  app.get('/v1/webhooks', async (res: HttpResponse, req: HttpRequest) => {
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

      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        count: webhooks.length,
        webhooks: webhooks.map(wh => ({
          webhook_id: wh.webhook_id,
          name: wh.name,
          url: wh.url,
          events: wh.events,
          is_active: wh.is_active,
          created_at: wh.created_at,
          last_triggered_at: wh.last_triggered_at,
          failure_count: wh.failure_count,
        })),
      }));
    } catch (err: any) {
      console.error('❌ Error listing webhooks:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  /**
   * DELETE /v1/webhooks/:webhook_id
   * Delete a webhook
   */
  app.del('/v1/webhooks/:webhook_id', async (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    const apiKey = extractApiKey(req);
    const webhook_id = req.getParameter(0) || '';

    if (!webhook_id) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing webhook_id' }));
      return;
    }

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
      const deleted = await deleteWebhook(webhook_id);

      if (deleted) {
        console.log(`🗑️  Webhook deleted: ${webhook_id}`);
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          webhook_id,
          status: 'deleted',
        }));
      } else {
        res.writeStatus('404 Not Found');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Webhook not found' }));
      }
    } catch (err: any) {
      console.error('❌ Error deleting webhook:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  /**
   * GET /v1/webhooks/:webhook_id/deliveries
   * Get webhook delivery history
   */
  app.get('/v1/webhooks/:webhook_id/deliveries', async (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    const apiKey = extractApiKey(req);
    const webhook_id = req.getParameter(0) || '';

    if (!webhook_id) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing webhook_id' }));
      return;
    }

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
      const deliveries = await getWebhookDeliveries(webhook_id, 50);

      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        webhook_id,
        count: deliveries.length,
        deliveries: deliveries.map(d => ({
          delivery_id: d.delivery_id,
          event_type: d.event_type,
          status_code: d.status_code,
          error: d.error,
          delivered_at: d.delivered_at,
          duration_ms: d.duration_ms,
        })),
      }));
    } catch (err: any) {
      console.error('❌ Error fetching deliveries:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

/**
 * Handle webhook creation
 */
async function handleCreateWebhook(
  res: HttpResponse,
  apiKey: string | null,
  bodyBuffer: Buffer
): Promise<void> {
  if ((res as any).aborted) return;

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
    const body = JSON.parse(bodyBuffer.toString('utf8'));

    // Validate required fields
    if (!body.name || !body.url || !body.events) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Missing required fields: name, url, events',
      }));
      return;
    }

    // Generate secret if not provided
    const secret = body.secret || crypto.randomBytes(32).toString('hex');

    const webhook = await createWebhook({
      user_id: userId,
      name: body.name,
      url: body.url,
      secret,
      events: body.events,
    });

    console.log(`✅ Webhook created: ${webhook.webhook_id} - ${webhook.name}`);

    res.writeStatus('201 Created');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      webhook_id: webhook.webhook_id,
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret, // Return secret only on creation
      events: webhook.events,
      created_at: webhook.created_at,
    }));
  } catch (err: any) {
    console.error('❌ Error creating webhook:', err);
    res.writeStatus('500 Internal Server Error');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: err.message || 'Internal server error',
    }));
  }
}
