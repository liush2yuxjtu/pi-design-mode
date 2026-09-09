# Release report

## 0.2.0 已公开发布与安装验证

- [GitHub Release](https://github.com/liush2yuxjtu/pi-design-mode/releases/tag/v0.2.0)：公开 tarball 下载与内容校验通过。
- [npm 0.2.0](https://www.npmjs.com/package/pi-design-mode/v/0.2.0)：官方 registry 已返回该版本，SHA-512 与下载包一致，文件内容与 GitHub 发布包逐项一致。
- 独立 Pi 配置目录执行 `pi install npm:pi-design-mode@0.2.0` 成功，官方 loader、命令、inspect/apply、磁盘、会话关闭检查通过；没有调用模型。
- 14/14 后端测试、3/3 真实浏览器回归、TypeScript 和 GitHub CI 通过。
- [真实 OIDC 发布](https://github.com/liush2yuxjtu/pi-design-mode/actions/runs/34331614299)：发布步骤成功，附 SLSA provenance；紧接着的 registry 查询遇到暂时 404，使该运行整体显示失败。后续独立查询与安装确认包已经发布，不重发同版本。
- [Pi Gallery](https://pi.dev/packages/pi-design-mode)：普通浏览器访问 HTTP 200，已显示版本 0.2.0、HTML 工作区描述、作者 nyn5255 和 MIT。原始 HTTP 客户端曾返回 403；浏览器证据已另行验证。
- npm downloads API 返回 404，Gallery 显示 not available，统计暂不可用，不记为零。
- 既有未提交开发工作保留。发布不依赖本机 npm login 或长期 Token。

以下内容为 **0.1.0 历史发布记录**，不是 0.2.0 发布证明。

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

Published on GitHub and npm, indexed in Pi Package Gallery, and clean-install verified with `pi install npm:pi-design-mode`, with public MP4 preview and no telemetry. Adoption counts are not yet available.
