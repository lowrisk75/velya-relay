# GitHub Repository Setup Guide

Since automatic repository creation failed due to permissions, follow these manual steps:

## 1. Create GitHub Repository

Go to: https://github.com/new

**Settings:**
- Owner: `lorislab` (or your organization)
- Repository name: `velya-relay`
- Description: `Self-hosted cloud relay server for iOS alarm apps with WebSocket, APNs Silent Push, and Node-RED integration`
- Visibility: **Public** ✅
- Initialize: **Do NOT initialize** (no README, no .gitignore, no license)

Click **Create repository**

## 2. Push Local Repository

```bash
cd /tmp/velya-relay-docker

# Add remote
git remote add origin https://github.com/lorislab/velya-relay.git

# Push all commits and tags
git push -u origin main

# Verify
git log --oneline
```

Expected output:
```
abc1234 feat: production-ready deployment suite
def5678 docs: add landing page
ghi9012 [velya-relay] Initial commit: complete server + Docker setup
```

## 3. Configure GitHub Secrets

Required for Docker Hub auto-publishing via GitHub Actions.

Go to: https://github.com/lorislab/velya-relay/settings/secrets/actions

Add these secrets:

| Name | Value | Where to Get |
|------|-------|--------------|
| `DOCKER_USERNAME` | Your Docker Hub username | https://hub.docker.com/settings/general |
| `DOCKER_TOKEN` | Docker Hub access token | https://hub.docker.com/settings/security → New Access Token |

**Docker Hub Token Permissions:**
- Description: `GitHub Actions - Velya Relay`
- Access permissions: **Read, Write, Delete** ✅

## 4. Enable GitHub Actions

GitHub Actions workflows are already in `.github/workflows/`:

- `test.yml` — Runs on every push (lint, build, test)
- `docker-publish.yml` — Builds and publishes Docker image on:
  - Every push to `main` → `lorislab/velya-relay:main`
  - Every tag `v*` → `lorislab/velya-relay:v1.0.0`, `:1.0`, `:1`, `:latest`
  - Multi-platform: `linux/amd64`, `linux/arm64`

**First run will trigger automatically** when you push to `main`.

Verify: https://github.com/lorislab/velya-relay/actions

## 5. Configure Repository Settings

### Branch Protection

Go to: https://github.com/lorislab/velya-relay/settings/branches

Add rule for `main`:
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required checks: `test` (from test.yml workflow)
- ✅ Require linear history
- ❌ Allow force pushes (keep disabled for security)

### Topics

Go to: https://github.com/lorislab/velya-relay

Click ⚙️ next to "About" and add topics:
```
ios, swift, nodejs, typescript, websocket, apns, docker, node-red, 
home-automation, alarm, push-notifications, self-hosted, relay-server
```

### Website

Set homepage URL:
```
https://lorislab.github.io/velya-relay
```

(Will serve `docs/index.html` via GitHub Pages — see next section)

### License

Already included as `LICENSE` (MIT) — GitHub will detect automatically.

## 6. Enable GitHub Pages

Go to: https://github.com/lorislab/velya-relay/settings/pages

**Source:**
- Branch: `main`
- Folder: `/docs`

Click **Save**

Wait 1-2 minutes, then visit: https://lorislab.github.io/velya-relay

## 7. Create Initial Release

Go to: https://github.com/lorislab/velya-relay/releases/new

**Tag:** `v1.0.0`  
**Target:** `main`  
**Release title:** `Velya Cloud Relay v1.0.0`

**Description:**
```markdown
## 🎉 First Public Release

Self-hosted cloud relay server for iOS alarm apps with WebSocket, APNs Silent Push, and Node-RED integration.

### ✨ Features

- **WebSocket Relay** — Persistent bidirectional connection for instant alarm delivery
- **APNs Silent Push** — Wakes iOS devices even when app is killed or device is locked
- **Node-RED Integration** — REST API + webhooks for home automation workflows
- **Docker Ready** — One-command deployment with docker-compose
- **Self-Hosted** — Your data, your server. No third-party dependencies.
- **Audit Logs** — Complete audit trail of all API calls and alarm deliveries

### 📦 Docker Image

```bash
docker pull lorislab/velya-relay:v1.0.0
docker pull lorislab/velya-relay:latest
```

### 🚀 Quick Start

See [DEPLOYMENT.md](https://github.com/lorislab/velya-relay/blob/main/DEPLOYMENT.md) for full instructions.

### 📄 Documentation

- [README.md](https://github.com/lorislab/velya-relay/blob/main/README.md) — Quick start & API reference
- [DEPLOYMENT.md](https://github.com/lorislab/velya-relay/blob/main/DEPLOYMENT.md) — Production deployment guide
- [SECURITY.md](https://github.com/lorislab/velya-relay/blob/main/SECURITY.md) — Security policy & threat model
- [CONTRIBUTING.md](https://github.com/lorislab/velya-relay/blob/main/CONTRIBUTING.md) — Contributing guidelines

### 🔗 Links

- Website: https://lorislab.github.io/velya-relay
- Docker Hub: https://hub.docker.com/r/lorislab/velya-relay
- Issues: https://github.com/lorislab/velya-relay/issues

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
```

Attach files (optional):
- None (Docker image is on Docker Hub)

Click **Publish release**

## 8. Verify Everything

### GitHub Actions

✅ https://github.com/lorislab/velya-relay/actions → Both workflows passed  
✅ Docker image published: https://hub.docker.com/r/lorislab/velya-relay

### GitHub Pages

✅ https://lorislab.github.io/velya-relay → Landing page loads

### Docker Hub

```bash
docker pull lorislab/velya-relay:latest
docker images | grep velya-relay
```

Expected:
```
lorislab/velya-relay  latest  abc1234  2 minutes ago  180MB
lorislab/velya-relay  v1.0.0  abc1234  2 minutes ago  180MB
lorislab/velya-relay  main    abc1234  2 minutes ago  180MB
```

### Test Health Check

```bash
docker run --rm lorislab/velya-relay:latest node --version
# Expected: v22.x.x
```

## 9. Update iOS App

In Xcode project `Velya/Velya/VelyaApp.swift`, update default server URL:

```swift
// Old (relay2.lorislab.fr is now deprecated)
let serverURL = UserDefaults.standard.string(forKey: "velya_server_url") 
              ?? "https://relay2.lorislab.fr"

// New (public relay on Railway or your domain)
let serverURL = UserDefaults.standard.string(forKey: "velya_server_url") 
              ?? "https://relay.velya.app"  // or relay.lorislab.fr
```

## 10. Announce Release

Post on:
- Reddit: r/homeautomation, r/nodered, r/selfhosted
- Twitter/X: @lorislab_fr
- Hacker News: https://news.ycombinator.com/submit

Example post:
```
Velya Cloud Relay v1.0.0 — Self-hosted relay server for iOS alarm apps

I built a self-hosted relay server that lets you trigger iOS alarms from 
Node-RED, Home Assistant, or any HTTP client. Uses WebSocket for instant 
delivery and APNs Silent Push to wake locked devices.

Open source (MIT), Docker-ready, and works with any iOS app that integrates 
the CloudRelayService package.

GitHub: https://github.com/lorislab/velya-relay
Landing page: https://lorislab.github.io/velya-relay
```

---

## Troubleshooting

### "remote: Permission to lorislab/velya-relay.git denied"

**Cause:** GitHub PAT (Personal Access Token) expired or missing `repo` scope.

**Fix:**
1. Generate new PAT: https://github.com/settings/tokens/new
2. Scopes: ✅ `repo` (full control of private repositories)
3. Update Git credential:
   ```bash
   git remote set-url origin https://YOUR_PAT@github.com/lorislab/velya-relay.git
   ```

### Docker Hub image not published

**Cause:** `DOCKER_USERNAME` or `DOCKER_TOKEN` secret incorrect.

**Fix:**
1. Verify secrets at: https://github.com/lorislab/velya-relay/settings/secrets/actions
2. Re-run workflow: https://github.com/lorislab/velya-relay/actions → Click failed run → Re-run jobs

### GitHub Pages 404

**Cause:** Wrong source folder or branch.

**Fix:**
1. Verify `docs/index.html` exists in `main` branch
2. Settings → Pages → Source: `main` branch, `/docs` folder
3. Wait 2-3 minutes, hard refresh browser (Cmd+Shift+R)

---

**Next:** See [DEPLOYMENT.md](DEPLOYMENT.md) for deploying to Railway, VPS, or LXC.
