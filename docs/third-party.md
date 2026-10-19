# 第三方来源与实际使用记录

更新：2026-10-19，v0.2。当前只有 Markdown，没有已安装项目依赖、已导入角色素材、模型权重或厂商 SDK。

## 本轮实际使用

- Git：用于克隆目标仓库及按用户要求发布本轮 Markdown；未复制 Git 软件进项目，发布范围不包含应用代码或依赖。
- Meta Muse 与 New Computer Dot 官方资料：仅阅读并以链接引用，用于产品需求推导；没有复制产品代码、图像、角色或界面资产。来源和核实边界见[功能参考](02-product-references.md)。
- Electron、W3C、Vite 等公开技术文档：仅核实方案边界，未复制示例代码进入产品；阅读文档不代表已接入能力。

## 拟选而未引入

- Electron、React、TypeScript、Vite、zod：桌面方案候选，尚无实际安装版本或锁文件。实施时补精确来源、版本、许可证、用途和通知义务。
- ws 与 HTTPS/WSS 配套：后续 LAN 适配候选，不是已建立的通信能力。
- SQLite 与 Windows 打包/签名工具：按实际存储与分发需要选择，尚未确定具体依赖。
- 角色拟原创 SVG/CSS，无现有资产；不使用 Muse、Dot 或联想角色和未知授权素材。
- 模型、STT、TTS、浏览器操作与 Android 包装服务/实现未确定，不声明已使用或已获访问资格。
- 项目自身开源许可证尚未选择，不能由依赖许可证推导整个项目已按某许可证发布。

## 官方技术依据

- [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron 桌面捕获](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Electron 电源与锁屏事件](https://www.electronjs.org/docs/latest/api/power-monitor)
- [W3C 安全上下文](https://w3c.github.io/webappsec-secure-contexts/)
- [W3C 媒体捕获](https://www.w3.org/TR/mediacapture-streams/)
- [Vite 工程入门](https://vite.dev/guide/)

## 每项实际引入时记录

名称、精确版本或资产标识、原始来源链接、许可证/服务条款链接、许可证标识、实际使用模块、修改情况、分发方式、归属与通知义务、审核日期。模型服务额外记录数据发送范围、留存政策与配置位置，不记录密钥。公开引用产品功能不等于取得其商标、资产、源码或 API 授权。
