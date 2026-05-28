/**
 * Alarm Events Database Layer
 * Handles alarm_fired, alarm_snoozed, alarm_dismissed events
 */

import { pool } from './pg.js';

export interface AlarmEvent {
  event_id: string;
  alarm_id: string;
  device_id: string;
  user_id: string;
  event_type: 'fired' | 'snoozed' | 'dismissed';
  timestamp: Date;
  snooze_until: Date | null;
  created_at: Date;
}

export interface CreateAlarmEvent {
  alarm_id: string;
  device_id: string;
  user_id: string;
  event_type: 'fired' | 'snoozed' | 'dismissed';
  timestamp: Date;
  snooze_until?: Date;
}

/**
 * Record an alarm event
 */
export async function createAlarmEvent(
  event: CreateAlarmEvent
): Promise<AlarmEvent> {
  const query = `
    INSERT INTO alarm_events (
      alarm_id, device_id, user_id, event_type, timestamp, snooze_until
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const result = await pool.query(query, [
    event.alarm_id,
    event.device_id,
    event.user_id,
    event.event_type,
    event.timestamp,
    event.snooze_until || null,
  ]);

  return result.rows[0];
}

/**
 * Get all events for an alarm
 */
export async function getAlarmEvents(alarm_id: string): Promise<AlarmEvent[]> {
  const query = `
    SELECT * FROM alarm_events
    WHERE alarm_id = $1
    ORDER BY timestamp DESC
  `;

  const result = await pool.query(query, [alarm_id]);
  return result.rows;
}

/**
 * Get all events for a device
 */
export async function getDeviceEvents(
  device_id: string,
  limit: number = 100
): Promise<AlarmEvent[]> {
  const query = `
    SELECT * FROM alarm_events
    WHERE device_id = $1
    ORDER BY timestamp DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [device_id, limit]);
  return result.rows;
}

/**
 * Update alarm snooze state
 */
export async function snoozeAlarm(
  alarm_id: string,
  snooze_until: Date
): Promise<void> {
  const query = `
    UPDATE alarms
    SET snoozed_until = $1, updated_at = NOW()
    WHERE alarm_id = $2
  `;

  await pool.query(query, [snooze_until, alarm_id]);
}

/**
 * Clear alarm snooze state
 */
export async function clearSnooze(alarm_id: string): Promise<void> {
  const query = `
    UPDATE alarms
    SET snoozed_until = NULL, updated_at = NOW()
    WHERE alarm_id = $1
  `;

  await pool.query(query, [alarm_id]);
}

/**
 * Get latest event for an alarm
 */
export async function getLatestAlarmEvent(
  alarm_id: string
): Promise<AlarmEvent | null> {
  const query = `
    SELECT * FROM alarm_events
    WHERE alarm_id = $1
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [alarm_id]);
  return result.rows.length > 0 ? result.rows[0] : null;
}
