/**
 * Alarm Event Handler
 * Handles alarm_fired, alarm_snoozed, alarm_dismissed messages from iPhone
 */

import type { WebSocket } from 'uwebsockets.js';
import { createAlarmEvent, snoozeAlarm, clearSnooze } from '../db/alarmEvents.js';
import { getAlarm } from '../db/alarms.js';
import { dispatchWebhookEvent, createAlarmEventPayload } from '../webhooks/dispatcher.js';
import { sendToOtherDevices } from './multiDevice.js';

interface WebSocketUserData {
  userId: string;
  deviceId: string;
  connectedAt: number;
  lastPing: number;
  isAlive: boolean;
}

type AlarmEventMessage =
  | { type: 'alarm_fired'; alarm_id: string; timestamp: string }
  | { type: 'alarm_snoozed'; alarm_id: string; snooze_until: string; timestamp: string }
  | { type: 'alarm_dismissed'; alarm_id: string; timestamp: string };

/**
 * Handle alarm event from iPhone
 */
export async function handleAlarmEvent(
  ws: WebSocket<WebSocketUserData>,
  message: AlarmEventMessage
): Promise<void> {
  const { userId, deviceId } = ws.getUserData();

  console.log(`🔔 Received ${message.type}: alarm=${message.alarm_id} device=${deviceId}`);

  try {
    // Verify alarm exists
    const alarm = await getAlarm(message.alarm_id);
    if (!alarm) {
      console.error(`❌ Alarm not found: ${message.alarm_id}`);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Alarm not found',
      }), false);
      return;
    }

    // Record event in database
    const timestamp = new Date(message.timestamp);
    const event = await createAlarmEvent({
      alarm_id: message.alarm_id,
      device_id: deviceId,
      user_id: userId,
      event_type: message.type === 'alarm_fired' ? 'fired' :
                  message.type === 'alarm_snoozed' ? 'snoozed' : 'dismissed',
      timestamp,
      snooze_until: message.type === 'alarm_snoozed' ? new Date(message.snooze_until) : undefined,
    });

    console.log(`💾 Event recorded: ${event.event_id}`);

    // Update alarm state if needed
    if (message.type === 'alarm_snoozed') {
      await snoozeAlarm(message.alarm_id, new Date(message.snooze_until));
      console.log(`⏰ Alarm snoozed until: ${message.snooze_until}`);
    } else if (message.type === 'alarm_dismissed') {
      await clearSnooze(message.alarm_id);
      console.log(`✅ Alarm dismissed: ${message.alarm_id}`);
    }

    // Send ACK to iPhone
    ws.send(JSON.stringify({
      type: 'event_ack',
      event_type: message.type,
      alarm_id: message.alarm_id,
      event_id: event.event_id,
    }), false);

    // Multi-device sync: notify other devices of same user
    await sendToOtherDevices(userId, deviceId, {
      type: 'alarm_event_sync',
      event_type: message.type,
      alarm_id: message.alarm_id,
      timestamp: message.timestamp,
      snooze_until: message.type === 'alarm_snoozed' ? message.snooze_until : undefined,
    });

    // Dispatch to webhooks (Node-RED, etc.)
    const payload = createAlarmEventPayload(
      message.type,
      deviceId,
      userId,
      message.alarm_id,
      timestamp,
      message.type === 'alarm_snoozed' ? { snooze_until: message.snooze_until } : undefined
    );

    await dispatchWebhookEvent(userId, message.type, payload);

  } catch (err: any) {
    console.error(`❌ Error handling ${message.type}:`, err);
    ws.send(JSON.stringify({
      type: 'error',
      error: err.message || 'Internal server error',
    }), false);
  }
}
