# Velya Cloud Relay — Deployment Status

## ✅ Completed (Automated)

### 1. GitHub Repository Created
- **URL**: https://github.com/lowrisk75/velya-relay
- **Status**: Public ✅
- **Commits**: 5 commits pushed
- **Release**: v1.0.0 created
- **Topics**: 13 tags added (ios, swift, nodejs, typescript, websocket, apns, docker, node-red, home-automation, alarm, push-notifications, self-hosted, relay-server)

### 2. GitHub Pages Enabled
- **URL**: https://lowrisk75.github.io/velya-relay
- **Status**: Building (2-3 minutes)
- **Source**: `main` branch, `/docs` folder
- **Content**: Apple-inspired landing page with feature grid

### 3. GitHub Actions Workflows
- **Tests Workflow** (`.github/workflows/test.yml`):
  - ⏳ Running (PostgreSQL + Redis services, lint, build, tests)
  - Last run: in progress
  
- **Docker Build Workflow** (`.github/workflows/docker-publish.yml`):
  - ❌ Failed (expected — Docker Hub secrets not configured yet)
  - Error: "Username and password required"

### 4. Git Repository Structure
```
/tmp/velya-relay-docker/
├── .github/
│   ├── ISSUE_TEMPLATE/ (bug report, feature request)
│   ├── pull_request_template.md
│   └── workflows/ (test.yml, docker-publish.yml)
├── docs/
│   └── index.html (landing page)
├── node-red-flows/
│   └── velya-automation-example.json
├── scripts/
│   ├── backup.sh
│   ├── health-check.sh
│   └── migrate-from-existing.sh
├── src/ (15 TypeScript files)
├── CHANGELOG.md
├── CONTRIBUTING.md
├── DEPLOYMENT.md
├── README.md
├── SECURITY.md
├── LICENSE (MIT)
├── Dockerfile
├── docker-compose.yml
├── init-db.sql
├── package.json
├── package-lock.json ← Added for CI/CD
└── railway.json + railway.toml
```

---

## ⏳ Pending (Manual Steps Required)

### 1. Configure GitHub Secrets (5 min)

**Why**: Docker Hub auto-publishing requires authentication.

**Steps**:
1. Go to: https://github.com/lowrisk75/velya-relay/settings/secrets/actions
2. Click **New repository secret**
3. Add two secrets:

| Name | Value | Where to Get |
|------|-------|--------------|
| `DOCKER_USERNAME` | `lorislab` (or your Docker Hub username) | https://hub.docker.com/settings/general |
| `DOCKER_TOKEN` | Generate new token | https://hub.docker.com/settings/security → **New Access Token** |

**Docker Hub Token Settings**:
- Description: `GitHub Actions - Velya Relay`
- Access permissions: **Read, Write, Delete** ✅

**Verification**:
- Once secrets are added, GitHub Actions will auto-build on next push
- Or manually re-run failed workflow: https://github.com/lowrisk75/velya-relay/actions/runs/26559860265

---

### 2. Transfer Repository to `lorislab` Organization (Optional)

**Current**: `lowrisk75/velya-relay`  
**Target**: `lorislab/velya-relay`

**Why**: Better branding + matches `lorislab/velya-relay` Docker Hub namespace.

**Steps**:
1. Go to: https://github.com/lowrisk75/velya-relay/settings
2. Scroll to **Danger Zone**
3. Click **Transfer ownership**
4. Enter: `lorislab`
5. Confirm transfer

**After transfer**:
- Update all URLs in documentation (README.md, DEPLOYMENT.md, etc.)
- GitHub Pages will auto-migrate to `lorislab.github.io/velya-relay`
- Redirects from old URL (`lowrisk75`) are automatic for 1 year

---

### 3. Deploy to Railway (15 min)

**URL**: https://railway.app/new

**Steps**:
1. **Connect GitHub**: Import `lowrisk75/velya-relay` (or `lorislab/velya-relay` after transfer)
2. **Add Services**:
   - PostgreSQL (Railway managed)
   - Redis (Railway managed)
   - Web service (automatically detected from `railway.json`)
3. **Configure Environment Variables** (14 required):
   ```bash
   # Server
   PORT=8080
   NODE_ENV=production
   
   # PostgreSQL (auto-filled by Railway)
   PG_HOST=${{Postgres.PGHOST}}
   PG_PORT=${{Postgres.PGPORT}}
   PG_DATABASE=${{Postgres.PGDATABASE}}
   PG_USER=${{Postgres.PGUSER}}
   PG_PASSWORD=${{Postgres.PGPASSWORD}}
   
   # Redis (auto-filled by Railway)
   REDIS_HOST=${{Redis.REDIS_PRIVATE_URL}}
   REDIS_PORT=6379
   REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}
   
   # APNs (from Bitwarden or Apple Developer Portal)
   APNS_KEY_ID=YOUR_KEY_ID
   APNS_TEAM_ID=YOUR_TEAM_ID
   APNS_BUNDLE_ID=com.lorislab.velya
   APNS_PRODUCTION=false
   
   # JWT Secret (generate new)
   JWT_SECRET=$(openssl rand -base64 64)
   ```
4. **Upload APNs Key**:
   - Railway doesn't support file uploads directly
   - **Option A**: Base64 encode and store in env var:
     ```bash
     APNS_KEY_BASE64=$(base64 < keys/AuthKey.p8)
     # Then decode in code: Buffer.from(process.env.APNS_KEY_BASE64, 'base64')
     ```
   - **Option B**: Mount volume and upload via CLI
5. **Deploy**: Railway will auto-deploy on push to `main`
6. **Custom Domain** (optional):
   - Add `relay.velya.app` or `relay.lorislab.fr`
   - Railway provides auto-SSL with Let's Encrypt

**Default URL**: `velya-relay.up.railway.app` (or similar Railway subdomain)

---

### 4. Update iOS App Default Server URL (3 min)

**File**: `/Users/kevinnadjarian/GitHub/Velya/Packages/AlarmCore/Sources/AlarmCore/Network/CloudRelayService.swift`

**Current** (line 42):
```swift
self.serverBaseURL = serverURL ?? "https://relay2.lorislab.fr"
```

**New** (after Railway deployment):
```swift
// Option A: Railway default domain
self.serverBaseURL = serverURL ?? "https://velya-relay.up.railway.app"

// Option B: Custom domain
self.serverBaseURL = serverURL ?? "https://relay.velya.app"

// Option C: Keep old server as fallback for existing users
self.serverBaseURL = serverURL ?? "https://relay2.lorislab.fr"
```

**Recommendation**: Keep `relay2.lorislab.fr` for now (no breaking change), announce new public server via App Store update notes.

---

### 5. Verify Everything (10 min)

Once Railway is deployed and Docker Hub secrets are configured:

#### GitHub Pages
```bash
curl -I https://lowrisk75.github.io/velya-relay
# Expected: 200 OK
```

#### GitHub Actions
- Tests: https://github.com/lowrisk75/velya-relay/actions/workflows/test.yml
- Docker Build: https://github.com/lowrisk75/velya-relay/actions/workflows/docker-publish.yml
- Both should show ✅ green after secrets are added

#### Docker Hub
```bash
docker pull lorislab/velya-relay:latest
docker pull lorislab/velya-relay:v1.0.0
docker images | grep velya-relay
```

#### Railway Health Check
```bash
curl https://velya-relay.up.railway.app/health
# Expected: {"status":"healthy","postgres":true,"redis":true}
```

#### iOS App Test
1. Open Velya app → Settings → Server Configuration
2. Toggle "Use Custom Server"
3. Enter Railway URL: `https://velya-relay.up.railway.app`
4. Test Connection → Should show ✅
5. Create alarm from Node-RED → Should deliver via WebSocket or APNs

---

## 📊 Current Status Summary

| Component | Status | Action Required |
|-----------|--------|-----------------|
| GitHub Repository | ✅ Created & Pushed | None |
| GitHub Release v1.0.0 | ✅ Published | None |
| GitHub Pages | ⏳ Building | Wait 2-3 minutes |
| GitHub Actions (Tests) | ⏳ Running | Wait for completion |
| GitHub Actions (Docker) | ❌ Failed | Add DOCKER_USERNAME + DOCKER_TOKEN secrets |
| Docker Hub Image | ❌ Not Published | Fix after secrets added |
| Railway Deployment | ⏸️ Not Started | Manual deployment (15 min) |
| iOS App Update | ⏸️ Not Started | Update server URL after Railway deployed |

---

## 🎯 Next Immediate Steps (Priority Order)

1. ✅ **Wait for GitHub Actions Tests** (2 min)
   - Check: https://github.com/lowrisk75/velya-relay/actions
   
2. **Add GitHub Secrets** (2 min)
   - DOCKER_USERNAME
   - DOCKER_TOKEN
   
3. **Re-run Docker Build Workflow** (5 min)
   - Or wait for next push (auto-triggers)
   
4. **Deploy to Railway** (15 min)
   - Follow steps in section 3 above
   
5. **Update iOS App** (3 min)
   - Change default server URL to Railway domain
   
6. **Test End-to-End** (10 min)
   - iPhone → Settings → Custom server → Test
   - Node-RED → Create alarm → Verify delivery

---

## 📝 Notes

- **Repository ownership**: Currently under `lowrisk75`, can transfer to `lorislab` later
- **Docker Hub namespace**: Should match GitHub org (`lorislab/velya-relay`)
- **APNs keys**: Never commit to Git, store in Railway env vars (base64 encoded)
- **Breaking changes**: None — existing users on `relay2.lorislab.fr` continue working
- **Migration path**: Optional — users can switch to self-hosted via Settings → Server Configuration

---

**Last Updated**: 2026-05-28 (automated deployment)
