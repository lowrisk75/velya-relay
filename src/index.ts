/**
 * Velya Cloud Relay Server
 * WebSocket + REST API relay for iOS ↔ Node-RED/Home Assistant
 */

import uWS from 'uwebsockets.js';
import { config } from './config.js';
import { testConnection, close as closePg } from './db/pg.js';
import { connectRedis, closeRedis } from './db/redis.js';
import { initAPNs, shutdownAPNs } from './apns.js';
import { setupWebSocketRoute, getActiveConnectionCount } from './ws/handler.js';
import { setupCommandRoutes } from './rest/command.js';
import { setupAlarmRoutes } from './rest/alarms.js';
import { setupHelperRoutes } from './rest/helpers.js';
import { setupWebhookRoutes } from './rest/webhooks.js';
import { setupTestWebhookRoute } from './rest/test-webhook.js';
import { setupAPNsTokenRoute } from './rest/apns-token.js';
// Phase 3 auth - TODO: Deploy strategy needed
// import { setupAuthRoutes } from './rest/auth.js';

console.log('🚀 Velya Cloud Relay v1.0.0');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Test database connections
try {
  await testConnection();
  await connectRedis();
  initAPNs(); // Initialize APNs provider
} catch (err: any) {
  console.error('❌ Database connection failed:', err.message);
  console.error('   Make sure PostgreSQL and Redis are running.');
  process.exit(1);
}

const app = uWS.App({});

// Health check endpoint
app.get('/health', (res, _req) => {
  res.writeStatus('200 OK');
  res.writeHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    connections: getActiveConnectionCount(),
  }));
});

// Root endpoint
app.get('/', (res, _req) => {
  res.writeStatus('200 OK');
  res.writeHeader('Content-Type', 'text/plain');
  res.end('Velya Cloud Relay v1.0.0\nhttps://lorislab.fr/velya-cloud-relay.html');
});

// Setup routes
// Phase 3 auth - TODO
// setupAuthRoutes(app);
setupWebSocketRoute(app);
setupCommandRoutes(app);
setupAlarmRoutes(app);
setupHelperRoutes(app);
setupWebhookRoutes(app);
setupTestWebhookRoute(app);
setupAPNsTokenRoute(app);

app.listen(config.port, (token) => {
  if (token) {
    console.log(`✅ Server listening on port ${config.port}`);
    console.log(`🔗 Health: http://localhost:${config.port}/health`);
    console.log(`🔗 Auth: http://localhost:${config.port}/v1/auth/register`);
    console.log(`🔗 WebSocket: ws://localhost:${config.port}/v1/relay`);
    console.log(`🔗 REST API: http://localhost:${config.port}/v1/command`);
    console.log(`🔗 Alarms API: http://localhost:${config.port}/v1/alarms/:device_id`);
    console.log(`🔗 Helpers: http://localhost:${config.port}/v1/helpers/alarm-in`);
    console.log(`🔗 Webhooks: http://localhost:${config.port}/v1/webhooks`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.error(`❌ Failed to listen on port ${config.port}`);
    process.exit(1);
  }
});

// Graceful shutdown
async function shutdown() {
  console.log('📴 Shutting down gracefully...');
  shutdownAPNs();
  await closePg();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
