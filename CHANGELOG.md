# Changelog

## 0.2.0 — 2026-09-09

- 默认 `/design` 从 SVG 工作流切换为本地 HTML 工作区。旧草稿保留，不自动迁移。
- 增加两份设计真源、六项设计系统文件、草稿调参、标题锁、版本恢复和原生 HTML 导出。
- 增加回环授权服务器、当前 Pi 会话任务分派、etag 并发保护和事务恢复。
- 内置可移植工作流说明，不依赖作者的私有配置或必装第三方技能。
- 明确限制：不是任意 HTML 编辑器；不含生产聊天后端；完整参考与框架构建尚未验收。
- 保留已知 UI 问题说明：保存可能重置 iframe 内滚动，中文窄按钮可能换行。

## 0.1.0 — 2026-09-07

Initial public release candidate.

- Add brief-first SVG design mode with `/design` and `/design-stop`.
- Add direction batches, stable regions, protected-region updates, comparisons, design specifications, evidence-linked reviews, and static multi-screen flows.
- Add session persistence, immutable revision artifacts, cancellation handling, path hardening, SVG allowlist validation, and native PNG rendering.
- Add tested example workflow and product-demo video.
