# Velya Cloud Relay - Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- Domain name with DNS pointing to your server
- Apple Developer account ($99/year) for APNs key
- SSL certificate (Let's Encrypt recommended)

## Step-by-Step Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Verify
docker --version
docker compose version
```

### 2. Clone & Configure

```bash
# Clone repository
git clone https://github.com/lorislab/velya-relay
cd velya-relay

# Copy environment template
cp .env.example .env

# Generate secure passwords
PG_PASS=$(openssl rand -base64 32)
REDIS_PASS=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)

# Edit .env
nano .env
```

**Required values**:
```bash
PG_PASSWORD=$PG_PASS
REDIS_PASSWORD=$REDIS_PASS
JWT_SECRET=$JWT_SECRET
APNS_KEY_ID=YOUR_KEY_ID        # From Apple Developer
APNS_TEAM_ID=YOUR_TEAM_ID      # From Apple Developer
APNS_BUNDLE_ID=com.lorislab.velya  # Or your bundle ID
APNS_PRODUCTION=false          # true for production APNs
```

### 3. APNs Key Setup

#### Get APNs Key from Apple

1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click **+** to create new key
3. Enable **Apple Push Notifications service (APNs)**
4. Click **Continue** → **Register**
5. Download `.p8` file
6. Note **Key ID** and **Team ID**

#### Add Key to Server

```bash
# Create keys directory
mkdir -p keys
chmod 700 keys

# Copy your downloaded key
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 keys/AuthKey.p8
chmod 600 keys/AuthKey.p8

# Verify
ls -lh keys/
# Should show: -rw------- 1 user user 248 May 28 08:00 AuthKey.p8
```

### 4. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot

# Get certificate (standalone mode - port 80 must be free)
sudo certbot certonly --standalone -d velya.yourdomain.com

# Certificates will be in:
# /etc/letsencrypt/live/velya.yourdomain.com/
```

### 5. Reverse Proxy (Nginx)

```bash
# Install Nginx
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/velya
```

**Nginx config**:
```nginx
upstream velya_backend {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name velya.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name velya.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/velya.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velya.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    location / {
        proxy_pass http://velya_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

**Enable & restart**:
```bash
sudo ln -s /etc/nginx/sites-available/velya /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Start Velya Relay

```bash
# Build and start
docker compose up -d

# Check status
docker compose ps

# Expected output:
# NAME              IMAGE                        STATUS
# velya-postgres    postgres:16-alpine           Up (healthy)
# velya-redis       redis:7-alpine               Up (healthy)
# velya-relay       lorislab/velya-relay:latest  Up (healthy)

# View logs
docker compose logs -f relay

# Should see:
# ✅ PostgreSQL connected
# ✅ Redis connected
# ✅ APNs provider initialized (Sandbox)
# ✅ Server listening on port 8080
```

### 7. Verify Deployment

```bash
# Health check
curl https://velya.yourdomain.com/health

# Expected response:
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-05-28T08:00:00.000Z",
  "connections": 0
}

# WebSocket test (install wscat: npm install -g wscat)
wscat -c wss://velya.yourdomain.com/v1/relay?token=test
# Should connect (then disconnect due to invalid token - normal)
```

### 8. Configure iOS App

1. Open Velya on iPhone
2. **Settings** → **Server Configuration**
3. Enable **Use Custom Server**
4. Enter: `https://velya.yourdomain.com`
5. **Save & Reconnect**

### 9. Test End-to-End

**Generate Node-RED API key**:
```bash
docker compose exec relay node -e "
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const apiKey = 'velya-nodered-' + crypto.randomBytes(32).toString('base64url');
console.log('API Key:', apiKey);
bcrypt.hash(apiKey, 12).then(hash => console.log('Hash:', hash));
"
```

**Insert into database**:
```bash
docker compose exec postgres psql -U velya_app -d velya_relay -c "
INSERT INTO node_red_keys (user_id, key_hash, scopes) 
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '\$2b\$12\$HASH_FROM_ABOVE',
  '{command:send,device:read}'
);
"
```

**Send test alarm**:
```bash
curl -X POST https://velya.yourdomain.com/v1/command \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "YOUR_DEVICE_ID",
    "request_id": "'$(uuidgen)'",
    "command": "alarm.set",
    "payload": {
      "hour": 15,
      "minute": 30,
      "label": "Test from server"
    }
  }'
```

Check iPhone → alarm should appear at 15:30.

## Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f relay
docker compose logs -f postgres
docker compose logs -f redis
```

### Restart Services

```bash
# Restart relay only
docker compose restart relay

# Restart all
docker compose restart

# Full rebuild
docker compose down
docker compose up -d --build
```

### Backup Database

```bash
# Backup
docker compose exec postgres pg_dump -U velya_app velya_relay > backup-$(date +%Y%m%d).sql

# Restore
cat backup-20260528.sql | docker compose exec -T postgres psql -U velya_app velya_relay
```

### Update Velya Relay

```bash
# Pull latest code
git pull

# Rebuild image
docker compose build relay

# Restart
docker compose up -d relay
```

### Monitor Resources

```bash
# Resource usage
docker stats

# Disk usage
docker system df

# Clean up old images
docker system prune -a
```

## Troubleshooting

### APNs Push Not Working

**Check token registered**:
```bash
docker compose exec postgres psql -U velya_app -d velya_relay -c "
SELECT device_id, substring(apns_token, 1, 16) as token_preview, last_seen 
FROM devices;
"
```

**Check APNs endpoint**:
```bash
# Sandbox (development)
APNS_PRODUCTION=false → api.sandbox.push.apple.com

# Production
APNS_PRODUCTION=true → api.push.apple.com
```

**Test APNs manually**:
```bash
# Inside relay container
docker compose exec relay node -e "
const apn = require('@parse/node-apn');
const provider = new apn.Provider({
  token: {
    key: require('fs').readFileSync('/app/keys/AuthKey.p8'),
    keyId: process.env.APNS_KEY_ID,
    teamId: process.env.APNS_TEAM_ID
  },
  production: process.env.APNS_PRODUCTION === 'true'
});

const notification = new apn.Notification();
notification.topic = process.env.APNS_BUNDLE_ID;
notification.contentAvailable = 1;
notification.payload = { command: 'test' };

provider.send(notification, 'YOUR_DEVICE_TOKEN').then(result => {
  console.log('Result:', JSON.stringify(result, null, 2));
  provider.shutdown();
});
"
```

### WebSocket Won't Connect

**Check Nginx WebSocket config**:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

**Check firewall**:
```bash
# Ubuntu UFW
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check if port is listening
sudo netstat -tlnp | grep 8080
```

### High Memory Usage

**Limit Docker containers**:
```yaml
# docker-compose.yml
services:
  relay:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

**Check Redis memory**:
```bash
docker compose exec redis redis-cli --pass $REDIS_PASSWORD INFO memory
```

## Security Hardening

### Firewall

```bash
# Allow only HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2Ban

```bash
# Install
sudo apt install fail2ban

# Configure for Nginx
sudo nano /etc/fail2ban/jail.local
```

```ini
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-badbots]
enabled = true
port = http,https
logpath = /var/log/nginx/access.log
maxretry = 2
```

### Auto-Updates

```bash
# Unattended upgrades
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### SSL Auto-Renewal

```bash
# Certbot auto-renews via systemd timer
sudo systemctl status certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

## Production Checklist

- [ ] Server OS updated
- [ ] Docker & Docker Compose installed
- [ ] Domain DNS configured
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] Nginx reverse proxy configured
- [ ] APNs key from Apple Developer
- [ ] `.env` configured with secure passwords
- [ ] `keys/AuthKey.p8` present and secure (chmod 600)
- [ ] Docker services healthy (`docker compose ps`)
- [ ] Health endpoint responds (`/health`)
- [ ] WebSocket connects (`wscat`)
- [ ] iOS app configured with custom server
- [ ] Test alarm sent successfully
- [ ] Firewall configured (UFW/iptables)
- [ ] Fail2Ban configured
- [ ] SSL auto-renewal tested
- [ ] Database backup scheduled
- [ ] Monitoring setup (optional: Prometheus/Grafana)

## Cost Estimate

**VPS Options**:
- DigitalOcean Droplet: $6/month (1GB RAM, 25GB SSD)
- Hetzner Cloud: €4.51/month (2GB RAM, 40GB SSD)
- Railway: ~$5/month (usage-based)
- Oracle Cloud: FREE tier (1GB RAM, limited)

**Additional**:
- Domain name: ~$12/year
- Apple Developer: $99/year (for APNs keys)

**Total**: ~$70-100/year for fully self-hosted

---

## Support

Questions? Open an issue: https://github.com/lorislab/velya-relay/issues
