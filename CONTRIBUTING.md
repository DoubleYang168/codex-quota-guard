# 贡献指南

欢迎提交文档、测试和兼容性修复。请先阅读 [架构](docs/ARCHITECTURE.md)、[兼容性](docs/COMPATIBILITY.md) 和 [隐私](docs/PRIVACY.md)。沟通请围绕可复现事实，尊重其他贡献者，不公开个人信息。

第一次使用 Git 维护本项目时，参照 [Git 工作流](docs/GIT_WORKFLOW.md)。

## 开发环境

Node.js 22+，Windows 为桌面控制目标；无需 `npm install`。Python 3 仅用于 ZIP 校验及源码归档。建议在 PowerShell 使用 UTF-8。

```powershell
npm run check
npm test
npm run demo
```

`check` 检查清单版本、本地文档链接和常见敏感信息特征。测试用模拟适配器和项目内隔离数据，不停止或恢复真实聊天。demo 只操作模拟会话，Ctrl+C 退出。

## 修改与验证

- 保持 JavaScript ES Modules 和现有轻量实现；新增依赖前说明必要性及许可。
- 影响暂停、恢复、身份校验、并发、持久化或错误处理时，增加能覆盖实际风险的回归测试。
- UI 变更用模拟页面验证常规与窄屏，并使用模拟数据截图。
- 同步 README、使用说明、版本清单和 CHANGELOG。`npm run version:set -- 0.4.6` 可统一版本位置；示例版本仅演示用法。
- 不通过删身份／队列／不确定性检查来“修复”控制失败，不把模拟成功写成真实 Goal 验收成功。

发布前还需 `npm run package`、`npm run verify:release`，详情见 [发布指南](docs/RELEASING.md)。运行文件或随包文档变化需要新版本，避免覆盖已安装的同版本不同内容。

## Pull Request

描述具体触发条件、改动后的行为、验证方法和剩余限制。涉及私有协议时附脱敏的协议差异与测试证据，不上传完整安装程序、原始聊天、私有数据库或第三方研究源码。贡献按本仓库 MIT 许可证提供，保留第三方要求的归属。

## 真实环境验证

不在自动 CI 中登录真实账户或控制真实会话。需要真实控制时，用单独测试会话、可中断任务和明确的操作者授权；先观察，再开启自动控制，结束后退出测试后台。不要拿正在交付的工作做验收。

公开 Issue 只提交脱敏信息。漏洞遵循 [安全报告](SECURITY.md)。维护者不承诺固定响应时间。
