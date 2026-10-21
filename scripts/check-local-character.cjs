// Real Electron local-file check; no model call or desktop screen capture.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const root = path.resolve(__dirname, '..');
process.env.COMPANION_LOCAL_CHARACTER = '1';
process.env.VITE_DEV_SERVER_URL = '';
process.env.COMPANION_USER_DATA_DIR = path.join(root, 'outputs', `original-character-check-${Date.now()}`);
require('../apps/desktop/dist-electron/main.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    let win, state;
    for (let attempt = 0; attempt < 150; attempt++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && !win.webContents.isLoadingMainFrame()) {
        state = await win.webContents.executeJavaScript(`({ original:!!document.querySelector('.character-study'), loaded:typeof window.GrokCharacter === 'function', paths:document.querySelector('.character-study')?.querySelectorAll('path').length??0, dot:!!document.querySelector('.dot-pet'), url:location.href, bridge:!!window.companion })`);
        if (state.loaded && state.paths > 0) break;
      }
      await delay(100);
    }
    assert(state?.original && state.loaded && state.paths > 0, 'Original character failed to load');
    assert.equal(state.dot, false, 'Local original must not render the cream placeholder');
    assert(state.url.startsWith('file:') && state.url.includes('/dist-local/character.html'));
    assert(state.bridge);
    const evidence = path.join(root, 'outputs/validation');
    await fs.mkdir(evidence, { recursive: true });
    await delay(350);
    let previewCaptured = false;
    try {
      await fs.writeFile(path.join(evidence, 'v02-original-character.png'), (await win.webContents.capturePage()).toPNG());
      previewCaptured = true;
    } catch { /* A transparent-window capture failure does not change engine assertions. */ }
    await fs.writeFile(path.join(evidence, 'v02-original-character.json'), JSON.stringify({ passed:true, original:state.original, engineLoaded:state.loaded, paths:state.paths, placeholder:state.dot, fileEntry:true, bridge:state.bridge, previewCaptured }, null, 2));
    console.log('[test:local-character] PASS 原黑色角色、原动画引擎、本地文件入口、桌面桥接；未显示奶油色占位。');
  } catch (error) {
    console.error('[test:local-character] FAIL', error.message);
    exitCode = 1;
  } finally { app.exit(exitCode); }
});
