# Muse / Dot / OpenAI Dots 功能参考与核实边界

更新：2026-10-20（Asia/Shanghai）。2026-10-19 的 Meta Muse 与 New Computer Dot 参考保留在下文，属于早期历史。用户本轮提供了明确网址，确认希望参考 **OpenAI Dots**，范围为完整交互 Demo 加可用本地功能。本文件区分公开资料、本项目设计与实现状态，不是对参考产品的实测评价。

本次对话最终已收敛为极简宠物、折叠输入及模型按需使用屏幕工具；需求演变、实现和未完成项见[对话总结](05-session-summary-2026-10-20.md)。下述产品资料与中途 Demo 场景不等于当前全部功能已开放。

## 本轮确认：OpenAI Dots

用户提供的 [OpenAI Dot 功能介绍](https://blog.csdn.net/aidoudoulong/article/details/166886570) 指向 OpenAI 的常驻代理 Dots，单个称 dot；它与下面的 New Computer Dot 是不同产品。博客用于确定用户所指产品，功能核对以官方文档为主。套餐、开放范围与客户端版本不照搬博客结论。

- [官方概览](https://learn.chatgpt.com/docs/dots)：持续协作、研究与任务结果反馈。
- [消息与渠道](https://learn.chatgpt.com/docs/dots/channels)：语音、ChatGPT、Slack 与 Teams；联系渠道和应用访问分别管理。
- [任务与记忆](https://learn.chatgpt.com/docs/dots/tasks-and-memory)：后台代理、持续事项、活动与定时任务。
- [电脑与应用](https://learn.chatgpt.com/docs/dots/computers-and-apps)：云电脑、本机接入、浏览器接管与连接的应用。
- [控制](https://learn.chatgpt.com/docs/dots/controls)：查看结果、设置行动边界、暂停与停止。
- [Space 中的代理](https://learn.chatgpt.com/docs/space/agents)：通过页面、评论或旁侧对话请求起草与修订。

本轮中途曾把这些类别转成 10 个交互场景：翻译、报错、研究、持续跟进、电脑接管、多渠道、Space、语音、文件、日常协作，并制作过本地资料和示例面板。随后按用户要求简化为当前宠物、折叠输入和单画布，旧面板代码保留不代表当前默认入口仍开放这些功能。主屏 PNG 现在是真实工具，兼容模型链路已实现并通过受控测试；尚未使用用户实际模型服务验收效果。语音、终端和外部账户仍没有本轮真实接入。翻译和报错来自本项目需求，不是官方逐项功能清单。具体当前范围见[本轮 Demo](04-dot-demo.md)。

本项目不使用 OpenAI Dots 品牌形象或官方角色；保留用户要求的本机原角色动画，正式构建使用原创回退。没有接入 Dots 服务、云电脑、账号或私有接口。

### 主题研究与设计工具

- [Radix Themes Color](https://www.radix-ui.com/themes/docs/theme/color)：参考中性色阶、文本对比与界面层次；没有安装 Radix 或复制其组件。
- [Raycast Search Bar](https://manual.raycast.com/search-bar)：参考清晰的单一输入入口；不是复制 Raycast 的搜索功能或界面资产。
- [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)：本轮已全局安装并使用本地设计查询，作为开发 Skill；按项目黑白暖灰宠物主题选择建议，不照搬落地页或默认蓝色方案。安装和许可证记录见 [第三方记录](third-party.md)。

## 1. Meta Muse（早期参考）

### 已查到的官方说明

- [Meta 产品发布说明](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)：2026-09 发布，介绍个人目标、任务执行、上下文记忆及用户控制访问范围。官方所述专属云端虚拟机与连接服务不等于本项目具备同样基础设施或接口权限。
- [How We Designed Muse](https://introducing.muse.ai/)：2026-09 的设计文章介绍持续对话、后台任务、选择值得通知的变化、个性化角色、可查看的活动与权限、可阅读编辑的记忆，以及丰富产物。文章也提到主聊天、侧聊天、Goals/Ideas 等界面。

以上是产品方公开介绍，不足以证明所有任务都能成功，也不是本项目接入 Meta 模型、Muse API、角色或连接器的许可。部分页面包含继续推出的规划，不能统一认定为已经可用。本方案不依赖其地区、套餐或厂商接口。

### 本项目拟借鉴

- 用户先说目标，角色能在已有授权内制定步骤并实际跟进；步骤与结果有来源。
- 用户收起画布不必一直盯着任务，但知道应用是否仍在运行，以及如何停止。
- 完成、重要变化或需要输入时再提醒，普通过程留在当前画布。
- 记忆、活动与权限可检查，结果可直接复制或使用。

### 本项目不直接移植

不复制多聊天/目标/灵感常驻页面，不承诺并行处理很多任务，不默认建立云端常驻虚拟机、任意终端、支付、邮件或全应用控制。上述能力日后若引入，需独立设计、授权与验收。

## 2. New Computer Dot（历史参考，与 OpenAI Dots 不同）

### 已查到的官方说明

- [历史产品页](https://new.computer/dot)：将 Dot 定位为理解用户、提供个性化建议的个人 AI。
- [隐私政策](https://new.computer/privacy)：更新时间为 2024-04-30，介绍笔记、图像、音频、文件、链接等输入，以及重要人物/地点/日期和个性化信息使用。邮箱、日历访问需要授权。
- [Your Data](https://new.computer/your-data)：历史数据说明包括撤销额外访问、云端存储与数据控制的官方承诺。这不是本项目的数据政策，也不能代替对未来模型提供者的核实。
- [官网停运公告](https://new.computer/)：确认关闭 New Computer 和 Dot，并曾提供数据下载安排。本项目将其作为历史设计参考，不把旧页面下载入口描述为仍在运营。

本次查到的资料不能证明 New Computer Dot 具有授权主屏观察、鼠标键盘控制、代码修复或受限目录工具。它也不是同名的 Mac 操作 Agent；不得把两个 Dot 的功能拼接成一个产品。

### 本项目拟借鉴

- 对话能延续用户确认的偏好、项目背景与未完成事项。
- 多模态输入先服务当前任务，是否变为长期记忆要另行确认。
- 保持稳定而克制的角色表达，相关时提供帮助；不把宣传中的“理解用户”解释为读取未表达的心理活动。
- 用户可修改、删除、导出记忆；可关闭主动交互，不以关系连续性锁定用户数据。

这里的条目级来源、更新时间、删除后缓存失效和本地优先存储是本项目自己的具体要求，不能写成 Dot 拥有完全相同界面的事实。记忆效果需真实跨会话验收，不使用“无限、永不忘记”等承诺。

## 3. 早期转化为伴屏自己的产品要求

Muse 提供目标持续推进的参考，Dot 提供个性化连续性的参考；本项目结合原始跨屏要求，把它们转为“可管理的背景 + 受限执行 + 克制的主动反馈 + 角色与单画布”。

屏幕翻译、报错分析、Windows 角色小窗、联想平板副屏与梦游模式来自本项目需求，不能归为已核实的 New Computer Dot 功能。新的桌面技术选型也不来自对 Muse 源码或架构的复刻。

## 4. 工程边界的官方依据

- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)：渲染层隔离、沙箱、CSP、IPC 发送方验证和限制桥接能力。需要结合锁定版本落实并验证。
- [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)：桌面来源枚举与捕获接入；本产品必须另做用户明确选择，不能照搬默认取第一个屏幕的示例。
- [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)：提供 Windows 锁屏与电源事件；应用是否按要求停止观察仍须实测。
- [W3C Secure Contexts](https://w3c.github.io/webappsec-secure-contexts/)、[Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)：后续平板麦克风安全上下文与 localhost 例外的边界。

## 5. 来源与引入状态

2026-10-19 的参考核实仅阅读并链接公开资料，没有引入这些参考产品的代码、角色、模型权重、SDK 或连接器。2026-10-20 新增 OpenAI Dots 公开资料引用与开发设计 Skill，具体引入记录见 [third-party.md](third-party.md)。没有声称取得 Muse、New Computer Dot、OpenAI Dots 或联想品牌授权；公开功能介绍不等于同等服务接口或素材使用许可。

2026-10-20 本轮已执行类型与构建检查、Windows 源码/便携启动、原生拖动及受控屏幕/模型协议链路检查，动作联动另有受控前端验证；证据和未验收项见[Demo 验证状态](04-dot-demo.md#当前验证状态)。这些结果证明相应本地能力与协议流程，不是对 OpenAI Dots 服务、云电脑、外部应用或用户真实模型效果的验收。
