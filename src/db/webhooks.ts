/**
 * Webhooks Database Layer
 * Manage webhook configurations and delivery logs
 */

import { pool } from './pg.js';

export interface Webhook {
  webhook_id: string;
  user_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_triggered_at: Date | null;
  failure_count: number;
}

export interface CreateWebhook {
  user_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
}

export interface WebhookDelivery {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  payload: any;
  status_code: number | null;
  response_body: string | null;
  error: string | null;
  delivered_at: Date;
  duration_ms: number | null;
}

/**
 * Create a webhook
 */
export async function createWebhook(webhook: CreateWebhook): Promise<Webhook> {
  const query = `
    INSERT INTO webhooks (user_id, name, url, secret, events)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const result = await pool.query(query, [
    webhook.user_id,
    webhook.name,
    webhook.url,
    webhook.secret,
    webhook.events,
  ]);

  return result.rows[0];
}

/**
 * Get webhooks for a user that match an event type
 */
export async function getWebhooksForEvent(
  user_id: string,
  event_type: string
): Promise<Webhook[]> {
  const query = `
    SELECT * FROM webhooks
    WHERE user_id = $1
      AND is_active = true
      AND $2 = ANY(events)
  `;

  const result = await pool.query(query, [user_id, event_type]);
  return result.rows;
}

/**
 * Get all webhooks for a user
 */
export async function getUserWebhooks(user_id: string): Promise<Webhook[]> {
  const query = `
    SELECT * FROM webhooks
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [user_id]);
  return result.rows;
}

/**
 * Update webhook
 */
export async function updateWebhook(
  webhook_id: string,
  updates: Partial<Pick<Webhook, 'name' | 'url' | 'events' | 'is_active'>>
): Promise<Webhook> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.url !== undefined) {
    fields.push(`url = $${idx++}`);
    values.push(updates.url);
  }
  if (updates.events !== undefined) {
    fields.push(`events = $${idx++}`);
    values.push(updates.events);
  }
  if (updates.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(updates.is_active);
  }

  fields.push(`updated_at = NOW()`);
  values.push(webhook_id);

  const query = `
    UPDATE webhooks
    SET ${fields.join(', ')}
    WHERE webhook_id = $${idx}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Delete webhook
 */
export async function deleteWebhook(webhook_id: string): Promise<boolean> {
  const query = 'DELETE FROM webhooks WHERE webhook_id = $1';
  const result = await pool.query(query, [webhook_id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update webhook last triggered time and failure count
 */
export async function recordWebhookTrigger(
  webhook_id: string,
  success: boolean
): Promise<void> {
  const query = `
    UPDATE webhooks
    SET last_triggered_at = NOW(),
        failure_count = CASE
          WHEN $2 THEN 0
          ELSE failure_count + 1
        END
    WHERE webhook_id = $1
  `;

  await pool.query(query, [webhook_id, success]);
}

/**
 * Log webhook delivery
 */
export async function logWebhookDelivery(
  webhook_id: string,
  event_type: string,
  payload: any,
  status_code: number | null,
  response_body: string | null,
  error: string | null,
  duration_ms: number | null
): Promise<WebhookDelivery> {
  const query = `
    INSERT INTO webhook_deliveries (
      webhook_id, event_type, payload, status_code, response_body, error, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await pool.query(query, [
    webhook_id,
    event_type,
    payload,
    status_code,
    response_body,
    error,
    duration_ms,
  ]);

  return result.rows[0];
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
  webhook_id: string,
  limit: number = 50
): Promise<WebhookDelivery[]> {
  const query = `
    SELECT * FROM webhook_deliveries
    WHERE webhook_id = $1
    ORDER BY delivered_at DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [webhook_id, limit]);
  return result.rows;
}
