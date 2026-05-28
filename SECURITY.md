# Security Policy

## Reporting a Vulnerability

**DO NOT open a public issue for security vulnerabilities.**

If you discover a security vulnerability in Velya Cloud Relay, please report it privately:

📧 **Email:** security@lorislab.fr  
🔒 **Subject:** `[SECURITY] Velya Cloud Relay - <brief description>`

### What to Include

Please provide:

1. **Description** — Clear explanation of the vulnerability
2. **Impact** — What an attacker could do (data leak, DoS, privilege escalation, etc.)
3. **Reproduction Steps** — Step-by-step instructions to reproduce the issue
4. **Proof of Concept** — Code, curl commands, or screenshots demonstrating the vulnerability
5. **Affected Versions** — Which versions are affected (if known)
6. **Suggested Fix** — If you have ideas on how to fix it (optional)

### Response Timeline

- **48 hours** — We will acknowledge receipt of your report
- **7 days** — We will provide an initial assessment and timeline for a fix
- **30 days** — We aim to release a patch within 30 days of initial report

### Disclosure Policy

- We follow **coordinated disclosure** — we will work with you to fix the issue before public disclosure
- We will credit you in the security advisory (unless you prefer to remain anonymous)
- We will publish a security advisory once a patch is released

---

## Security Features

Velya Cloud Relay implements the following security controls:

### Authentication & Authorization

- **JWT RS256 Tokens** — 7-day expiry, signed with server secret
- **API Key Auth** — bcrypt-hashed keys (cost factor 12) for Node-RED/external services
- **Device-Scoped Access** — Each device can only access its own alarms
- **APNs Team-Scoped Keys** — Keys are scoped to Apple Developer Team ID

### Network Security

- **TLS/SSL Required** — Production deployments must use HTTPS (enforced by reverse proxy)
- **WebSocket Secure (WSS)** — Encrypted WebSocket connections only
- **CORS Configuration** — Configurable origin restrictions
- **Rate Limiting** — Configurable per-endpoint rate limits (default: 100 req/min)

### Data Protection

- **Encrypted Connections** — All PostgreSQL and Redis connections use TLS in production
- **Secrets Management** — Sensitive values in `.env` files, never in source code
- **APNs Key Protection** — `.p8` keys stored with `chmod 600`, never committed to Git
- **SQL Injection Prevention** — Parameterized queries only (no string concatenation)
- **Input Validation** — Zod schema validation on all API inputs

### Logging & Auditing

- **Audit Log** — All API calls, alarm deliveries, and webhook attempts logged
- **Webhook Verification** — Payload signatures for webhook authenticity (optional)
- **Failed Login Tracking** — Repeated authentication failures logged
- **PostgreSQL Query Logging** — All queries logged in production for forensic analysis

### Container Security

- **Non-Root User** — Docker containers run as non-root user `velya:1000`
- **Read-Only Filesystem** — Application runs with read-only root filesystem
- **No Privileged Mode** — Containers run without elevated privileges
- **Health Checks** — Liveness and readiness probes for automatic recovery
- **Security Scanning** — Docker images scanned with Trivy in CI/CD

---

## Security Best Practices

### Deployment Checklist

Before deploying to production:

- [ ] Use **HTTPS only** — Configure SSL certificates (Let's Encrypt, Cloudflare, etc.)
- [ ] **Firewall Rules** — Restrict access to ports 5432 (PostgreSQL) and 6379 (Redis)
- [ ] **Strong Passwords** — Use 32+ character passwords for `PG_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`
- [ ] **Restrict CORS** — Set `CORS_ORIGIN` to your actual frontend domains (not `*`)
- [ ] **APNs Key Permissions** — `chmod 600 ./keys/AuthKey.p8`
- [ ] **Database Backups** — Automated daily backups with encryption at rest
- [ ] **Update Dependencies** — Run `npm audit fix` regularly
- [ ] **Monitor Logs** — Set up log aggregation (Grafana Loki, Datadog, etc.)
- [ ] **Uptime Monitoring** — Configure alerts for downtime (UptimeRobot, Pingdom, etc.)
- [ ] **Security Headers** — Configure reverse proxy (Nginx/Caddy) with security headers:
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer-when-downgrade" always;
  add_header Content-Security-Policy "default-src 'self'" always;
  ```

### Environment Variable Security

**NEVER commit `.env` files to Git.**

Sensitive variables:
```bash
# Generate strong secrets
JWT_SECRET=$(openssl rand -base64 64)
PG_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
```

Store these in:
- **Docker Secrets** (Swarm mode)
- **Kubernetes Secrets**
- **Railway Environment Variables**
- **HashiCorp Vault**
- **AWS Secrets Manager**

### API Key Management

Node-RED API keys are stored in the `node_red_keys` table:

```sql
-- Create a new API key
INSERT INTO node_red_keys (api_key, description, api_key_hash)
VALUES (
  'velya-prod-2024-abc123',  -- Your key (store this securely!)
  'Production Node-RED Instance',
  crypt('velya-prod-2024-abc123', gen_salt('bf', 12))
);

-- Rotate/revoke a key
DELETE FROM node_red_keys WHERE api_key = 'old-key';
```

**Key Rotation Policy:**
- Rotate API keys every 90 days
- Immediately revoke keys if compromised
- Use separate keys for dev/staging/production
- Never log API keys in plaintext

### Database Security

PostgreSQL hardening:

```bash
# Restrict network access
# In docker-compose.yml, do NOT expose port 5432 externally
# Application connects via internal Docker network only

# Enable SSL connections (production)
PG_SSLMODE=require

# Regular backups
0 2 * * * /path/to/velya-relay/scripts/backup.sh
```

### Redis Security

Redis hardening:

```bash
# Require password (set in .env)
REDIS_PASSWORD=strong-password-here

# Disable dangerous commands
docker exec redis_container redis-cli CONFIG SET rename-command FLUSHDB ""
docker exec redis_container redis-cli CONFIG SET rename-command FLUSHALL ""
docker exec redis_container redis-cli CONFIG SET rename-command CONFIG ""

# Regular persistence
docker exec redis_container redis-cli BGSAVE
```

### APNs Key Security

Apple Push Notification Service keys are **irreplaceable** — if leaked, you must:

1. Revoke the key in Apple Developer Portal
2. Generate a new key
3. Update `APNS_KEY_ID` in `.env`
4. Replace `./keys/AuthKey.p8`
5. Restart the server

**Protection:**
- Store with `chmod 600` (read-only for owner)
- Never commit to Git (`.gitignore` already includes `keys/`)
- Use separate keys for dev/production (if possible)
- Rotate keys annually (best practice)

---

## Threat Model

### Attack Vectors

| Threat | Mitigation |
|--------|-----------|
| **SQL Injection** | Parameterized queries only (pg driver) |
| **XSS** | No HTML rendering; API-only server |
| **CSRF** | JWT tokens in `Authorization` header (not cookies) |
| **Replay Attacks** | JWT expiration (7 days); nonce support (future) |
| **DoS** | Rate limiting, request size limits, connection limits |
| **Man-in-the-Middle** | HTTPS/WSS only in production |
| **Credential Stuffing** | bcrypt with cost factor 12; future: 2FA support |
| **Privilege Escalation** | Device-scoped queries; no admin endpoints yet |
| **Container Escape** | Non-root user, no privileged mode, AppArmor/SELinux |

### Trusted Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  iOS App (Trusted)                                          │
│  - Connects via WSS with JWT                                │
│  - Receives APNs Silent Push                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Velya Relay (Trust Boundary)                               │
│  - Validates JWT                                            │
│  - Enforces device-scoped access                            │
│  - Rate limits requests                                     │
└─────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
┌─────────────────────┐   ┌─────────────────────┐
│  PostgreSQL         │   │  Redis              │
│  (Untrusted)        │   │  (Untrusted)        │
│  - Requires auth    │   │  - Requires auth    │
│  - No direct access │   │  - Pub/sub only     │
└─────────────────────┘   └─────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Node-RED / External Services (Semi-Trusted)                │
│  - API key authentication                                   │
│  - Cannot read other devices' data                          │
│  - Webhook callbacks (outbound only)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Known Limitations

Current security constraints:

1. **No Multi-Tenancy** — Single-user deployment model; each instance serves one user
2. **No 2FA** — Device authentication is JWT-only (future: TOTP support)
3. **No Webhook Signature** — Webhook payloads not signed (future: HMAC-SHA256)
4. **No IP Whitelist** — API keys work from any IP (future: IP restriction support)
5. **No OAuth** — No third-party identity provider integration (future: Apple Sign In)

---

## Security Updates

We monitor dependencies for vulnerabilities:

```bash
# Check for known vulnerabilities
npm audit

# Auto-fix (where possible)
npm audit fix

# Update all dependencies
npm update
```

GitHub Dependabot is enabled for automatic security updates.

---

## Compliance

### GDPR Considerations

If deploying in the EU or handling EU users' data:

- **Data Minimization** — Velya stores only: device IDs, alarm times, and delivery logs
- **Right to Deletion** — Provide `/v1/user/delete` endpoint (future) to purge all user data
- **Data Portability** — Users can export their data via API
- **Encryption at Rest** — Use encrypted storage for PostgreSQL volumes
- **Privacy Policy** — Update your privacy policy to mention Velya relay usage

### COPPA (Children's Privacy)

If your iOS app targets children under 13:

- **Parental Consent** — Required before device registration
- **No Tracking** — Velya does not track users; it only stores alarm metadata
- **Age Gate** — Implement age verification in your iOS app (not in Relay)

---

## Contact

For security issues: **security@lorislab.fr**  
For general support: **support@lorislab.fr**  
GitHub Security Advisories: https://github.com/lorislab/velya-relay/security/advisories

---

**Last Updated:** 2026-05-28
