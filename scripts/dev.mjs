#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = path.join(root, 'apps/desktop');
const tscBin = path.join(root, 'node_modules/typescript/bin/tsc');
const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
const mainEntry = path.join(desktopDir, 'dist-electron/main.js');

const allowedStates = new Set(['idle', 'curious', 'thinking', 'feedback']);
const stateArg = process.argv.slice(2).find((arg) => arg.startsWith('--state='));
const state = stateArg ? stateArg.slice('--state='.length) : 'idle';

if (!allowedStates.has(state)) {
    console.error(`[desktop:dev] 未知状态 "${state}"，可选：idle / curious / thinking / feedback`);
  process.exit(1);
}

if (!fs.existsSync(tscBin) || !fs.existsSync(viteBin)) {
  console.error(
    '[desktop:dev] 缺少依赖，请先在仓库根目录执行 npm install（若环境设置了 NODE_ENV=production，使用 npm install --include=dev）。',
  );
  process.exit(1);
}

function runOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码 ${code ?? 'unknown'}`));
    });
  });
}

function waitForServer(url, child, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error('Vite 在就绪前退出。'));
        return;
      }
      if (await isProjectServerRunning(url)) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`等待 Vite 超时（${timeoutMs}ms）。`));
        return;
      }
      setTimeout(tick, 250);
    };
    void tick();
  });
}

async function isProjectServerRunning(url) {
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes('src="/@vite/client"') && html.includes('src="/src/character/main.tsx"');
  } catch {
    return false;
  }
}

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function stopChildren(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (viteProcess && viteProcess.exitCode === null) viteProcess.kill('SIGTERM');
  if (electronProcess && electronProcess.exitCode === null) electronProcess.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 200);
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));

try {
  console.log('[desktop:dev] 编译 Electron 主进程…');
  await runOnce(process.execPath, [tscBin, '-p', path.join(desktopDir, 'tsconfig.electron.json')]);

  const devUrl = 'http://127.0.0.1:5173/character.html';
  if (await isProjectServerRunning(devUrl)) {
    // The same main entry and profile use Electron's existing single-instance
    // handler to reveal the pet. This launch never owns or stops that Vite.
    console.log('[desktop:dev] 复用本项目开发服务，唤出已有角色窗口…');
  } else {
    console.log('[desktop:dev] 启动 Vite…');
    viteProcess = spawn(process.execPath, [viteBin, '--config', path.join(desktopDir, 'vite.config.mts')], {
      cwd: root,
      stdio: 'inherit',
    });
    viteProcess.on('exit', (code) => {
      if (shuttingDown) return;
      console.error(`[desktop:dev] Vite 退出，退出码 ${code ?? 'unknown'}。`);
      stopChildren(code ?? 1);
    });
    await waitForServer(devUrl, viteProcess);
  }

  let electronPath;
  try {
    electronPath = require('electron');
  } catch (error) {
    throw new Error(`找不到 Electron 可执行文件：${String(error)}`);
  }
  if (typeof electronPath !== 'string') {
    throw new Error('Electron 包没有返回可执行文件路径。');
  }

  const hasStudyAssets = fs.existsSync(path.join(root, 'vendor/grok-study/replica/geometry-data.js'))
    && fs.existsSync(path.join(root, 'vendor/grok-study/replica/src/character.js'));
  if (!hasStudyAssets) console.log('[desktop:dev] 原角色本机素材缺失，界面将显示加载提示；仍可展开输入。');
  console.log(`[desktop:dev] 启动角色窗口（state=${state}）…`);
  electronProcess = spawn(electronPath, [mainEntry], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devUrl,
      CHARACTER_STATE: state,
      CHARACTER_MODE: 'study',
      COMPANION_USER_DATA_DIR: process.env.COMPANION_USER_DATA_DIR ?? path.join(root, 'outputs', 'local-study-profile'),
    },
  });

  electronProcess.on('error', (error) => {
    console.error('[desktop:dev] Electron 启动失败。', error);
    stopChildren(1);
  });

  electronProcess.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(
        '[desktop:dev] Electron 退出。若提示缺少 DISPLAY / libgtk，请在有图形桌面的 Windows 或 Linux 环境运行；本机仅完成构建验证。',
      );
    }
    stopChildren(code ?? 0);
  });
} catch (error) {
  console.error('[desktop:dev] 启动失败：', error instanceof Error ? error.message : error);
  stopChildren(1);
}
