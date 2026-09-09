# npm Trusted Publishing

发布使用 GitHub Actions 的短期 OIDC 身份，不依赖本机 npm login，也不配置 NPM_TOKEN。只有 GitHub 托管 runner 适用；本项目保留 macOS 验证范围。

## 一次性 npm 绑定

由 npm 包维护者在 `https://www.npmjs.com/package/pi-design-mode/access` 的 Trusted publishing 设置中选择 GitHub Actions，填写：

- Organization or user：`liush2yuxjtu`
- Repository：`pi-design-mode`
- Workflow filename：`publish.yml`，不要包含目录
- Environment name：`npm`
- Allowed actions：允许 `npm publish`，不能只有 `npm stage publish`

界面入口可能显示在包 Settings 中。npm 不在保存时验证配置，真实发布成功后才能声称绑定可用。既有 Token 权限不会被本工作流修改；如需撤销，需另行确认。

## 发布保护

- 工作流只接受手动 `workflow_dispatch`，默认仅验证，真实发布必须明确勾选 `publish`。
- 工作流要求从 canonical repository 的 main 运行。
- GitHub `npm` environment 配置为只允许 main 分支部署。
- 标签必须符合 `v数字.数字.数字`，指向 main 历史中的提交，且与 package.json 版本一致。
- 发布串行执行，不取消正在运行的发布。
- 仅发布 job 有 `id-token: write`；仓库权限为只读。
- Node 24、npm >=11.5.1，发布不使用依赖缓存。先安装、测试、打包，再通过 OIDC 发布 tarball 和 provenance。

主分支和工作流写权限仍需按仓库协作政策管理。这不是对有主分支写权限者的安全沙箱。

## 执行

先检查合并后的 tag 和测试结果，再从 main 发起：

```bash
gh workflow run publish.yml --ref main -f tag=v0.2.0 -f publish=false
```

仅验证通过后，在 npm 首次绑定已经保存且用户批准发布的前提下：

```bash
gh workflow run publish.yml --ref main -f tag=v0.2.0 -f publish=true
```

真实发布后核对 npm registry 的版本、integrity、provenance 和干净安装。仅验证成功不证明 OIDC 信任配置正确。已发布版本不可重复发布，下一版需新版本号和标签。

若发布成功但索引尚未刷新，不要重新发布。工作流对暂时的 404/429/5xx 最多查询 8 次；仍未就绪时可独立运行：

```bash
gh workflow run publish.yml --ref main -f tag=v0.2.0 -f publish=false -f verify_only=true
```

此模式不会执行 npm publish，验证公开版本与下载包的 SHA-512。

官方依据：[npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)。
