---
name: Feature Request
about: Suggest a new feature or enhancement
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Feature Description

A clear and concise description of the feature you'd like to see.

## Use Case

Describe the problem this feature would solve or the workflow it would improve.

**Example:**
> As a Node-RED user, I want to schedule recurring alarms (e.g., every weekday at 7 AM) without having to create a new alarm each night, so that I don't need a daily inject node.

## Proposed Solution

How would this feature work? Include API examples, UI mockups, or configuration snippets.

**Example API:**
```json
POST /v1/alarms
{
  "device_id": "...",
  "hour": 7,
  "minute": 0,
  "enabled": true,
  "recurrence": {
    "type": "weekly",
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  }
}
```

## Alternatives Considered

Other ways you've tried to achieve this, or alternative designs for the feature.

## Additional Context

Any other context, screenshots, or examples (links to similar features in other apps, etc.)

## Priority

How important is this feature to you?

- [ ] Critical (blocks my use case)
- [ ] High (would significantly improve my workflow)
- [ ] Medium (nice to have)
- [ ] Low (minor enhancement)

## Willingness to Contribute

Are you interested in implementing this feature yourself?

- [ ] Yes, I can submit a PR with guidance
- [ ] Maybe, if I get help with the codebase
- [ ] No, I'm just requesting the feature
