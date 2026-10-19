# 伴屏 AI Companion Screen

先开发 Windows 电脑常伴 Agent：安静待机、理解授权画面、延续用户确认的记忆、执行受限任务，并在有实际进展时反馈；随后把同一个角色与工作画布延伸到联想 Android 平板。

仓库：[qilinbro/ai-companion-screen](https://github.com/qilinbro/ai-companion-screen)

## 当前状态

当前为 v0.2 文档验收阶段，按用户要求发布本轮方案文档。首次检查远程仓库为空；目前只有 Markdown，没有客户端代码、工程依赖、可执行命令或已验证产品功能。

用户已确认主要参考 Meta Muse 与 New Computer Dot。前者用于参考持续目标与 Agent 协作，后者用于参考记忆与陪伴；公开资料不等于本项目实现，Dot 作为已公布停运的历史产品参考。

## 阅读入口

- [电脑客户端完整方案](docs/01-desktop-companion.md)
- [当前开发基线与验收入口](docs/00-plan-and-acceptance.md)
- [Muse / Dot 功能核实与借鉴边界](docs/02-product-references.md)
- [开发约束](AGENTS.md)
- [第三方使用记录](docs/third-party.md)
- [历史 v0.1 方案，已被替代](docs/archive/00-plan-v0.1.md)

## v0.2 开发顺序建议

1. Windows 客户端、待机角色、单工作画布、托盘与手动记忆管理。
2. 真实模型对话、授权画面理解与跨会话记忆使用。
3. 受限 Agent 工具、目标跟进与克制的后台反馈。
4. 真实语音输入、回复与打断。
5. 局域网平板、实际跨屏验收、梦游模式与联想设备/Android 适配。

电脑优先是本轮定位调整；Agent 提前于语音是待验收的顺序建议。角色和存储基础不能称为已完成常伴 Agent，桌面自测也不能替代真电脑与真平板之间的跨屏验收。

## 启动与验证

现在用 Markdown 阅读器打开文档即可。没有 package.json，不能执行 npm 启动应用。未来实现时提供经过实际执行的安装、开发、构建、Windows 打包与对应阶段验证步骤。

模型密钥仅保存在受信任电脑运行时；不进入前端、源码、日志或 Git。厂商接口与比赛要求待官方资料核实，浏览器演示不等同于完成桌面程序或 Android 平板安装适配。
