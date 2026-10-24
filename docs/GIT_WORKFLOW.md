# Mac 分支的 Git 工作流

仓库：[DoubleYang168/codex-quota-guard](https://github.com/DoubleYang168/codex-quota-guard)。Mac 开发分支为 `feat/macos-support`；[Windows 版本位于 main](https://github.com/DoubleYang168/codex-quota-guard/tree/main)。文档、安装包和发布标签需要对应同一平台分支。

## 获取 Mac 源码

如果已经有本地 Mac 工作区，先用 `git status` 和 `git branch --show-current` 确认位置，不需要重新克隆。

下面的克隆命令只在维护者已将 Mac 分支推送到 GitHub 后可用；如果找不到远程分支，不要用 `main` 替代：

```sh
git clone --branch feat/macos-support --single-branch https://github.com/DoubleYang168/codex-quota-guard.git
cd codex-quota-guard
git status
git branch --show-current
```

公开仓库的读取通常不需要登录，推送需要 GitHub 身份认证。浏览器登录和 Git 命令行认证是两件事。使用自己的 Git 作者身份，不要将令牌写进远程 URL 或文档。

## 开始修改

先确认工作区的未提交变化属于谁，再切换分支。已有 Mac 远程分支且可以快进时：

```sh
git status
git switch feat/macos-support
git pull --ff-only origin feat/macos-support
git switch -c docs/improve-macos-guide
```

主题分支名称按实际任务调整；只在明确需要新分支时创建。Mac 分支尚未发布、只有本地提交时，跳过远程拉取，继续在本地 Mac 基线工作。

不要默认切到 Windows `main` 再修改 Mac 文档。遇到分叉先检查差异，不通过强制推送覆盖远程历史。

## 检查与提交

```sh
git diff
npm run check
git add README.md
git diff --cached
git diff --cached --check
git commit -m "docs: improve Mac installation guide"
```

以 README 为例暂存，实际提交只加入属于本次工作的文件。文档变更执行源码／链接检查；影响运行逻辑的变更按 [贡献指南](../CONTRIBUTING.md) 运行相关测试。

明确准备发布主题分支时再推送：

```sh
git push -u origin HEAD
```

Git 提交和推送不会安装插件，也不会上传被忽略的 `dist/`，更不会自动创建 Release。向哪个目标分支提交 PR，需要按此次变更的平台范围选择；不要把 Mac 分支专用文档直接当作 Windows 的安装说明。

## 不应提交的内容

`.runtime/`、`dist/`、`runtime-home.json`、本机环境变量、凭证和原始日志不进入源码。提交前检查 `git status` 与 `git diff --cached`；忽略规则不会删除已提交过的秘密。

仓库使用 `.gitattributes` 统一文本换行，不要关闭换行规范来隐藏差异。

## 本机安装与版本发布

运行 `npm run package` 只生成本地产物。安装到当前用户环境需要显式执行 `npm run install:local`；发布到 GitHub 需要单独推送、打标签和上传发行包，见 [Mac 发布指南](RELEASING.md)。

如果从旧开发目录切换到当前工作区安装，先退出旧后台，备份并沿用原 `CODEX_QUOTA_GUARD_HOME`，避免两个后台控制同一聊天。步骤见 [安装与升级](../INSTALL.md)。
