/**
 * Multi-Device Sync
 * Synchronize alarm changes across all devices of the same user
 */

import { getActiveDevices, sendToDevice } from './handler.js';
import { pool } from '../db/pg.js';

/**
 * Get all devices for a user
 */
export async function getUserDevices(user_id: string): Promise<string[]> {
  const query = 'SELECT device_id FROM devices WHERE user_id = $1';
  const result = await pool.query(query, [user_id]);
  return result.rows.map(row => row.device_id);
}

/**
 * Send message to all OTHER devices of the same user (excluding sender)
 */
export async function sendToOtherDevices(
  user_id: string,
  sender_device_id: string,
  message: any
): Promise<void> {
  try {
    // Get all devices for this user
    const userDevices = await getUserDevices(user_id);

    // Filter out sender and offline devices
    const activeDevices = getActiveDevices();
    const targets = userDevices.filter(
      device_id => device_id !== sender_device_id && activeDevices.includes(device_id)
    );

    if (targets.length === 0) {
      console.log(`📱 No other devices online for user ${user_id}`);
      return;
    }

    console.log(`📱 Syncing to ${targets.length} other device(s) for user ${user_id}`);

    // Send to all targets
    for (const device_id of targets) {
      const sent = sendToDevice(device_id, message);
      if (sent) {
        console.log(`  ✅ Synced to ${device_id}`);
      } else {
        console.log(`  ⚠️  Failed to sync to ${device_id}`);
      }
    }
  } catch (err: any) {
    console.error(`❌ Error sending to other devices: ${err.message}`);
  }
}

/**
 * Broadcast alarm change to all devices of a user
 */
export async function broadcastAlarmChange(
  user_id: string,
  event_type: 'alarm_set' | 'alarm_cancelled',
  alarm_data: any
): Promise<void> {
  // Get all active devices for this user
  const userDevices = await getUserDevices(user_id);
  const activeDevices = getActiveDevices();
  const targets = userDevices.filter(device_id => activeDevices.includes(device_id));

  if (targets.length === 0) {
    console.log(`📱 No devices online for user ${user_id} - will sync on next connect`);
    return;
  }

  console.log(`📱 Broadcasting ${event_type} to ${targets.length} device(s)`);

  const message = {
    type: 'alarm_change_sync',
    event: event_type,
    alarm: alarm_data,
  };

  for (const device_id of targets) {
    sendToDevice(device_id, message);
  }
}
