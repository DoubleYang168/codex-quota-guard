# 维护者发布指南

作者：dingyang。已确认的 GitHub 个人账号：`DoubleYang168`。目标仓库：`DoubleYang168/codex-quota-guard`。本目录准备并不创建仓库、不推送代码、不发布 Release。

## 目录与版本

这是可独立使用的仓库根目录，不需要父目录的源码或运行数据。不要把父目录整体上传。保留点开头的插件清单与 `.github` 配置。

0.4.5 对 0.4.4 做开源文档／工具整理，运行逻辑保持一致。随包文件变化采用新版本，避免当前用户的同版本缓存冲突。以后统一修改版本：

```powershell
npm run version:set -- 0.4.6
```

该命令只支持不带前缀的三段数字版本，会同步插件清单、Node 包、运行版本、面板和当前文档位置；历史 CHANGELOG 不改。手动补充新版本记录，确认差异后再构建。

## 发布前检查

1. 检查 LICENSE 与 NOTICE，保留参考来源。不要加入第三方应用、安装包、私有数据库、研究源码。
2. 完整真实 Goal 验收未完成时保持实验说明，将 GitHub Release 设为 Pre-release。
3. 人工检查源码、文档、截图和样例；截图只用模拟数据。默认数据、控制凭证、诊断和本机路径不得公开。
4. 在仓库根目录执行：

```powershell
npm run check
npm test
npm run package
npm run verify:release
npm run package:source
```

需要 Node.js 22+ 与 Python 3。`check` 是启发式检查，不能发现一切秘密。打包使用白名单；运行包与源码包各有 SHA-256 旁文件。ZIP 校验检查 CRC、文件清单、哈希和源码对应关系。

5. 在解压出的源码 ZIP 上再次执行 check、测试和构建，确认不依赖原目录。这里不要运行真实安装脚本，除非明确要更改操作者本机插件。
6. 有桌面 CLI 时运行 `node scripts/validate-package.mjs`，其隔离安装不代替宿主 UI 和真实 Goal 验收。

## GitHub 社区配置

仓库创建后启用 Issues；Issue 和 PR 模板已提供。Security 中启用 Private vulnerability reporting 后，`SECURITY.md` 的首选渠道才可用；未启用时不接收公开漏洞细节。GitHub Actions 的首次运行需在仓库中实际确认结果，不预先声称通过。

建议仓库简介：`Local quota monitoring and pause/resume for selected Windows Codex desktop chats.`

建议 Topics：`codex`、`mcp`、`windows`、`quota`、`nodejs`。无需先发布 npm 包，不会自动上架官方公共插件目录。

## 首次提交与发布

只在本开源根目录初始化仓库。下面是维护者审核后手动执行的命令，不会被打包脚本执行：

```powershell
git init -b main
git add .
git status --short --untracked-files=all
git diff --cached --stat
git diff --cached
```

先核对 `git ls-files`：不得含 `.runtime/`、`dist/`、运行指针或私密配置。忽略规则不会消除已跟踪文件或历史数据。Git 作者身份自行配置，不根据 GitHub 用户名推测邮箱。

在 GitHub 使用账号 DoubleYang168 创建名为 codex-quota-guard 的空仓库；确认公开内容后提交并推送。目标 URL 只有在仓库创建后才实际可用，不应把未创建地址当成安装验证成功。

```powershell
git commit -m "Prepare experimental open-source release 0.4.5"
git remote add origin https://github.com/DoubleYang168/codex-quota-guard.git
git push -u origin main
git tag -a v0.4.5 -m "Experimental 0.4.5"
git push origin v0.4.5
```

标签命令对应本次版本；之后使用实际版本。不要覆盖已经公开的标签。当前提供自动校验 workflow，不提供自动推送／自动 Release workflow，发布需要维护者实际选择内容。

GitHub 创建 Pre-release，附以下文件（名称中的版本以实际构建为准）：

- `codex-quota-guard-0.4.5.zip`：运行插件包，含运行文件与说明，无开发测试／安装脚本。
- `codex-quota-guard-0.4.5.zip.sha256`：运行包外部校验值。
- `codex-quota-guard-source-0.4.5.zip`：清洁源码包，含脚本、测试和社区配置。
- `codex-quota-guard-source-0.4.5.zip.sha256`：源码包校验值。

GitHub 自带 Source code ZIP／tar.gz 基于公开标签，也可用于源码安装。发布说明基于 [模板](RELEASE_NOTES.md) 及实际验证填写。不要上传 `dist/latest.json`、整个 build 目录、`.runtime` 或未经脱敏的验证日志，它们可能含本机绝对路径与账户／会话信息。

## CI

`.github/workflows/ci.yml` 在 Windows、Node 22／24 上执行 check、单元测试、构建、ZIP 和源码归档校验。Python 仅参与维护校验。不安装真实 Codex，不登录真实账户，不做真实会话控制。上传的 CI artifacts 只有清洁发行包和 SHA-256 文件。

## 发布后维护

验证 GitHub 展示的图片、相对链接与 Action 结果；从 Release 下载到干净目录核对 SHA-256 后安装。适配新 CLI／桌面版本时补充协议审阅、模拟回归与真实验收状态。不要只改版本白名单。
