# Changelog

All notable changes to Velya Cloud Relay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned Features

- [ ] Recurring alarm support (daily, weekly, custom schedules)
- [ ] Webhook payload signatures (HMAC-SHA256)
- [ ] Multi-user/tenant support
- [ ] OAuth integration (Apple Sign In, Google, etc.)
- [ ] Alarm history and analytics endpoints
- [ ] SMS/Email fallback delivery (Twilio, SendGrid integration)
- [ ] Admin dashboard (web UI for managing devices, alarms, users)
- [ ] Prometheus metrics export
- [ ] Grafana dashboard templates
- [ ] Alarm sound preview endpoint (TTS, custom audio URLs)

## [1.0.0] - 2026-05-28

### Added

- **Core Infrastructure**
  - WebSocket relay server with JWT authentication
  - APNs Silent Push integration for background wake
  - PostgreSQL database with 13 tables (devices, alarms, webhooks, audit logs, etc.)
  - Redis for WebSocket presence and offline command queuing
  - REST API for alarm creation, device management, webhook configuration

- **Authentication & Security**
  - JWT RS256 tokens with 7-day expiration
  - API key authentication for Node-RED/external services (bcrypt hashed)
  - Device-scoped access control
  - Audit logging for all API calls and alarm deliveries
  - Security policy documentation

- **Docker Support**
  - Multi-stage Dockerfile with Node 22 Alpine
  - Docker Compose setup with PostgreSQL 16 and Redis 7
  - Health checks for all services
  - Non-root user execution (velya:1000)
  - Automated database initialization with init-db.sql

- **Deployment Platforms**
  - Railway.app configuration (railway.json, railway.toml)
  - GitHub Actions workflows (Docker build, tests, CI/CD)
  - Nginx reverse proxy configuration
  - LXC/Proxmox deployment guide

- **Documentation**
  - Comprehensive README.md (7.4KB) with quick start and API examples
  - Production deployment guide (DEPLOYMENT.md, 13KB)
  - Contributing guidelines (CONTRIBUTING.md)
  - Security policy (SECURITY.md) with threat model
  - Landing page (docs/index.html) with Apple-inspired design

- **Scripts & Utilities**
  - Data migration script (migrate-from-existing.sh)
  - Health check script (health-check.sh) with 8 checks
  - Automated backup script (backup.sh) with retention policy
  - Node-RED flow example (velya-automation-example.json)

- **iOS App Integration**
  - CloudRelayService with configurable server URL
  - ServerConfigView for custom server configuration
  - APNs token registration with fallback
  - WebSocket reconnection with exponential backoff

### Changed

- Device registration now supports both string user IDs (dev/testing) and UUID user IDs (production)
- APNs token endpoint made configurable via UserDefaults (velya_server_url key)
- Default fallback to system user (UUID 00000000-0000-0000-0000-000000000001) for non-UUID user IDs

### Fixed

- UUID validation in device registration preventing test users
- Server URL hardcoding preventing self-hosted deployments
- Missing ServerConfigView in Xcode project causing build failures
- Section header/footer syntax errors in SwiftUI views

### Security

- All secrets stored in .env file (never in source code)
- APNs keys protected with chmod 600
- PostgreSQL and Redis require authentication
- SQL injection prevention via parameterized queries
- Input validation with Zod schemas
- CORS configuration for origin restrictions

## [0.1.0] - 2026-05-27 (Internal Beta)

### Added

- Initial WebSocket relay implementation
- Basic alarm creation and delivery
- APNs Silent Push proof of concept
- PostgreSQL schema design
- JWT authentication prototype

---

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md with release date
3. Commit: `git commit -m "chore: release v1.0.0"`
4. Tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
5. Push: `git push origin main --tags`
6. GitHub Actions will automatically build and publish Docker image

## Versioning

- **Major (1.x.x)**: Breaking changes (API incompatible with previous version)
- **Minor (x.1.x)**: New features (backward compatible)
- **Patch (x.x.1)**: Bug fixes (backward compatible)

---

[Unreleased]: https://github.com/lorislab/velya-relay/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lorislab/velya-relay/releases/tag/v1.0.0
[0.1.0]: https://github.com/lorislab/velya-relay/releases/tag/v0.1.0
