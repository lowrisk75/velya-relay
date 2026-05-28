/**
 * REST API: Helper Endpoints
 * POST /v1/helpers/alarm-in - Calculate alarm time from relative offset
 */

import type { TemplatedApp, HttpRequest, HttpResponse } from 'uwebsockets.js';

/**
 * Setup helper REST routes
 */
export function setupHelperRoutes(app: TemplatedApp): void {
  /**
   * POST /v1/helpers/alarm-in
   * Calculate alarm time from "in X hours/minutes"
   * No auth required (pure calculation)
   *
   * Body: { hours?: number, minutes?: number, timezone?: string }
   * Returns: { hour: number, minute: number, scheduled_date: string, timezone: string }
   */
  app.post('/v1/helpers/alarm-in', (res: HttpResponse, _req: HttpRequest) => {
    res.onAborted(() => {
      (res as any).aborted = true;
    });

    let buffer: Buffer | undefined;

    res.onData((chunk, isLast) => {
      const chunkBuffer = Buffer.from(chunk);
      buffer = buffer ? Buffer.concat([buffer, chunkBuffer]) : chunkBuffer;

      if (isLast) {
        const finalBuffer = Buffer.from(buffer);
        handleAlarmInRequest(res, finalBuffer);
      }
    });
  });
}

async function handleAlarmInRequest(
  res: HttpResponse,
  bodyBuffer: Buffer
): Promise<void> {
  if ((res as any).aborted) return;

  try {
    const body = JSON.parse(bodyBuffer.toString('utf8'));
    const hours = body.hours || 0;
    const minutes = body.minutes || 0;
    const timezone = body.timezone || 'UTC';

    // Calculate target time
    const now = new Date();
    const targetTime = new Date(now.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);

    // Extract components
    const hour = targetTime.getUTCHours();
    const minute = targetTime.getUTCMinutes();
    const scheduled_date = targetTime.toISOString().split('T')[0]; // YYYY-MM-DD

    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      hour,
      minute,
      scheduled_date,
      timezone,
      calculated_at: now.toISOString(),
      target_time: targetTime.toISOString(),
    }));
  } catch (err: any) {
    console.error('❌ Error calculating alarm time:', err);
    res.writeStatus('400 Bad Request');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid request body' }));
  }
}
