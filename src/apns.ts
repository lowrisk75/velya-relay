/**
 * APNs Service - Silent Push Notifications
 * Sends silent push to wake iOS app when command is queued
 */

import apn from '@parse/node-apn';
import fs from 'fs';

interface APNsConfig {
  keyId: string;
  teamId: string;
  keyPath: string;
  bundleId: string;
  production: boolean;
}

let apnsProvider: apn.Provider | null = null;

/**
 * Initialize APNs provider from environment variables
 */
export function initAPNs(): void {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyPath = process.env.APNS_KEY_PATH;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const production = process.env.APNS_PRODUCTION === 'true';

  if (!keyId || !teamId || !keyPath || !bundleId) {
    console.warn('⚠️  APNs not configured - silent push disabled');
    console.warn('   Missing: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_PATH, or APNS_BUNDLE_ID');
    return;
  }

  if (!fs.existsSync(keyPath)) {
    console.error(`❌ APNs key file not found: ${keyPath}`);
    return;
  }

  try {
    apnsProvider = new apn.Provider({
      token: {
        key: keyPath,
        keyId: keyId,
        teamId: teamId,
      },
      production: production,
    });

    console.log(`✅ APNs provider initialized (${production ? 'Production' : 'Sandbox'})`);
    console.log(`   Bundle ID: ${bundleId}`);
    console.log(`   Key ID: ${keyId}`);
  } catch (err: any) {
    console.error(`❌ Failed to initialize APNs provider: ${err.message}`);
  }
}

/**
 * Send silent push notification to device
 * @param deviceToken - APNs device token (hex string)
 * @param payload - Custom data to include in notification
 */
export async function sendSilentPush(
  deviceToken: string,
  payload: Record<string, any>
): Promise<boolean> {
  if (!apnsProvider) {
    console.warn('⚠️  APNs provider not initialized - skipping silent push');
    return false;
  }

  const bundleId = process.env.APNS_BUNDLE_ID!;

  const notification = new apn.Notification({
    topic: bundleId,
    contentAvailable: true, // Silent push flag
    pushType: 'background',
    priority: 5, // Normal priority (10 = high, 5 = normal)
    payload: payload,
  });

  try {
    console.log(`📲 Sending silent push to ${deviceToken.substring(0, 16)}...`);
    const result = await apnsProvider.send(notification, deviceToken);

    if (result.failed && result.failed.length > 0) {
      const failure = result.failed[0];
      console.error(`❌ APNs push failed: ${failure.status} - ${failure.response?.reason || 'unknown'}`);
      return false;
    }

    console.log(`✅ Silent push sent successfully`);
    return true;
  } catch (err: any) {
    console.error(`❌ Error sending silent push: ${err.message}`);
    return false;
  }
}

/**
 * Shutdown APNs provider gracefully
 */
export function shutdownAPNs(): void {
  if (apnsProvider) {
    apnsProvider.shutdown();
    console.log('📴 APNs provider shut down');
  }
}
