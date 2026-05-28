/**
 * Device Registration and Management
 */

import { pool } from './pg.js';

/**
 * Register or update a device with robust UUID validation
 */
export async function upsertDevice(
  device_id: string,
  user_id: string
): Promise<void> {
  // Validate if user_id is a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUUID = uuidRegex.test(user_id);

  // If not a valid UUID, use default system user
  const effectiveUserId = isValidUUID ? user_id : '00000000-0000-0000-0000-000000000001';

  if (!isValidUUID) {
    console.log(`⚠️  User ID "${user_id}" is not a UUID, using default system user`);
  }

  const query = `
    INSERT INTO devices (device_id, user_id, last_seen)
    VALUES ($1, $2, NOW())
    ON CONFLICT (device_id)
    DO UPDATE SET
      last_seen = NOW(),
      user_id = EXCLUDED.user_id
  `;

  await pool.query(query, [device_id, effectiveUserId]);
}

/**
 * Update device last_seen timestamp
 */
export async function updateDeviceLastSeen(device_id: string): Promise<void> {
  const query = 'UPDATE devices SET last_seen = NOW() WHERE device_id = $1';
  await pool.query(query, [device_id]);
}

/**
 * Get device last_seen timestamp
 */
export async function getDeviceLastSeen(device_id: string): Promise<Date | null> {
  const query = 'SELECT last_seen FROM devices WHERE device_id = $1';
  const result = await pool.query(query, [device_id]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].last_seen;
}

/**
 * Store APNs device token
 */
export async function setAPNsToken(
  device_id: string,
  apns_token: string
): Promise<void> {
  const query = `
    UPDATE devices
    SET apns_token = $2, last_seen = NOW()
    WHERE device_id = $1
  `;
  await pool.query(query, [device_id, apns_token]);
}

/**
 * Retrieve APNs device token
 */
export async function getAPNsToken(device_id: string): Promise<string | null> {
  const result = await pool.query(
    'SELECT apns_token FROM devices WHERE device_id = $1',
    [device_id]
  );
  return result.rows[0]?.apns_token || null;
}

