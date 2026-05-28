/**
 * Alarm persistence layer
 * Manages alarm CRUD operations in PostgreSQL
 */

import { pool } from './pg.js';

export interface Alarm {
  alarm_id: string;
  device_id: string;
  user_id: string;
  hour: number;
  minute: number;
  repeat_days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  label: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: 'remote' | 'local';
  scheduled_date: string | null; // YYYY-MM-DD for one-time alarms
  timezone: string; // IANA timezone (Europe/Paris, America/New_York)
}

export interface CreateAlarmInput {
  device_id: string;
  user_id: string;
  hour: number;
  minute: number;
  repeat_days?: number[];
  label?: string;
  created_by?: 'remote' | 'local';
  scheduled_date?: string | null; // YYYY-MM-DD
  timezone?: string; // IANA timezone
}

/**
 * Create or update an alarm
 * If alarm with same device_id + hour + minute exists, update it
 */
export async function upsertAlarm(input: CreateAlarmInput): Promise<Alarm> {
  const query = `
    INSERT INTO alarms (device_id, user_id, hour, minute, repeat_days, label, created_by, scheduled_date, timezone, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    ON CONFLICT (device_id, hour, minute, is_active)
    DO UPDATE SET
      repeat_days = EXCLUDED.repeat_days,
      label = EXCLUDED.label,
      scheduled_date = EXCLUDED.scheduled_date,
      timezone = EXCLUDED.timezone,
      updated_at = NOW()
    RETURNING *
  `;

  const values = [
    input.device_id,
    input.user_id,
    input.hour,
    input.minute,
    input.repeat_days || [],
    input.label || null,
    input.created_by || 'remote',
    input.scheduled_date || null,
    input.timezone || 'UTC',
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Get all active alarms for a device
 */
export async function getDeviceAlarms(device_id: string): Promise<Alarm[]> {
  const query = `
    SELECT * FROM alarms
    WHERE device_id = $1 AND is_active = true
    ORDER BY hour ASC, minute ASC
  `;

  const result = await pool.query(query, [device_id]);
  return result.rows;
}

/**
 * Get a single alarm by ID
 */
export async function getAlarm(alarm_id: string): Promise<Alarm | null> {
  const query = 'SELECT * FROM alarms WHERE alarm_id = $1';
  const result = await pool.query(query, [alarm_id]);
  return result.rows[0] || null;
}

/**
 * Delete an alarm (soft delete by setting is_active = false)
 */
export async function deleteAlarm(alarm_id: string): Promise<boolean> {
  const query = `
    UPDATE alarms
    SET is_active = false, updated_at = NOW()
    WHERE alarm_id = $1 AND is_active = true
    RETURNING alarm_id
  `;

  const result = await pool.query(query, [alarm_id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete alarm by time (for alarm.cancel command with hour/minute payload)
 */
export async function deleteAlarmByTime(
  device_id: string,
  hour: number,
  minute: number
): Promise<boolean> {
  const query = `
    UPDATE alarms
    SET is_active = false, updated_at = NOW()
    WHERE device_id = $1 AND hour = $2 AND minute = $3 AND is_active = true
    RETURNING alarm_id
  `;

  const result = await pool.query(query, [device_id, hour, minute]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Toggle alarm active state
 */
export async function toggleAlarm(alarm_id: string): Promise<Alarm | null> {
  const query = `
    UPDATE alarms
    SET is_active = NOT is_active, updated_at = NOW()
    WHERE alarm_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [alarm_id]);
  return result.rows[0] || null;
}

/**
 * Get user_id from device_id (for alarm creation)
 */
export async function getUserIdFromDevice(device_id: string): Promise<string | null> {
  const query = 'SELECT user_id FROM devices WHERE device_id = $1';
  const result = await pool.query(query, [device_id]);
  return result.rows[0]?.user_id || null;
}

/**
 * Clean up past one-time alarms (scheduled_date < today)
 * Should be called periodically or on device connect
 */
export async function cleanupPastAlarms(): Promise<number> {
  const query = `
    UPDATE alarms
    SET is_active = false, updated_at = NOW()
    WHERE scheduled_date IS NOT NULL
      AND scheduled_date < CURRENT_DATE
      AND is_active = true
    RETURNING alarm_id
  `;

  const result = await pool.query(query);
  const count = result.rowCount ?? 0;

  if (count > 0) {
    console.log(`🗑️  Cleaned up ${count} past one-time alarms`);
  }

  return count;
}
