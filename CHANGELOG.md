# Changelog

## 0.3.0 — 2026-09-09

- 新增 `PI_DESIGN_LANGUAGE=en`：英文编辑器界面与英文新建示例，不翻译或覆盖已有设计。
- 新增约 70 秒英文真实 TUI + HTML 录像；中文获批原片保持不变。
- 官网切换语言时同步视频、封面与下载入口，支持 `?lang=zh` 深链接。
- 英文 README 和 Pi Gallery 默认展示英文录像，两种语言均有独立公开视频链接。
- 新增英文初始化、旧项目不变、用户内容保留、主题导出和本地化脚本验证。

## 0.2.2 — 2026-09-09

- 纠正误选演示：恢复用户已确认的约 63 秒真实 Pi TUI + HTML 原版，仅做隐私遮挡。
- 同步封面、视频比例和中英文说明。没有重录或新增字幕，扩展功能不变。
- 官网验证增加时长和分辨率断言，防止再次误用 UI-only 视频。

## 0.2.1 — 2026-09-09

- 增加双语官网、真实 UI 操作视频、封面及 GitHub Pages 自动发布。
- 增加英文 README 和独立简体中文 README，提供显眼的视频入口。
- npm 元数据增加官网与 Pi Gallery 视频/封面；不把媒体文件打入运行时包。
- 扩展功能与 0.2.0 相同。

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
