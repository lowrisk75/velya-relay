# Velya Cloud Relay

Open-source WebSocket relay server for Velya smart alarms.

## Features

- ✅ **APNs Silent Push** - Create alarms even when iPhone is locked
- ✅ **WebSocket Bidirectional Control** - Real-time command/response
- ✅ **Node-RED / Home Assistant Integration** - REST API for automation
- ✅ **Multi-Device Sync** - CloudKit + WebSocket event broadcasting
- ✅ **Webhook Callbacks** - POST events to external services
- ✅ **Self-Hosted** - Full control of your data

## Quick Start (Docker)

### 1. Clone the repository

```bash
git clone https://github.com/lorislab/velya-relay
cd velya-relay
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env  # Edit with your values
```

**Required** :
- `APNS_KEY_ID` / `APNS_TEAM_ID` - Get from [Apple Developer](https://developer.apple.com/account/resources/authkeys/list)
- `PG_PASSWORD` / `REDIS_PASSWORD` - Generate secure passwords
- `JWT_SECRET` - Generate with `openssl rand -base64 64`

### 3. Add APNs key

Download your APNs authentication key (.p8 file) from Apple Developer Portal and place it in `./keys/`:

```bash
mkdir -p keys
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 keys/AuthKey.p8
chmod 600 keys/AuthKey.p8
```

### 4. Start the stack

```bash
docker-compose up -d
```

### 5. Verify health

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-05-28T08:00:00.000Z",
  "connections": 0
}
```

## iOS App Configuration

1. Open **Velya** app on your iPhone
2. Go to **Settings** → **Server Configuration**
3. Enable **Use Custom Server**
4. Enter your server URL: `https://velya.yourdomain.com`
5. Tap **Save & Reconnect**

## Architecture

```
┌─────────────────┐
│  iPhone (Velya) │
│                 │
│  - APNs silent  │
│    push wake-up │
│  - WebSocket    │
│    persistent   │
└────────┬────────┘
         │
         │ wss://
         │
         ▼
┌─────────────────────────────┐
│ Velya Cloud Relay (Docker)  │
│                             │
│  ┌──────────┐  ┌─────────┐ │
│  │PostgreSQL│  │  Redis  │ │
│  └──────────┘  └─────────┘ │
│                             │
│  - WebSocket server         │
│  - REST API                 │
│  - APNs sender              │
└────────┬────────────────────┘
         │
         │ HTTP REST API
         │
         ▼
┌─────────────────────────────┐
│ Automation (Node-RED, HA)   │
│                             │
│  - Calendar integration     │
│  - Smart home triggers      │
│  - Custom logic             │
└─────────────────────────────┘
```

## API Endpoints

### REST API

```bash
# Send alarm command
POST /v1/command
Authorization: Bearer <api-key>
{
  "device_id": "uuid",
  "request_id": "uuid",
  "command": "alarm.set",
  "payload": {
    "hour": 7,
    "minute": 30,
    "label": "Wake up",
    "repeat_days": [1, 2, 3, 4, 5]
  }
}

# List alarms for a device
GET /v1/alarms/:device_id
Authorization: Bearer <api-key>

# Register APNs token (called by iOS app)
PUT /v1/devices/:device_id/apns-token
Authorization: Bearer <jwt>
{
  "apns_token": "hex-string"
}
```

### WebSocket

```javascript
// Connect (iOS app)
wss://your-server.com/v1/relay?token=<jwt>

// Send messages
{
  "type": "fetch_pending",
  "device_id": "uuid"
}

{
  "type": "ack",
  "request_id": "uuid",
  "message_id": "redis-stream-id",
  "status": "ok"
}

{
  "type": "alarm_fired",
  "alarm_id": "uuid",
  "timestamp": "2026-05-28T07:30:00Z"
}
```

## APNs Setup

### Team Scoped Key (Recommended)

One key works for all apps under your Team ID:

1. Go to [Apple Developer Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Create new key → **Apple Push Notifications service (APNs)**
3. Enable **Apple Push Notifications service**
4. Download `.p8` file
5. Note the **Key ID** and **Team ID**

### App-Specific Key

One key per bundle ID:

1. Same process but select specific App ID
2. Must match `APNS_BUNDLE_ID` in `.env`

## Production Deployment

### With Reverse Proxy (Nginx)

```nginx
upstream velya {
    server localhost:8080;
}

server {
    listen 443 ssl http2;
    server_name velya.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/velya.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velya.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://velya;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Railway One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/velya-relay)

### Environment Variables for Production

```bash
APNS_PRODUCTION=true  # Use production APNs endpoint
```

## Node-RED Integration Example

```json
[
  {
    "id": "alarm-flow",
    "type": "inject",
    "name": "Daily 7AM",
    "crontab": "00 07 * * *",
    "wires": [["create-alarm"]]
  },
  {
    "id": "create-alarm",
    "type": "http request",
    "method": "POST",
    "url": "https://velya.yourdomain.com/v1/command",
    "headers": {
      "Authorization": "Bearer YOUR_API_KEY",
      "Content-Type": "application/json"
    },
    "payload": "{\"device_id\":\"YOUR_DEVICE_ID\",\"request_id\":\"{{timestamp}}\",\"command\":\"alarm.set\",\"payload\":{\"hour\":7,\"minute\":0,\"label\":\"Good morning\"}}",
    "wires": [["debug"]]
  }
]
```

## Troubleshooting

### Container won't start

```bash
docker-compose logs relay
```

Common issues:
- Missing APNs key file in `./keys/`
- Invalid `APNS_KEY_ID` or `APNS_TEAM_ID`
- PostgreSQL/Redis not healthy (check `docker-compose ps`)

### iPhone won't connect

1. Check server health: `curl https://your-server.com/health`
2. Check WebSocket: `wscat -c wss://your-server.com/v1/relay?token=test`
3. Check logs: `docker-compose logs -f relay`
4. Verify JWT is not expired (default: 7 days)

### Silent push not working

1. Verify APNs token registered:
   ```bash
   docker-compose exec postgres psql -U velya_app -d velya_relay -c "SELECT device_id, apns_token FROM devices;"
   ```
2. Check APNs endpoint (sandbox vs production)
3. Verify bundle ID matches iOS app
4. Check iOS Capabilities: Background Modes → Remote notifications

## Security

- Always use HTTPS/WSS in production
- Keep APNs `.p8` key secure (never commit to Git)
- Rotate JWT secret regularly
- Use strong PostgreSQL/Redis passwords
- Limit PostgreSQL/Redis to internal network only
- Enable firewall rules (Docker network bridge)

## License

UNLICENSED (Private use only for now)

Future: Will be open-sourced under MIT or AGPLv3

## Support

- Documentation: [docs.velya.app](https://docs.velya.app)
- Issues: [GitHub Issues](https://github.com/lorislab/velya-relay/issues)
- Email: support@lorislab.fr

## Roadmap

- [ ] Public cloud service (relay.velya.app)
- [ ] User registration/authentication
- [ ] Pro tier (webhooks, multi-device sync)
- [ ] Terraform/Kubernetes deployment
- [ ] Prometheus metrics
- [ ] Rate limiting per user tier
