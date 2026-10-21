# 伴屏 AI Companion Screen

随叫随到的 Windows 桌面 AI 伙伴。平时安静待机，点击展开小输入框，发送需求后进入单张工作画布。沿用 Electron、React 与 TypeScript，当前版本 v0.2.2。

## 下载 v0.2.2 Windows 便携版

[下载 Windows x64 运行包](https://github.com/qilinbro/ai-companion-screen/releases/download/v0.2.2/banping-v0.2.2-win-x64.zip) · [发行说明与校验文件](https://github.com/qilinbro/ai-companion-screen/releases/tag/v0.2.2)

建议解压到较短路径。完整解压后，运行“首次连接原角色.exe”，选择自己已有的伴屏工作区。角色留在原目录，连接后使用原黑色角色及原动作；以后直接双击“伴屏.exe”。无需安装 Node.js、打开终端或每次编译。

公开 ZIP 不附第三方原角色、不含密钥及个人配置。尚未连接时有可点击的文字入口和完整聊天画布，没有备用宠物。需自行持有有权使用的角色素材；连接后生成的本机位置文件不要重新公开上传。[运行包说明](README-RELEASE-WINDOWS.txt) · [构建与验证记录](docs/09-v0.2.2-release.md)。

## 当前角色与源码

当前本机入口统一使用原黑色角色，已删除奶油造型及加载失败时的备用角色。缺少素材时明确提示，不自动更换宠物。

- [此前黑色角色统一源码与验证快照](showcase/black-character-update-2026-10-21/README.md)
- [下载此前公开源码快照](showcase/black-character-update-2026-10-21/banping-black-character-source.zip)

最新版源码可从本页 Code 下载或从 v0.2.2 标签获取。原角色及新录制的奶茶生活演示、宠物 GIF 仅在本机提供，不在公开仓库分发。

## 较早公开展示材料（历史快照）

- [完整公开展示材料 ZIP](showcase/v0.2.1/banping-v0.2.1-public-submission.zip)：六页说明、7 张界面图、29 秒 MP4、GIF、投稿文案、源码及 AI 实践佐证。
- [作品展示目录](showcase/v0.2.1/README.md) / [作品说明 PDF](showcase/v0.2.1/materials/01-作品说明/伴屏-作品展示说明.pdf)
- [Windows 实录视频](showcase/v0.2.1/materials/02-界面与演示/伴屏-v0.2-Windows实录-受控服务演示.mp4)

![伴屏 Windows 实录预览：输入、流式回复、设置、单屏全屏和停止](showcase/v0.2.1/materials/02-界面与演示/伴屏-v0.2-演示预览.gif)

媒体来自实际 Windows EXE 的隔离测试会话，只采集应用窗口；文字来自本机受控兼容服务。原角色因仅限本机学习而省略，本机版本未改。实录为单显示器，真实视觉模型与实体双屏待验收。

## 默认运行原黑色成品

需要 Windows 10/11 x64、Node.js >= 22.12 和图形桌面。首次安装依赖需要联网。

```bash
npm ci --include=dev
npm run build
npm run desktop:start
```

默认 build、desktop:build、desktop:start、build.cmd 与 desktop:package 均使用本机原黑色角色和原动作，无需选择角色。角色素材需保留在原本机工作区，不随公开源码分发。加载失败仅提示“原角色未加载”，不使用替代宠物。

仅校验公开源码时使用以下显式命令，不会生成另一只宠物：

```bash
npm run build:public
npm run desktop:public:start
```

v0.2.2 运行包的可复现构建（构建机器需要已有原角色工作区；素材不会进入运行包）：

```bash
npm run desktop:release:package
npm run build:public
node scripts/build-character-connector.mjs
node scripts/prepare-release.mjs
```

输出 `outputs/releases/v0.2.2/banping-v0.2.2-win-x64.zip`。Windows 自带 .NET Framework 编译原生连接助手；连接后沿用所选工作区的本机配置目录。旧 `desktop:public:package` 命令仍用于仅校验无素材 Demo，完整运行包请使用以上命令。

## 使用

单击角色或按 `Ctrl+Alt+Space` 展开输入，按住身体拖动。发送需求后出现画布；设置按需打开。长回复支持代码块与回复复制，上翻阅读时暂停跟随。停止立即结束任务，迟到数据不能继续更新界面。关闭窗口停止任务并收至托盘。

在设置配置有权使用的 OpenAI-compatible Chat Completions 服务地址、模型和密钥。服务须支持流式、工具调用和图片输入，才能分析屏幕；连接检测不等于视觉验收。需求先交给模型，合法 `capture_screen` 请求通过本次运行授权后才采集真实主屏 PNG，并发回同一服务继续分析。

设置内可选画布显示器，标明主屏和副屏，支持全屏、退出按钮和 Esc。宠物与画布分别管理位置；切换画布位置保留同一任务和会话，不改变读屏来源。

模型通信、密钥及工具执行由主进程管理，保留受限 IPC 与发送方校验。密钥在设置中录入后交主进程管理，可选择系统安全存储；不进入日志。截图和对话默认仅在内存。读屏授权仅当前运行有效，更换服务或模型后重新授权。

## 验证与边界

v0.2.2 本次运行时 41 项、几何 11 项、新本机 EXE 角色检查 12 项、连接助手核心逻辑 22 项通过；公开与本机渲染构建均通过。实际 ZIP 解压后的新 EXE 16 项检查通过，覆盖未连接入口与连接原角色后三种状态；ZIP 完整性与摘要检查通过。连接助手图形选择/取消仍待人工验收，核心绑定逻辑已测。另有既有本机 EXE 30 项原生受控报告；其中角色检查属于本机版本，不等于公开构建 30 项验收。默认启动链另有 8 项实际桌面检查通过，三种状态均显示原黑色角色；旧角色资源备份已清理。新视频覆盖输入、流式、上翻、设置、单屏全屏、按钮退出及停止，未声称本轮视频完成 Esc 或复制点击检查。

真实视觉服务及型号未提供。真实模型效果、实体双屏、混合缩放、拔插、物理睡眠和部分人工桌面回归仍待验收。几何模拟和受控协议回复不能替代真实设备与模型结果。

当前没有语音、终端执行、文件修改、网页搜索、电脑控制、长期模型记忆或跨设备连接。

```bash
npm run build
npm run test:runtime
npm run test:layout
npm run test:desktop
```

桌面测试使用隔离资料及本机受控服务，会显示真实窗口，可能使用剪贴板和采集测试主屏。测试不调用外部模型。

- [v0.2.2 打包记录](docs/09-v0.2.2-release.md) / [便携运行包使用说明](README-RELEASE-WINDOWS.txt)
- [公开 Windows 构建说明](README-PUBLIC-WINDOWS.txt)
- [v0.2 实现与验收记录](docs/06-v0.2-implementation.md)
- [公开展示材料记录](docs/07-public-submission.md) / [黑色角色与生活演示](docs/08-life-demo-and-black-character.md)
- [第三方记录](docs/third-party.md) / [历史总结](docs/05-session-summary-2026-10-20.md)

源码与公开材料排除受限角色、用户配置和真实密钥。项目自身尚未选择开源许可证；公开可读取不代表对第三方素材取得分发权。
