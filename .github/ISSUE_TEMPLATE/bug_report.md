---
name: Bug Report
about: Report a bug or unexpected behavior
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Deploy Velya relay with Docker Compose
2. Configure iOS app with server URL '...'
3. Create alarm via Node-RED with payload '...'
4. Observe error '...'

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened. Include error messages, logs, or screenshots.

## Environment

**Server:**
- Deployment: [Docker Compose / Railway / VPS / LXC]
- OS: [Ubuntu 22.04 / macOS Sonoma / etc.]
- Node.js version: [22.x]
- PostgreSQL version: [16]
- Redis version: [7]

**iOS App:**
- iOS version: [17.4]
- Velya version: [1.0.0]
- Device: [iPhone 15 Pro]

**Network:**
- Server URL: [https://relay.example.com or http://localhost:8080]
- Connection type: [WebSocket / APNs Silent Push]
- Reverse proxy: [None / Nginx / Caddy / Cloudflare]

## Logs

<details>
<summary>Server Logs</summary>

```
Paste relevant server logs here (from docker-compose logs or Node.js console)
```

</details>

<details>
<summary>iOS App Logs (if applicable)</summary>

```
Paste relevant iOS app logs here (from Xcode console or CloudRelayDebugView)
```

</details>

## Additional Context

Any other context about the problem (recent changes, unusual configuration, etc.)

## Checklist

- [ ] I have checked existing issues for duplicates
- [ ] I have included all requested information
- [ ] I have masked any sensitive data (passwords, API keys, device IDs)
- [ ] I can reproduce this bug consistently
