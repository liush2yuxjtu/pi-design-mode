# 0.3.0：英文实录与双语发布

## 决定

用户明确要求英文视频，同时 ship / build-in-public。不能用字幕或录制覆盖层冒充英文产品。新增进程级 `PI_DESIGN_LANGUAGE=en`，本地化产品界面并初始化英文示例；既有设计不翻译、不覆盖。部分诊断与工作流说明仍为中文，README 明确说明。

## 渠道

沿用现有 GitHub、npm `pi-design-mode`、Pi Gallery 与 GitHub Pages，MIT 不变。新增视频不是新的插件或包装产品，不发布到无关市场。Gallery 仅支持一个主视频，选择英文实录；README 与官网同时提供中英文链接。

## 媒体

英文片为新的真实 Pi CLI 会话，70.04 秒；中文获批原片 62.708333 秒，SHA-256 不变。两版均有真实 inspect/apply 调用。Mac mini 预演与正式录制通过，公开前做隐私遮挡和 OCR 采样。时长、分辨率、哈希见 site/media.json。原始会话和 OCR 不公开。

## 发布前验证

18 项后端/语言测试、中英两种模式的官方 Pi loader、TypeScript noEmit、构建与打包检查通过。英文数据创建、已有中文数据不变、含中文的用户标题/路径保留、暗色主题导出和本地化 JS 语法有回归检查。官网两版视频播放、时长、语言切换、深链接、下载、复制命令和 390/768/1440 响应式通过。

## 发布后验收

合并后依次验证 Pages、两版媒体哈希、OIDC npm 发布、独立 Pi 安装、Gallery 英文主视频与中文入口。不用本机 npm login。索引延迟不重发同版，使用 verify_only。下载统计与用户数不混算；不可用时不记零。实际完成证据保存在本地 evidence/，GitHub Actions 与 Release 提供公开回执。

## 已完成公开验证

- [0.3.0 Release](https://github.com/liush2yuxjtu/pi-design-mode/releases/tag/v0.3.0)。
- [OIDC 发布及校验](https://github.com/liush2yuxjtu/pi-design-mode/actions/runs/34348021790) 全部通过；不使用本机 npm login。
- [Pages 部署](https://github.com/liush2yuxjtu/pi-design-mode/actions/runs/34347107344) 通过。实际公网测试验证两版视频播放、时长/尺寸、切换语言和深链接；两版下载哈希与本地一致。
- `pi install npm:pi-design-mode@0.3.0` 在隔离配置下成功；安装包中英文模式的官方 loader 验证均通过，两个 README 包含对应视频入口。
- Pi Gallery 返回 200，显示 0.3.0，两个内置 video 元素均指向 demo-en.mp4；README 同时提供 demo.mp4 中文入口。
- npm 通过官方 registry、tarball integrity 和安装验证，不把 npm 网页的自动访问限制冒称为页面播放验证。
