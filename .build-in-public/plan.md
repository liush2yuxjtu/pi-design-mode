# Distribution plan

## Canonical artifact and version

- Artifact: macOS Pi extension package
- Public name: `pi-design-mode`
- Version: `0.1.0`
- Canonical source: `https://github.com/liush2yuxjtu/pi-design-mode`
- Proposed license: MIT, matching author's existing public Pi extensions
- Preview video: `assets/pi-design-mode-product-demo.mp4`
- Preview SHA-256: `b0a1a50382de5087f2c9d44047c6f5eb24d9c48fa84617f733b6d0ae1cc0c361`

## Direct channels

### GitHub

- Native fit: source, issues, release tags, binary preview asset
- Install: `pi install git:github.com/liush2yuxjtu/pi-design-mode@v0.1.0`
- Listing: `https://github.com/liush2yuxjtu/pi-design-mode`
- Metrics: stars, forks, issues, release downloads
- Update: tagged releases from canonical repository
- Validation: clean checkout, install, loader smoke test, full test suite
- Rollback: mark release deprecated and publish fixed patch; never rewrite tag
- Maintenance: low

### npm

- Native fit: Pi's package registry
- Install: `pi install npm:pi-design-mode`
- Listing: `https://www.npmjs.com/package/pi-design-mode`
- Metrics: npm downloads by period
- Owner: npm account authenticated for publication
- Update: immutable semantic versions
- Validation: `npm pack --dry-run`, tarball audit, clean install, Pi loader smoke test
- Rollback: `npm deprecate`; publish patch rather than unpublish
- Maintenance: low

### Pi Package Gallery

- Discovery is automatic from npm keyword `pi-package`.
- Listing: `https://pi.dev/packages/pi-design-mode`
- Preview: MP4 URL in `package.json`; image fallback also provided
- Metrics: npm-derived weekly/monthly downloads shown by Gallery
- Validation: public Gallery page, video HTTP response and content type, clean Pi install
- Rollback: follows npm deprecation/fixed release
- Maintenance: none beyond npm metadata

## Wrapper channels

None. Extension behavior is Pi-specific. VS Code, Open VSX, JetBrains, browser stores, Homebrew, Docker, skills.sh, ClawHub, and LobeHub would be misleading or add no native install value.

## Rejected channels and reasons

- skills.sh: no portable `SKILL.md` artifact
- ClawHub/LobeHub: no OpenClaw/Lobe skill artifact
- MCP registries: extension is not an MCP server
- IDE marketplaces: no IDE extension implementation
- Homebrew: no standalone CLI
- Docker: native macOS `sips` dependency makes container route unnatural
- language registries other than npm: no native implementation

## Public metrics per channel

- GitHub: stars, forks, open issues, release asset downloads
- npm: package downloads, reported separately by period
- Pi Gallery: npm-derived downloads; do not add to npm totals

Evidence snapshots append to `.build-in-public/metrics.jsonl`; raw public responses go under `.build-in-public/evidence/<date>/`.

## Authentication, review, signing, and fee gates

- GitHub CLI is authenticated; repository name currently available.
- npm CLI is not authenticated on this machine. Publication requires official npm login or trusted publishing setup.
- Pi Gallery needs no separate submission, review, or fee.
- Confirm public repository creation, package name, version, and MIT license before first public mutation.

## Release waves and rollback

1. Create public GitHub repository; push reviewed source; tag `v0.1.0`; create release with checksums.
2. Authenticate npm; publish exact tested tarball as `pi-design-mode@0.1.0`.
3. Wait for Gallery indexing; verify listing, MP4 preview, clean install, and smoke test.
4. On failure, stop affected channel; preserve successful channels and publish status accurately.

## Resume-safe reporting plan

Report each channel as prepared, published, indexed, or verified install. Never treat downloads as unique users. Preserve exact version, commit, tag, tarball checksum, video checksum, timestamps, URLs, and command evidence.
