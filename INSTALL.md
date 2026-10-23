# 安装、升级与卸载

对应源码 0.4.5。当前仍为实验版，真实 Goal 自动恢复和原生面板显示的限制见 [需求检查](docs/VALIDATION.md)。

## 环境

- Windows，使用当前登录的本地用户运行。
- 已安装并登录支持本地插件的 Codex 桌面端。
- Node.js 22+，`node` 和 `npm` 可从 PATH 访问。
- 实验适配：CLI `0.163.0-alpha.10.2`／桌面 `26.1013.4894.0`；CLI `0.163.0-alpha.11.2`／桌面 `26.1016.8622.0`。新版经静态接口及只读连接核对，真实控制仍待独立会话验收。

其他系统、普通 ChatGPT 网页聊天和远程云任务没有验证支持。Node 可跨平台运行不代表桌面控制也可跨平台。

安装结构与本地 marketplace 机制参见 [OpenAI 官方插件打包文档](https://developers.openai.com/plugins/build/plugins)。本文自动安装依赖兼容表中 CLI 的实际行为；新宿主可能需要在插件目录选择本地来源并安装。

优先使用桌面附带的 CLI。脚本搜索 `%LOCALAPPDATA%\OpenAI\Codex\bin\*\codex.exe`，找不到才回退 PATH。如需指定：

```powershell
$env:CODEX_QUOTA_GUARD_CODEX = 'C:\替换为实际位置\codex.exe'
& $env:CODEX_QUOTA_GUARD_CODEX --version
```

不要修改兼容版本配置来绕过检查。桌面包版本无法读取时，doctor 显示 `desktopVersionVerified:false`；这不表示桌面版本已确认兼容。

## 从源码安装（推荐）

从 [GitHub 仓库](https://github.com/DoubleYang168/codex-quota-guard) 下载源码 ZIP 并解压，或克隆源码。进入包含 `package.json` 的项目根目录：

```powershell
node --version
npm run check
npm test
npm run doctor
npm run package
npm run install:local
```

无需安装 npm 依赖。doctor 查询真实额度并写本地诊断，不改变聊天执行状态。若不兼容或桌面连接失败，先解决诊断问题。

打包写入 `dist/latest.json`、插件目录和版本 ZIP。安装脚本注册到当前用户的 Codex，并将数据指向 `<项目目录>\.runtime\user`。已有该目录的 `state.json` 会备份到 `.runtime/install-backups/`。

如需其他稳定位置，在安装前设置 `CODEX_QUOTA_GUARD_HOME` 为绝对路径，后续入口保持一致。安装脚本会把该位置写入安装目录的 `runtime-home.json`。这是机器专用指针，不应共享。

安装后重新加载插件／打开聊天；仍未加载新工具时重启桌面端。输入“使用 quota-guard 打开额度管理页”，按 [README](README.md#第一次使用) 点击“保存设置”和“保存规则”后再选择会话。新安装默认自动控制，升级保留已保存模式。保留源码目录，运行数据仍指向它。

## 从运行发行包安装

运行 ZIP 包含运行文件和说明，不含 `scripts/`、`test/`，因此不能执行源码版的 `npm run install:local`、`npm run check`、`npm run demo` 或 `npm test`。需要这些命令请下载源码包。

1. 解压到稳定目录，保留解压出的 `quota-guard` 文件夹。
2. 对照可信发布页核验 ZIP 的 SHA-256；包内 `SHA256SUMS.json` 用于核验单文件，清单本身不能证明来源可信。
3. 在解压出的 `quota-guard` 根目录执行：

```powershell
$qgCli = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -Recurse -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $qgCli) { throw '找不到桌面 CLI，请手动指定 $qgCli' }
& $qgCli --version
& $qgCli plugin marketplace add (Get-Location).Path --json
& $qgCli plugin add quota-guard@quota-guard-local --json
```

保留输出中的 `installedPath`。如提示 marketplace 已从另一位置添加，先确认旧后台退出、数据已备份，再移除旧注册后添加新位置：

```powershell
& $qgCli plugin marketplace remove quota-guard-local --json
```

4. **首次启动前设置稳定数据目录**，不要把唯一数据留在版本缓存内。替换安装路径，数据可放在保留的解压目录内：

```powershell
$qgInstalledPath = '替换为输出的 installedPath 绝对路径'
$qgDataHome = Join-Path (Get-Location).Path '.runtime\user'
$qgPointer = @{ schema = 1; home = $qgDataHome } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $qgInstalledPath 'runtime-home.json'), $qgPointer)
```

5. 重新加载插件。解压目录里的 CLI 不会读取安装缓存里的指针，从这里操作时设置 `$env:CODEX_QUOTA_GUARD_HOME = $qgDataHome`。

## 数据目录与启停

0.4.0 在管理页的每个会话右侧新增“启动／继续”“停止”和“加入／移出自动监控”。前两个是即时控制，不受观察模式和监控总开关限制；第三个只设置名单。使用旧后台的页面需要重启后台并重新打开管理页，才能加载新接口和按钮。详见 [使用说明](README.md)。

从源码目录操作已安装实例：

```powershell
$env:CODEX_QUOTA_GUARD_HOME = Join-Path (Get-Location).Path '.runtime\user'
node bin/quota-guard.mjs service-status
node bin/quota-guard.mjs ui
```

目录优先级：环境变量 → 当前代码根目录 `runtime-home.json` → 当前代码目录 `.runtime`。不同路径会产生独立后台，不能同时管理同一批聊天。

管理页关闭总开关只停用自动管理。退出后台使用原生面板或：

```powershell
node bin/quota-guard.mjs stop
node bin/quota-guard.mjs service-status
```

`service-status` 不拉起后台；`status`、`ui`、`configure` 会按需启动。`start` 保留保存的启用状态；退出后还需要启用规则。停用和退出均不停止聊天当前任务。

## 升级与回退

1. 退出旧后台，记录数据目录，备份 `state.json` 和需要保留的日志。
2. 新源码运行测试、doctor、打包；明确设置原来的 `CODEX_QUOTA_GUARD_HOME` 再安装。运行 ZIP 按前文注册，并把新安装缓存的指针设为原数据目录。
3. 重新加载插件，先用 `service-status` 检查版本、模式、管理数量，再核对页面。
4. 退出后台时监控已保存为停用，确认后再启用。

同版本同文件跳过重复安装；同版本文件变化时脚本拒绝覆盖，应增加版本号。Windows 可能锁定已加载插件的工作目录；失败时先退出后台并重新加载／重启桌面，再重试。不要删除正在使用的缓存。

CLI 升级可能删除旧版本缓存，不能把唯一数据放在那里。不要移动或删除仍被 `runtime-home.json` 指向的目录。

回退时先退出后台，重新安装已保留的旧包，保持数据目录一致。状态 schema 不兼容时程序拒绝加载，只能在停止状态下使用对应版本的备份，不要直接改 schema 绕过。

## 卸载

卸载前保留源码／解压目录，先退出后台，再移除插件。仅关闭浏览器、停用监控或禁用插件连接，都不能代替退出后台。

1. 在 Quota Guard 控制面板点击 **退出后台**，或在源码／运行包根目录执行以下命令。示例使用源码默认数据目录；自定义目录和旧版安装须替换为实际使用的原数据目录，不要为了卸载创建新目录。

   ```powershell
   $env:CODEX_QUOTA_GUARD_HOME = Join-Path (Get-Location).Path '.runtime\user'
   node bin/quota-guard.mjs service-status
   node bin/quota-guard.mjs stop
   node bin/quota-guard.mjs service-status
   ```

   核对输出中的 `dataDirectory`，最后确认 `running:false`。`service-status` 不会启动后台；若仍为 `true`，先排查数据目录或退出失败问题，不要直接删除运行文件。

2. 在 Codex 桌面端插件管理中移除 Quota Guard。禁用或卸载 MCP 连接不会可靠结束独立后台，因此先完成第 1 步。移除后如仍显示工具，重新加载插件或重启 Codex。
3. 不再使用时，可移除仅供此插件使用的 `quota-guard-local` marketplace 注册。使用安装时的桌面 CLI 执行 `plugin marketplace remove quota-guard-local --json`；不要移除其他插件使用的来源。
4. 数据不会自动删除。源码安装默认保留 `<项目目录>\.runtime\user`；自定义安装以原数据目录为准。重装并保留设置时继续保留该目录；确认不再需要配置、恢复记录和日志后，才手动删除数据目录、源码／解压目录及包文件。删除前再次核对实际路径。

退出和卸载不代表恢复已中断的聊天；需要时先在原聊天手动继续。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 没有插件工具 | 核对安装，重新加载插件／聊天，必要时重启桌面端 |
| 没有原生按钮 | 宿主可能不显示 MCP Apps；使用 `open_dashboard` 或 `ui` |
| 旧网页无法连接 | 用插件或 `ui` 获取新链接；旧页面不能启动后台 |
| 缓存额度不更新 | 检查 `quotaReadAt`；实时查询用 `status`，它会启动后台 |
| 桌面未持有聊天 | 在运行中的桌面端打开目标聊天一次 |
| 100% 后只恢复一个 | 每次恢复重查额度，其他会话仍须满足阈值 |
| `needs_attention` | 检查原聊天，不要反复重发；确认后手动继续或取消记录 |
| 状态文件或令牌错误 | 检查目录、权限和备份；程序不会自动覆盖损坏凭证或状态 |
| 两个入口名单不同 | 对照数据目录，避免源码 `.runtime` 与安装 `.runtime/user` 混用 |

报告问题前脱敏；不要附原始状态、账户信息、会话历史、带凭证 URL 或控制令牌。
