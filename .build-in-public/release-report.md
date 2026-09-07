# Release report

## Published and verified

- GitHub repository: https://github.com/liush2yuxjtu/pi-design-mode
- GitHub release: https://github.com/liush2yuxjtu/pi-design-mode/releases/tag/v0.1.0
- npm: https://www.npmjs.com/package/pi-design-mode (`0.1.0`, maintainer `nyn5255`)
- Pi Package Gallery: https://pi.dev/packages/pi-design-mode
- Public video bytes match SHA-256 `b0a1a50382de5087f2c9d44047c6f5eb24d9c48fa84617f733b6d0ae1cc0c361`.
- Gallery exposes the configured MP4 in both thumbnail and fullscreen `<video>` elements.
- A clean temporary home completed `pi install npm:pi-design-mode`; Pi loader exposed `design_render`, `design_manage`, `/design`, and `/design-stop`.

## Submitted or waiting for review

None. Pi Gallery indexed automatically from npm.

## Skipped and why

No wrappers were published. This Pi-specific extension is not a portable Agent Skill, MCP server, IDE extension, CLI, or container.

## Install commands

```bash
pi install npm:pi-design-mode
```

Pinned Git release:

```bash
pi install git:github.com/liush2yuxjtu/pi-design-mode@v0.1.0
```

## Public metric links

- GitHub API: https://api.github.com/repos/liush2yuxjtu/pi-design-mode
- npm downloads API: https://api.npmjs.org/downloads/point/last-week/pi-design-mode
- Pi Gallery: https://pi.dev/packages/pi-design-mode

## Current evidence snapshot

Captured 2026-09-07T10:14:09Z. GitHub reported 0 stars and 0 forks for new repository. npm downloads API and Pi Gallery download count were not yet available; this is not reported as zero.

## Maintenance and next release actions

- Publish immutable patch versions; never rewrite `v0.1.0`.
- Keep npm metadata, Gallery media URLs, changelog, and release checksums aligned.
- Recheck download counters after npm statistics begin reporting.

## Resume-safe claim

Published and clean-install verified Pi Design Mode 0.1.0 through GitHub, npm, and Pi Package Gallery, with public MP4 preview and no telemetry. Adoption counts are not yet available.
