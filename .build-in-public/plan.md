# 公开发布计划

## 最新状态

0.3.0 已通过 GitHub Actions OIDC 发布。英文实录与中文获批原片均已公开；GitHub/npm/Gallery、双语官网播放与独立安装已核验。详见 release-0.3.0.md。用户已完成 npm Trusted Publisher 绑定；后续不依赖本机登录。详细证据见 release-report.md。以下准备阶段认证与批准描述属于历史状态，不是仍需用户处理的事项。

## 历史记录：0.2.0 发布计划

以下所有章节均保留当时的版本、安装命令与准备状态，不是当前操作指引。当前版本、命令与验收以 README.md、PUBLISHING.md 和 release-0.3.0.md 为准。

### Canonical artifact and version

既有公开仓库 `liush2yuxjtu/pi-design-mode`，既有 npm 名 `pi-design-mode`，维护者 `nyn5255`，沿用 MIT。候选版本 0.2.0。默认 /design 改为 HTML 工作区，旧 SVG 文件不自动迁移。

原开发仓库包含其他未提交工作，不作修改。本目录从与 GitHub main 一致的 c1b44c277058fd22f3d5b490473b7d86bac25dc6 建立隔离发布分支。新的 HTML 源来自已验收 pi-design-studio，新增随包工作流说明，消除作者私有技能与文档依赖。

## Direct channels

- GitHub：源码、PR、tag v0.2.0、Release、校验和。安装 `pi install git:github.com/liush2yuxjtu/pi-design-mode@v0.2.0`。验证公开 tag、Release 与 clean install。回退新 patch 或明确保留旧 tag，不改历史。
- npm：`pi-design-mode@0.2.0`；`pi install npm:pi-design-mode@0.2.0`。验证 registry 元数据、tarball integrity 和一次干净安装。回退通过修复版本或 deprecate，不默认 unpublish。
- Pi Package Gallery：同一个 npm 包的 `pi-package` 元数据索引，无独立上传。验证列表实际含包与新版；索引延迟则单独报告待刷新，不虚构独立安装量。

## Wrapper channels

无。没有独立 IDE、浏览器、Python 或容器产品，不制造空包装。

## Rejected channels and reasons

skills.sh、ClawHub、LobeHub：没有独立可移植 Agent Skill。MCP Registry：不是 MCP 服务。VS Code、Open VSX、Homebrew、PyPI、Docker：非本产品原生安装路径。

## Public metrics per channel

GitHub stars 与 npm downloads 分开记录。Gallery 采用 npm 下载统计，不累加为用户。新版本未发布时，只记录旧版数据。

## Authentication, review, signing, and fee gates

GitHub 读取已验证。npm whoami 返回 E401，当前凭据失效，需要官方网页登录。需一次确认精确公开范围：现有仓库、现有 npm 包、Gallery，0.2.0、MIT，无新增付费服务。README 与 metadata 变更在本地备妥，批准前不 commit/push/publish。GitHub metadata 暂不修改。公开录屏排除含本机路径和 provider 信息的现有素材。

## Release waves and rollback

1. 完成验证、精确目标确认、恢复 npm 授权。
2. scoped commit、push 分支、PR、等待 CI 和反馈，按 ship 授权合并，同步发布 checkout。
3. 生成 tag 和 GitHub Release，发布已校验 npm tarball。
4. 官方 registry clean install、Pi loader smoke、Gallery 检查、保存 release manifest 和校验和。

## Resume-safe reporting plan

状态 `prepared / waiting-for-human`。尚未发布 0.2.0。14 个测试、构建检查、官方 loader 和独立 tarball 安装已通过。用户确认后重查远端 HEAD、包版本及 npm 身份，避免把漂移后的内容直接发布。

## README brief and evidence

目标：Pi 用户，以本地 HTML 编辑、两份真源、版本和原生导出为定位。证据来自运行时与测试，不宣传任意编辑、生产聊天或已完成框架构建。研究类营销技能本会话不可用，未声称调用。README 草案直接基于代码及官方 Pi package 文档。GitHub description/topics/homepage 不变。
