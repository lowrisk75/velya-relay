# Velya Cloud Relay — Business Strategy

**Version**: 1.0.0  
**Date**: 2026-05-28  
**Decision**: Self-hosted only (Phase 1)

---

## Problem Statement

Velya iOS app requires a cloud relay server to send APNs Silent Push notifications for waking the app when locked/killed. Without this, alarms triggered from Node-RED/Home Assistant cannot ring on locked devices.

## Strategic Options Evaluated

### Option A — Self-Hosted Only
**Users deploy their own relay servers**

- ✅ Zero cost for maintainer
- ✅ Maximum privacy (data stays on user infrastructure)
- ✅ No vendor lock-in or single point of failure
- ✅ Aligns with home automation community values (Node-RED, Home Assistant)
- ❌ Technical barrier limits adoption to power users
- ❌ No revenue model

### Option B — Managed Service (Subscription)
**Hosted relay at relay.velya.app, $2.99-4.99/month IAP**

- ✅ Revenue stream ($30-100/month with 10-20 subscribers)
- ✅ Simple UX (zero setup for non-technical users)
- ❌ Ongoing server costs ($15-50/month on Railway)
- ❌ Major friction: free app → paid service
- ❌ Community backlash (open-source ethos violated)
- ❌ Support burden (if server down, all users affected)

### Option C — Free Hosted + Self-Host Option
**relay.velya.app free for all, with optional self-hosting**

- ✅ Maximum adoption (zero friction)
- ✅ Community goodwill
- ✅ Flexible (power users can still self-host)
- ❌ Unsustainable at scale (500-1000 users = $40-115/month pure cost)
- ❌ No revenue to offset costs
- ❌ Single point of failure for most users

---

## Decision: Option A (Self-Hosted Only)

**Rationale** (validated via NotebookLM analysis):

1. **Target audience is already technical**
   - Node-RED users deploy Node-RED themselves (Raspberry Pi, Docker, etc.)
   - Home Assistant community expects self-hosting
   - This is not a consumer app; it's an automation tool

2. **Zero financial risk**
   - No server costs for maintainer
   - No scaling surprise costs
   - No commitment to keep a service running indefinitely

3. **Product validation phase**
   - Unknown adoption volume (10 users? 1000?)
   - Need to validate Product-Market Fit before investing in infrastructure
   - Self-hosting reveals true demand (users willing to deploy = strong signal)

4. **Industry precedent**
   - **Home Assistant Companion App**: free app, self-hosted backend required (Nabu Casa is optional paid addon)
   - **Tailscale**: free tier for personal use, enterprise pays
   - **Frigate**: free app, self-hosted NVR

5. **Migration path preserved**
   - Can always add hosted option later (Option B or C) if demand justifies it
   - Cannot easily go from hosted → self-hosted (users hate losing convenience)

---

## Success Metrics (6-12 month horizon)

Track these signals to decide if Phase 2 (hosted relay) is justified:

| Metric | Threshold | Action |
|--------|-----------|--------|
| GitHub stars | 100+ | Strong community interest |
| Support requests for "hosted version" | 10+ unique requests | Demand for convenience |
| Active relay instances (via GitHub issues/discussions) | 50+ | Proven adoption |
| Expressed willingness to pay | 20+ users | Subscription viability |

---

## Phase 2 Trigger

**IF** adoption grows AND hosting requests accumulate:

1. **Launch "Velya Pro" IAP** ($2.99-4.99/month)
   - Hosted relay at relay.velya.app
   - Break-even at 10-20 subscribers
   - Keep self-hosting free (critical for community trust)

2. **Freemium local-first model** (recommended alternative)
   - All local features (calendar, HealthKit, battery rules) = free forever
   - Cloud integrations (Node-RED, Home Assistant webhooks) = Pro tier
   - Self-hosting still free for advanced users

---

## Technical Implications

- ✅ GitHub repository remains public
- ✅ Dockerfile + docker-compose production-ready
- ✅ Complete documentation (README, DEPLOYMENT, SECURITY guides)
- ✅ Railway one-click deploy guide (for users)
- ✅ iOS app supports custom server URL (Settings → Server Configuration)
- ✅ relay2.lorislab.fr remains maintainer's private instance (not public)

---

## Community Communication

**Key Messages**:

1. "Self-hosted by design for privacy and control"
2. "Your data never leaves your infrastructure"
3. "No subscriptions, no tracking, no vendor lock-in"
4. "Hosted relay coming if community demand justifies it"

**Forums to announce**:
- Reddit: r/homeassistant, r/nodered, r/selfhosted
- Home Assistant Community forum
- Node-RED Discourse
- GitHub Discussions

---

## Cost Comparison (for users)

| Option | Monthly Cost | Setup Complexity | Data Privacy |
|--------|--------------|------------------|--------------|
| Self-host on NAS/RPi | $0 (marginal) | Medium | 100% private |
| Railway free tier | $0 (trial 30 days) | Low | Railway ToS |
| Railway paid | ~$10-15 | Low | Railway ToS |
| VPS (Hetzner/Digital Ocean) | ~$5 | High | 100% private |

Most Node-RED users already run a Raspberry Pi or NAS → **marginal cost is $0**.

---

## Long-Term Vision

**Years 1-2**: Self-hosted only, build community, validate Product-Market Fit

**Years 2-3**: If adoption strong, add optional hosted relay (freemium or subscription)

**Years 3+**: Velya becomes a reference implementation for iOS home automation, with both free self-hosted and paid convenience tiers coexisting (the "Nabu Casa model")

---

**Decision Approved**: 2026-05-28  
**Reviewed By**: NotebookLM strategic analysis + indie dev economics research  
**Next Review**: 2026-11-28 (6 months)
