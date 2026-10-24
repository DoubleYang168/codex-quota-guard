# MacBook M 系列：安装、升级与卸载

对应源码 **0.4.6**，当前分支 `feat/macos-support`。

> Windows 用户请使用 [Windows 版本（main 分支）](https://github.com/DoubleYang168/codex-quota-guard/tree/main) 和 [Windows 安装说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md)。本文命令在 macOS 终端（zsh／bash）执行。

## 安装前检查

- Apple Silicon（M 系列）MacBook，使用当前登录的本地用户运行。
- 已安装并登录支持本地插件的 Codex 桌面宿主，保持桌面运行。
- 已验证组合：桌面 `26.1016.62342`（build `21477`）、桌面附带 CLI `0.163.0-alpha.11.2`。
- Node.js 22+，`node` 和 `npm` 均在 PATH 中，Node 进程为 `arm64`。无需 `npm install`。

```sh
uname -m
node -p 'process.arch'
node --version
npm --version
```

架构应为 `arm64`。M 系列硬件搭配 Rosetta／x64 Node 不符合控制兼容检查；Intel Mac、其他版本的兼容性见 [兼容性说明](docs/COMPATIBILITY.md)，不要修改版本字段绕过检查。

本分支使用未公开桌面接口，安装成功不等于所有桌面功能均已验收。已有真实控制和隔离安装的证据及剩余边界见 [Mac 验收说明](docs/MACOS.md)。

## 获取正确的源码

使用本 Mac 分支 `feat/macos-support` 的源码或明确标为 Mac 版的源码发行包。仓库默认 `main` 为 Windows 版本；如果 GitHub 页面中尚无 Mac 分支或发行包，说明其尚未发布，不要将默认分支源码当作 Mac 版。

源码根目录应包含 `package.json`、`scripts/`、`src/`，并保留 `.agents/`、`.codex-plugin/`、`.mcp.json` 等点开头的目录和文件。

## 从源码安装（推荐）

进入源码根目录，依次执行：

```sh
npm run check
npm run doctor
npm run package
npm run install:local
```

开发者可在安装前额外运行 `npm test`。无需先安装 npm 依赖。

| 命令 | 作用 |
| --- | --- |
| `check` | 检查公开源码清单、版本和本地文档链接 |
| `doctor` | 只读查询真实账户额度与版本，诊断留在本机，不控制聊天 |
| `package` | 写入 `dist/latest.json`、暂存插件目录、ZIP 和校验值 |
| `install:local` | 注册到当前用户的 Codex 插件环境，保存数据目录指针 |

如果 doctor 报告不兼容或连接失败，先解决问题再安装。安装脚本输出 `installedPath` 和 `dataDirectory`；保留这两个路径。

安装后重新加载插件，需要时重启桌面端，并在新聊天输入 **“使用 quota-guard 打开额度管理页。”**。Mac 新数据目录默认观察模式、空名单。先在专用测试聊天验证，再决定是否开启自动控制。

### 应用不在默认位置

自动发现会检查 `/Applications` 与用户 `~/Applications` 中的 `ChatGPT.app`／`Codex.app`。本机验证的宿主包名为 `ChatGPT.app`；这里管理的是其 Codex 本地会话，不是普通 ChatGPT 网页对话。

存在多个候选或安装在其他位置时，先选择实际正在运行的应用：

```sh
export CODEX_QUOTA_GUARD_APP='/Applications/ChatGPT.app'
npm run doctor
```

如需显式指定桌面附带 CLI，将路径替换为本机实际位置：

```sh
export CODEX_QUOTA_GUARD_CODEX='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
"$CODEX_QUOTA_GUARD_CODEX" --version
```

这些 export 只对当前终端及其子进程生效。插件宿主启动时也必须能使用相同的应用／路径选择，多个候选应在实际宿主环境中消除歧义。CLI 版本与桌面版本必须来自同一兼容组合。

## 从运行 ZIP 安装

运行包不含 `scripts/`、`test/`，不能运行 `npm run install:local`、`npm run check`、`npm run demo` 或 `npm test`。需要这些命令请使用源码包。

1. 核对 Mac 发行包及可信发布页上的 SHA-256，再解压到稳定目录，保留其中的 `quota-guard` 文件夹。包内 `SHA256SUMS.json` 只用于文件一致性，不能单独证明来源。
2. 进入解压出的 `quota-guard` 目录，指定实际桌面 CLI 并注册：

   ```sh
   qg_cli='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
   "$qg_cli" --version
   "$qg_cli" plugin marketplace add "$PWD" --json
   "$qg_cli" plugin add quota-guard@quota-guard-local --json
   ```

3. 保留输出中的 `installedPath`。Mac 新安装默认使用用户 Library 中的稳定数据目录，不将唯一数据留在版本缓存中。
4. 重新加载插件，按 [第一次使用](README.md#第一次使用) 操作。

若 marketplace 提示已从其他位置添加，先退出旧后台、备份原数据，再确认要切换来源，最后移除旧注册并注册新位置：

```sh
"$qg_cli" plugin marketplace remove quota-guard-local --json
```

不要移除其他插件的 marketplace，也不要删除正在使用的插件缓存。

### 运行 ZIP 使用旧数据或自定义目录

旧数据或自定义目录必须继续沿用。将安装输出中的绝对路径填入 `QG_INSTALLED_PATH`，将原数据目录填入 `CODEX_QUOTA_GUARD_HOME`，再写入安装指针：

```sh
export QG_INSTALLED_PATH='/path/to/installed/quota-guard/0.4.6'
export CODEX_QUOTA_GUARD_HOME='/path/to/original-quota-guard-data'
node --input-type=module <<'JS'
import fs from 'node:fs/promises';
import path from 'node:path';
const home = path.resolve(process.env.CODEX_QUOTA_GUARD_HOME);
await fs.access(home);
await fs.writeFile(
  path.join(process.env.QG_INSTALLED_PATH, 'runtime-home.json'),
  JSON.stringify({ schema: 1, home }) + '\n'
);
JS
```

不要把模板中的 `/path/to/...` 原样执行。指针只作用于该安装目录；从其他源码／解压目录使用 CLI 时，也需指定同一个原数据目录。机器专用指针不应提交到仓库或分享。

## 数据目录与后台启停

Mac 新安装默认：

```text
~/Library/Application Support/Codex Quota Guard/
```

目录选择优先级为：

1. `CODEX_QUOTA_GUARD_HOME` 环境变量。
2. 当前代码根目录的 `runtime-home.json`。
3. 已有源码 `.runtime/user/state.json` 或 `.runtime/state.json` 对应的数据目录。
4. 上述用户 Library 默认目录。

源码安装会在 `.runtime/installation.json` 记录安装结果，并把实际数据目录写入安装缓存中的 `runtime-home.json`。升级不会自动迁移旧状态；保留原目录。不同数据目录意味着不同后台，不能让两个实例控制同一聊天。

使用默认数据目录时，在对应代码目录执行：

```sh
node bin/quota-guard.mjs service-status
node bin/quota-guard.mjs ui
```

自定义或旧数据目录先指定原路径：

```sh
export CODEX_QUOTA_GUARD_HOME='/path/to/original-quota-guard-data'
node bin/quota-guard.mjs service-status
```

`service-status` 不拉起后台；`status`、`ui`、`configure` 会按需启动。关闭网页不退出后台，停用监控不停止聊天，退出后台也不停止当前聊天任务。

## 升级与回退

1. 退出旧后台，记录并备份原数据目录中的 `state.json` 和需要保留的日志。
2. 使用新版 Mac 源码执行检查、doctor 和打包；显式设置原 `CODEX_QUOTA_GUARD_HOME` 后安装。运行 ZIP 则把新安装指针写回原数据目录。
3. 重新加载插件，用 `service-status` 核对版本、数据目录、模式和管理数量。
4. 退出后台会把监控保存为停用，确认配置后再启用。

同版本同文件可跳过重复安装；同版本文件不同会拒绝覆盖。开发分支的随包文件仍可能变化，正式升级应使用维护者分配的新版本，避免覆盖正在使用的缓存。

回退时重新安装已保留的旧包，保持原数据目录。状态 schema 不兼容时在停止状态下使用相应备份，不要修改 schema 绕过校验。

## 卸载

先退出后台，再移除插件，最后才决定是否删除数据。仅关闭网页、停用监控或禁用插件连接，都不能代替退出后台。

1. 从对应代码目录执行下面命令；自定义或旧数据目录先设置原 `CODEX_QUOTA_GUARD_HOME`，不要为了卸载创建新目录。

   ```sh
   node bin/quota-guard.mjs service-status
   node bin/quota-guard.mjs stop
   node bin/quota-guard.mjs service-status
   ```

   核对输出中的 `dataDirectory`，最后确认 `running:false`。如果仍在运行，先排查目录或退出失败原因。
2. 在 Codex 桌面插件管理中移除 Quota Guard，需要时重新加载插件或重启桌面端。
3. 不再使用时，可用安装时的桌面 CLI 移除仅供本插件使用的 `quota-guard-local` 注册。
4. 数据默认保留。确认不再需要配置、恢复记录和日志后，才删除原数据目录、源码／解压目录和包文件。

卸载不会自动继续已暂停的聊天；需要时在原聊天手动继续。插件不创建 LaunchAgent、系统服务或开机启动项。

## 常见问题与进一步阅读

- 无工具、Rosetta、多个应用候选、状态不一致等问题见 [常见问题](docs/TROUBLESHOOTING.md)。
- CLI、模式和恢复状态见 [使用手册](docs/USAGE.md)。
- 实际测试方法、隔离安装与未覆盖范围见 [Mac 适配与验收](docs/MACOS.md)。
- Windows 步骤请跳转 [Windows 安装说明](https://github.com/DoubleYang168/codex-quota-guard/blob/main/INSTALL.md)。

报告问题前脱敏，不附原始账户信息、聊天历史、带凭证 URL 或控制令牌。
