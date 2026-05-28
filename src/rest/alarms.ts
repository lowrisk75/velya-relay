/**
 * REST API: Alarms Endpoints
 * GET /v1/alarms/:device_id - List device alarms
 * DELETE /v1/alarm/:alarm_id - Delete specific alarm
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';
import { getDeviceAlarms, deleteAlarm, getAlarm } from '../db/alarms.js';
import { getDeviceLastSeen } from '../db/devices.js';
import { isDeviceOnline } from '../ws/handler.js';
import { extractApiKey } from '../auth/middleware.js';
import { validateApiKey } from '../auth/apiKey.js';

/**
 * Setup alarm REST routes
 */
export function setupAlarmRoutes(app: TemplatedApp): void {
  /**
   * GET /v1/alarms/:device_id
   * List all active alarms for a device
   * Requires API key authentication
   */
  app.get('/v1/alarms/:device_id', async (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    // Extract data before any async call
    const apiKey = extractApiKey(req);
    const device_id = req.getParameter(0) || '';

    if ((res as any).aborted) return;

    // Validate device_id
    if (!device_id) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing device_id' }));
      return;
    }

    // Validate API key
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
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(device_id)) {
        res.writeStatus('400 Bad Request');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid device_id format' }));
        return;
      }

      // Get alarms
      const alarms = await getDeviceAlarms(device_id);

      // Get device status
      const lastSeen = await getDeviceLastSeen(device_id);
      const connected = isDeviceOnline(device_id);

      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        device_id,
        connected,
        last_sync: lastSeen ? lastSeen.toISOString() : null,
        count: alarms.length,
        alarms: alarms.map(alarm => ({
          alarm_id: alarm.alarm_id,
          hour: alarm.hour,
          minute: alarm.minute,
          repeat_days: alarm.repeat_days,
          label: alarm.label,
          scheduled_date: alarm.scheduled_date,
          timezone: alarm.timezone,
          is_active: alarm.is_active,
          created_at: alarm.created_at,
          created_by: alarm.created_by,
        })),
      }));
    } catch (err: any) {
      console.error('❌ Error fetching alarms:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  /**
   * DELETE /v1/alarm/:alarm_id
   * Delete a specific alarm (soft delete)
   * Requires API key authentication
   */
  app.del('/v1/alarm/:alarm_id', async (res: HttpResponse, req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    // Extract data before any async call
    const apiKey = extractApiKey(req);
    const alarm_id = req.getParameter(0) || '';

    if ((res as any).aborted) return;

    // Validate alarm_id
    if (!alarm_id) {
      res.writeStatus('400 Bad Request');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing alarm_id' }));
      return;
    }

    // Validate API key
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
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(alarm_id)) {
        res.writeStatus('400 Bad Request');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid alarm_id format' }));
        return;
      }

      // Check alarm exists
      const alarm = await getAlarm(alarm_id);
      if (!alarm) {
        res.writeStatus('404 Not Found');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Alarm not found' }));
        return;
      }

      // Delete alarm
      const deleted = await deleteAlarm(alarm_id);

      if (deleted) {
        console.log(`🗑️  Alarm deleted via REST: ${alarm_id}`);
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          alarm_id,
          status: 'deleted',
        }));
      } else {
        res.writeStatus('410 Gone');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Alarm already deleted' }));
      }
    } catch (err: any) {
      console.error('❌ Error deleting alarm:', err);
      res.writeStatus('500 Internal Server Error');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}
