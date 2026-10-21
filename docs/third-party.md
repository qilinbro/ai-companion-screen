# 第三方来源与使用记录

更新：2026-10-21。当前为 v0.2 Windows 桌面伙伴，新增同机画布显示器选择、全屏和模型连接检测。用户自行配置兼容服务，项目不附带服务密钥或模型权重。本轮未新增运行依赖。

## 依赖与平台

版本由 `package-lock.json` 锁定，本轮未新增大型 AI 聊天组件库或模型 SDK。

- Electron **44.9.1**，MIT：窗口、托盘、全局快捷键、隔离桥接、`desktopCapturer` 和系统安全存储。
- React / React DOM **19.3.1**，MIT：原角色、输入、设置与流式画布。
- Vite **8.3.4**、`@vitejs/plugin-react` **6.1.2**，MIT：开发与构建。
- TypeScript **5.9.3**，Apache-2.0：类型检查和主进程编译。
- `@types/node` **24.19.2**、`@types/react` **19.3.0**、`@types/react-dom` **19.3.0**，MIT：开发类型。

主进程使用运行时自带网络能力向用户配置的 OpenAI-compatible Chat Completions 服务请求流式回复与工具调用。具体服务由用户选择；本项目不因此获得服务访问资格或包含调用额度。远程服务使用 HTTPS，本机兼容服务可使用受限 loopback HTTP。

密钥由主进程使用，选择持久化时经系统安全存储加密，无明文回退。屏幕外发需本次运行授权，仅发送到配置的服务。对话与原图不默认落盘；没有 OCR、终端执行、模型权重、语音或真实外部应用连接。

## 视觉参考与技能

仅参考下列官方组件的视觉模式，自行实现轻量黑白动画；没有复制其源码、安装整库或将其作为运行依赖。

- [assistant-ui](https://github.com/assistant-ui/assistant-ui)，[MIT](https://github.com/assistant-ui/assistant-ui/blob/main/LICENSE)：参考 [Dot Matrix](https://www.assistant-ui.com/design/components/dot-matrix) 的单色状态动效、减弱动画和状态语义。
- [Vercel AI Elements](https://github.com/vercel/ai-elements)，[Apache-2.0](https://github.com/vercel/ai-elements/blob/main/LICENSE)：参考 [Shimmer](https://elements.ai-sdk.dev/components/shimmer) 的轻微等待节奏，不复制具体实现。
- 已安装的 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)，MIT，本机位置 `~/.agents/skills/ui-ux-pro-max`：聚焦查询 AI streaming/loading，采用真实状态反馈和流式呈现建议；此前 CLI helper 下载未完成，已安装本地文件用于查询。web-motion-design 用于 CSS 透明度、动效时长等开发建议。技能不加入应用包。
- v0.2 使用本机 Impeccable 的界面完善流程和 Vercel React 性能建议；这些开发技能不作为应用运行依赖，也不进入便携包。回复排版使用 React 文本节点实现受限 Markdown，不引入 HTML 渲染或第三方聊天库。

[Radix 色阶](https://www.radix-ui.com/themes/docs/theme/color)、[Raycast 输入入口](https://manual.raycast.com/search-bar) 及[历史产品研究](02-product-references.md)保留为早期参考，不表示软件或云服务已经接入。本项目不连接 OpenAI Dots、ChatGPT Work、Codex 或 Space 云服务。

官方技术依据：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[桌面捕获](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[全局快捷键](https://www.electronjs.org/docs/latest/api/global-shortcut)。

窗口依据：[BrowserWindow 全屏与窗口接口](https://www.electronjs.org/docs/latest/api/browser-window)、[窗口样式及透明窗口限制](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)。实际平台表现以本轮 Windows 证据为准。

## 验证与分发

v0.2 本轮结果以 [实现与验收记录](06-v0.2-implementation.md)为准。下述为上轮历史记录。

本轮完整构建通过（生产渲染 27 个模块）、23 项运行时夹具通过，静态设计检查未报项。受控本地 SSE 服务的 Windows 原生 UI 链路已验证两次请求、工具请求、图片接收与 PNG 有效性。该测试夹具不做真实模型推理，不是识图或分析质量证据；新版便携验证状态见 [当前验证状态](04-dot-demo.md#当前验证状态)。便携包保留 Electron 与白名单依赖许可证，不含安装器或代码签名。

## 本机学习角色

`vendor/grok-study/` 来自外部上传包 `grok-icon-study.7z`（SHA-256 `24c3f9d1…`），为 Grok Bot 登录页角色的学习复刻。上游 README 声明素材归 xAI / 相应权利人所有，仅供学习参考、不许商用或再分发，且没有 LICENSE。

用户要求保留原动画，因此仅在本机开发加载；素材不提交、不构建、不打包、不用于提交物，正式构建使用原创 DotPet。来源与移除清单保留在被忽略的本地声明，不使用原图标或抽取几何数据制作原创素材。

项目自身开源许可证尚未选择。依赖许可证和公开引用不授予第三方品牌、角色或 API 使用权。
