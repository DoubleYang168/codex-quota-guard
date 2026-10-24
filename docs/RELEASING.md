# MacBook M 系列版发布指南

目标仓库：`DoubleYang168/codex-quota-guard`。Mac 工作基线为 `feat/macos-support`；[Windows 版本维护在 main](https://github.com/DoubleYang168/codex-quota-guard/tree/main)。本文只说明维护步骤，不执行推送、发布或本机安装。

## 确认平台、版本和验收证据

1. 确认处于 Mac 目标分支，README／INSTALL 为 Mac 说明，Windows 跳转链接正确。
2. 版本目前为 0.4.6；正式发行时，随包文件变化需要新版本，避免已安装缓存出现同版本不同内容。
3. 保留实验版说明，使用 Pre-release，并在发行标题标明 **macOS Apple Silicon／M 系列**。
4. 区分真实控制、受控恢复条件、隔离安装和自动化测试；不得将它们描述成真实额度重置或当前用户环境的完整安装验收。证据见 [Mac 验收](MACOS.md)。

统一设置下一版版本号，例如：

```sh
npm run version:set -- 0.4.7
```

0.4.7 只是下一版本的示例。命令会同步清单、运行版本、面板和当前文档位置；维护者还需更新 CHANGELOG 和发行说明，不修改历史记录来冒充新证据。

## 构建与检查

需要 Node.js 22+；归档校验和源码导出需要 Python 3。macOS 上可直接调用 `python3`：

```sh
npm run check
npm test
npm run package
python3 scripts/verify-release.py
python3 scripts/package-source.py
```

- 检查 LICENSE／NOTICE，保留第三方归属。
- 截图只使用模拟数据，人工检查文档、样例、清单和发布文件。
- 不上传 `.runtime/`、本机指针、诊断、完整聊天、账户数据、访问凭证、第三方应用包或私有数据库。
- 使用白名单生成源码 ZIP，核对运行包／源码包的 CRC、SHA-256 和源码一致性。
- 在源码 ZIP 的独立解压目录再次检查和构建，确认不依赖开发机数据。

有兼容桌面 CLI 时，可执行隔离插件注册和工具发现：

```sh
node scripts/validate-package.mjs
```

该脚本使用独立 `CODEX_HOME`，不替换当前用户插件。隔离注册和工具发现不能代替日常桌面环境的安装后使用验收。

## 推送分支、标签和发行包

先审核暂存文件及目标提交。只有明确准备发布时，维护者才执行推送；不要重新初始化现有仓库，也不要推送到错误的 Windows 分支。

```sh
git status
git branch --show-current
git push -u origin feat/macos-support
```

创建一个未使用的标签并确认它指向实际发布提交。标签应与发行包版本对应，不覆盖已公开标签。GitHub Release 选择正确标签，标题注明 Mac M 系列，设置 Pre-release，正文参考 [发行说明](RELEASE_NOTES.md)。

以当前 0.4.6 的文件名为例，上传：

- `codex-quota-guard-0.4.6.zip`：运行包，不含开发测试和安装脚本。
- `codex-quota-guard-0.4.6.zip.sha256`：运行包校验值。
- `codex-quota-guard-source-0.4.6.zip`：源码包，含脚本和测试。
- `codex-quota-guard-source-0.4.6.zip.sha256`：源码包校验值。

运行包文件名本身不区分平台，发布标题、标签目标和正文必须明确是 Mac 分支产物。不要直接从 Windows `main` 下载包并标为 Mac 版本。发行页应提供 [Windows 分支链接](https://github.com/DoubleYang168/codex-quota-guard/tree/main)。

不要上传 `dist/latest.json`、整个 build 目录或原始验证日志。GitHub 自带源码 ZIP／tar.gz 来自其标签提交，也必须确认标签对应 Mac 代码。

## CI 与发布后检查

`.github/workflows/ci.yml` 配置 Windows／macOS 和 Node 22／24 的检查、测试、构建和归档验证。配置存在不等于已在 GitHub 运行成功；以实际 Action 结果为准。CI 不登录真实账户、不安装真实桌面、不控制真实聊天。

发布后检查分支页面、图片、相对链接和 Windows 跳转；从发行页下载到独立目录核对 SHA-256。正式安装前说明它会修改当前用户插件注册，保留原数据目录。不要把 GitHub 公开、本地安装和上架官方插件目录混为一谈。
