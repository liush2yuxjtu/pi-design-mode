# 中英文演示媒体

## 中文原片

`demo.mp4`：62.708333 秒，1920×984。用户此前批准的真实 Pi TUI + HTML 原版，只做隐私遮挡。SHA-256 保持 `910fcac7d48267f60c07d70ffabd957c97eb78c0aefb938cc1b354ea40c1149c`，没有被新片替换。

## 英文实录

`demo-en.mp4`：70.04 秒，1920×984。新录制的真实 Pi CLI 会话，使用发布包的 `PI_DESIGN_LANGUAGE=en` 模式和全新临时工作区。英文界面和初始设计来自产品实现，不是字幕或覆盖式翻译。用户请求、模型回复、工具摘要与 HTML 均为英文。真实调用 inspect/apply，验证落盘、浏览器调参和独立 HTML 导出交互。预演和正式录制各完成六项端到端断言。

## 内嵌 GIF

`demo-en.gif` 与 `demo.gif` 直接派生自以上两版公开视频。在 Mac mini 使用 FFmpeg 转换，完整时长与原有隐私遮挡保留，没有裁剪、重录或加速。960×492、8 fps、128 色、无限循环；仅用于免点击预览，文字清晰度低于原 MP4。

双语 README 直接使用 Markdown 图片，不包外链。官网直接显示两张 GIF；系统开启减少动态效果时显示静态封面，高清播放器仍可手动使用。Gallery 元数据只提供 GIF `pi.image`，不再提供会触发弹窗的 `pi.video`。Gallery 自己仍可能允许点击图片放大，但正文动画无需点击。

回归验证依赖 Python 3.10+、Pillow 和 Playwright。首次在独立环境安装：

```bash
python3 -m venv .venv-media
.venv-media/bin/python -m pip install -r tools/requirements-media.txt
.venv-media/bin/python -m playwright install chromium
.venv-media/bin/python tools/check-inline-gifs.py
```

线上验证可传入官网或 Gallery URL。旧版本对照：`.venv-media/bin/python tools/check-inline-gifs.py --baseline v0.3.0`，预期断言失败，证明旧 README 缺少直接 GIF。渲染脚本为 `tools/render-gifs.sh`，必须通过维护者的 Mac mini 渲染入口执行。两张 GIF 不打包进 npm 运行时。

## 共同边界

两版均由 Mac mini 录制、转码和抽帧。左侧为实时 PTY 字节渲染的真实 Pi TUI，右侧为实际工作区/导出 HTML。并排终端是录制构图，不代表产品内置终端嵌入。聊天面板仍为本地回显，不是生产模型后端。

没有片头、分段标题、字幕、配音或加速。公开版遮挡本机路径和 provider 信息。每秒四帧 OCR 采样检查已知隐私片段，并目检联系表、封面及结束画面；不声称像素级绝对隐私保证。逐文件时长、尺寸与 SHA-256 见 `media.json`。

原始 PTY、会话、OCR 全文及能力 URL 不公开。`tools/demo-video/` 仍是早期 UI-only 脚本，不是这两版 TUI 录像的来源。原片制作记录由维护者保存在 Pi Design Studio 录制工程。视频与页面为本项目原创，遵循仓库 MIT；系统字体未打包。
