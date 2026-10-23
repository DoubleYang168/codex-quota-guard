# 使用 Git 维护项目

仓库：<https://github.com/DoubleYang168/codex-quota-guard>。本目录是正式 Git 工作区；日常修改、提交和推送都在这里完成。早期未接入 Git 的开发副本不会自动同步，后续以本工作区为准。

## 首次在其他电脑使用

```powershell
git clone https://github.com/DoubleYang168/codex-quota-guard.git
Set-Location codex-quota-guard
git status
```

公开仓库的克隆／拉取通常不需登录；推送需要 GitHub 身份认证。Chrome 已登录不等于 Git 命令行已登录。Windows 推荐使用 Git for Windows 自带的 Git Credential Manager，按首次推送的登录流程完成授权，不要把令牌写进远程 URL、源码或文档。

作者身份与登录凭证是两件事。对本仓库使用已核实的公开隐私邮箱：

```powershell
git config --local user.name dingyang
git config --local user.email 50577327+DoubleYang168@users.noreply.github.com
```

这些命令只影响本仓库，不修改其他项目的全局身份。不要配置你不拥有的账号邮箱。

## 每次开始修改

```powershell
git status
git switch main
git pull --ff-only
git switch -c docs/improve-install-guide
```

分支名按实际工作修改。`pull --ff-only` 遇到分叉会停止，先查看差异，再决定合并方式，不要用强制推送覆盖远程历史。切换或拉取前有未提交改动时，先确认这些改动的归属。

## 检查、提交、推送

```powershell
git diff
npm run check
npm test
git add README.md
git diff --cached
git commit -m "Improve installation documentation"
git push -u origin HEAD
```

`git add README.md` 以修改 README 为例；修改其他文件时使用对应的真实路径。变更所需的测试见 [贡献指南](../CONTRIBUTING.md)。确认暂存内容只包含本次工作，再提交；日常不需要重新初始化或重新关联远程。

推送功能分支后，可在 GitHub 创建 PR，等 CI 通过再合并。个人的小改动也可以直接在干净且已更新的 main 上提交并 `git push`，无需每次网页上传。

## 合并后继续下一次工作

```powershell
git switch main
git pull --ff-only
git status
```

`main` 跟踪 `origin/main`，因此在 main 上通常只需 `git pull --ff-only` 和 `git push`。运行 `git remote -v` 可核对远程地址。

## 什么不应提交

`.runtime/`、`dist/`、`runtime-home.json`、本机凭证和日志已被忽略。每次提交前检查 `git status`、`git diff --cached`，忽略规则不会移除历史中已经提交的秘密。

仓库通过 `.gitattributes` 统一文本换行。早期网页上传保留了部分 CRLF；接入正式 Git 工作流时将这些文本规范为 LF。不要为了隐藏差异而关闭仓库的文本规范化规则。

## 发布与本机插件升级

普通 Git 提交不等于发布新版本，也不会替换已经运行的本机插件。发布前根据 [发布指南](RELEASING.md) 更新版本、验证、打标签和上传发行包；未发布的工作可先放在 CHANGELOG 的 Unreleased 区域。

```powershell
npm run version:set -- 0.4.6
```

版本号仅示例；选择实际下一版本并更新说明，再构建。`git push` 上传源码，不上传被忽略的 `dist/`。Release 安装包需要单独发布。

若从旧开发目录切换到本仓库安装，先退出旧后台，备份并保留原数据目录，安装时沿用相同 `CODEX_QUOTA_GUARD_HOME`；不要直接创建第二个后台接管同一批会话。详见 [安装与升级](../INSTALL.md)。
