# 伴屏 AI Companion Screen

随叫随到的 Windows 桌面 AI 伙伴。平时安静待机，点击展开小输入框，发送需求后进入单张工作画布。沿用 Electron、React 与 TypeScript，当前版本 v0.2.1。

## 作品展示与下载

- [完整公开展示材料 ZIP](showcase/v0.2.1/banping-v0.2.1-public-submission.zip)：六页说明、7 张界面图、29 秒 MP4、GIF、投稿文案、源码及 AI 实践佐证。
- [作品展示目录](showcase/v0.2.1/README.md) / [作品说明 PDF](showcase/v0.2.1/materials/01-作品说明/伴屏-作品展示说明.pdf)
- [Windows 实录视频](showcase/v0.2.1/materials/02-界面与演示/伴屏-v0.2-Windows实录-受控服务演示.mp4)

![伴屏 Windows 实录预览：输入、流式回复、设置、单屏全屏和停止](showcase/v0.2.1/materials/02-界面与演示/伴屏-v0.2-演示预览.gif)

媒体来自实际 Windows EXE 的隔离测试会话，只采集应用窗口；文字来自本机受控兼容服务。原角色因仅限本机学习而省略，本机版本未改。实录为单显示器，真实视觉模型与实体双屏待验收。

## 从公开源码运行

需要 Windows 10/11 x64、Node.js >= 22.12 和图形桌面。首次安装依赖需要联网。

```bash
npm ci --include=dev
npm run build
npm run desktop:start
```

生产构建使用项目原创角色，不含第三方学习素材。开发入口为 `npm run desktop:dev`，缺少学习素材时自动回退原创角色。

公开便携封装：

```bash
npm run build
node scripts/package-demo.mjs
```

输出 `outputs/伴屏-Demo-win32-x64/伴屏 Demo.exe`，分享时保留整个运行目录及依赖许可证。本次提交提供可复现源码，没有重新生成或交付该公开 EXE；新构建须另做启动与交互验证。默认 `desktop:package`、`test:portable` 现指向本机角色专用流程，公开版本请使用上述入口。

## 使用

单击角色或按 `Ctrl+Alt+Space` 展开输入，按住身体拖动。发送需求后出现画布；设置按需打开。长回复支持代码块与回复复制，上翻阅读时暂停跟随。停止立即结束任务，迟到数据不能继续更新界面。关闭窗口停止任务并收至托盘。

在设置配置有权使用的 OpenAI-compatible Chat Completions 服务地址、模型和密钥。服务须支持流式、工具调用和图片输入，才能分析屏幕；连接检测不等于视觉验收。需求先交给模型，合法 `capture_screen` 请求通过本次运行授权后才采集真实主屏 PNG，并发回同一服务继续分析。

设置内可选画布显示器，标明主屏和副屏，支持全屏、退出按钮和 Esc。宠物与画布分别管理位置；切换画布位置保留同一任务和会话，不改变读屏来源。

模型通信、密钥及工具执行由主进程管理，保留受限 IPC 与发送方校验。密钥在设置中录入后交主进程管理，可选择系统安全存储；不进入日志。截图和对话默认仅在内存。读屏授权仅当前运行有效，更换服务或模型后重新授权。

## 验证与边界

运行时 41 项、几何 11 项通过，公开源码干净解压构建通过。另有既有本机 EXE 30 项原生受控报告；其中角色检查属于本机版本，不等于公开构建 30 项验收。新视频覆盖输入、流式、上翻、设置、单屏全屏、按钮退出及停止，未声称本轮视频完成 Esc 或复制点击检查。

真实视觉服务及型号未提供。真实模型效果、实体双屏、混合缩放、拔插、物理睡眠和部分人工桌面回归仍待验收。几何模拟和受控协议回复不能替代真实设备与模型结果。

当前没有语音、终端执行、文件修改、网页搜索、电脑控制、长期模型记忆或跨设备连接。

```bash
npm run build
npm run test:runtime
npm run test:layout
npm run test:desktop
```

桌面测试使用隔离资料及本机受控服务，会显示真实窗口，可能使用剪贴板和采集测试主屏。测试不调用外部模型。

- [公开 Windows 构建说明](README-PUBLIC-WINDOWS.txt)
- [v0.2 实现与验收记录](docs/06-v0.2-implementation.md)
- [公开展示材料记录](docs/07-public-submission.md)
- [第三方记录](docs/third-party.md) / [历史总结](docs/05-session-summary-2026-10-20.md)

源码与公开材料排除受限角色、用户配置和真实密钥。项目自身尚未选择开源许可证；公开可读取不代表对第三方素材取得分发权。
