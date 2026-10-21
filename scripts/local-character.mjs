// Local-only launcher: the existing character stays in the user's workspace.
// This entry is never copied into the public portable release.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const files = ['geometry-data.js', 'src/math.js', 'src/tables.js', 'src/pose.js', 'src/tricks.js', 'src/fx.js', 'src/eyes.js', 'src/character.js'];
const missing = files.filter((file) => !fs.existsSync(path.join(root, 'vendor/grok-study/replica', file)));
if (missing.length) {
  console.warn('[desktop:local] 原角色本机素材不完整，界面将显示加载提示；恢复素材后重启即可。');
}
if (!fs.existsSync(path.join(root, 'apps/desktop/dist-local/character.html'))) {
  console.error('[desktop:local] 请先运行 npm run desktop:local:build。');
  process.exit(1);
}
console.log('[desktop:local] 启动原黑色角色，保留原动作与 v0.2 功能。');
const child = spawn(require('electron'), [path.join(root, 'apps/desktop/dist-electron/main.js')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: '',
    CHARACTER_MODE: 'study',
    COMPANION_LOCAL_CHARACTER: '1',
    COMPANION_USER_DATA_DIR: path.join(root, 'outputs/local-study-profile'),
  },
});
child.on('error', () => { console.error('[desktop:local] 原角色桌面启动失败。'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'));
