import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  Tray,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import { cancelScreenCapture, capturePrimaryScreen, validateCaptureRequestId } from './screen-capture';
import { ModelConfigStore } from './model-config';
import { AgentRuntime, checkModelConnection } from './agent-runtime';
import { WindowLayout, clampBounds, fitCanvasBounds, type DisplayInfo, type DisplayState, type WindowMode } from './window-layout';


const DEV_ENTRY = 'http://127.0.0.1:5173/character.html';
function readLocalDesktopWorkspace(): { workspaceRoot: string; characterAssetRoot: string } | null {
  if (!app.isPackaged) return null;
  const marker = path.join(app.getAppPath(), 'local-desktop.json');
  if (!fs.existsSync(marker)) return null;
  const metadata = fs.lstatSync(marker);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16384) throw new Error('本机桌面配置无效。');
  const data: unknown = JSON.parse(fs.readFileSync(marker, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('本机桌面配置无效。');
  const item = data as Record<string, unknown>;
  if (item.kind !== 'banping-local-desktop' || item.version !== 1 || typeof item.workspaceRoot !== 'string' || typeof item.characterAssetRoot !== 'string'
    || !path.isAbsolute(item.workspaceRoot) || !path.isAbsolute(item.characterAssetRoot)
    || Object.keys(item).some((key) => !['kind', 'version', 'workspaceRoot', 'characterAssetRoot'].includes(key))) throw new Error('本机桌面配置无效。');
  const workspace = fs.realpathSync(item.workspaceRoot);
  if (!fs.statSync(workspace).isDirectory()) throw new Error('原角色工作目录不存在。');
  const assetRoot = fs.realpathSync(item.characterAssetRoot);
  const relative = path.relative(workspace, assetRoot);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(assetRoot).isDirectory()) throw new Error('原角色目录不在本机工作区内。');
  return { workspaceRoot: workspace, characterAssetRoot: assetRoot };
}
const localDesktop = readLocalDesktopWorkspace();
const localCharacter = Boolean(localDesktop) || (!app.isPackaged && process.env.COMPANION_LOCAL_CHARACTER === '1');
// The source local entry already has a relative asset path. Only an explicitly
// deployed local desktop resolves an external path through this trusted marker.
const characterAssetRoot = localDesktop?.characterAssetRoot ?? null;
const PAGE_PATH = path.join(__dirname, '..', localCharacter ? 'dist-local' : 'dist', 'character.html');
const FILE_ENTRY = pathToFileURL(PAGE_PATH).href;
const CHARACTER_STATES = new Set(['idle', 'curious', 'thinking', 'feedback']);
const WAKE_SHORTCUT = 'Control+Alt+Space';
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentMode: WindowMode = 'idle';
let layout: WindowLayout | null = null;
let petDrag: { cursor: Electron.Point; bounds: Rectangle; petAnchor: Rectangle; mode: WindowMode } | null = null;
let fullscreenDisplayId: number | null = null;
let fullscreenBounds: Rectangle | null = null;
let fullscreenLayer = false;
let presentationVisible = true;
let captureOperations = 0;
let connectionTest: AbortController | null = null;
let systemSleeping = false;
let screenLocked = false;
let quitting = false;
let windowPresentationRevision = 0;
let modelConfig: ModelConfigStore | null = null;
let agentRuntime: AgentRuntime | null = null;
let modelConfigWrites = 0;
const REMINDER_REPEAT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REMINDER_IDS = 256;
const MAX_VISIBLE_REMINDERS = 32;
const reminderAttempts = new Map<string, number>();
const liveReminders = new Map<string, Notification>();

app.setName('Companion Screen Demo');
const userDataDir = process.env.COMPANION_USER_DATA_DIR ?? (localDesktop ? path.join(localDesktop.workspaceRoot, 'outputs/local-study-profile') : undefined);
if (userDataDir) {
  const resolved = path.resolve(userDataDir);
  fs.mkdirSync(resolved, { recursive: true });
  app.setPath('userData', resolved);
}

function isTrustedPage(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      return url.origin === 'http://127.0.0.1:5173' && url.pathname === '/character.html';
    }
    url.search = '';
    url.hash = '';
    return url.href === FILE_ENTRY;
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const win = mainWindow;
  if (
    !win ||
    win.isDestroyed() ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    !event.senderFrame ||
    !isTrustedPage(event.senderFrame.url)
  ) {
    throw new Error('此页面无权控制桌面窗口。');
  }
  return win;
}

function getDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.label || `显示器 ${index + 1}`,
    isPrimary: display.id === primary,
    scaleFactor: display.scaleFactor,
    bounds: { ...display.bounds },
    workArea: { ...display.workArea },
  }));
}

function getLayout(): WindowLayout {
  layout ??= new WindowLayout(getDisplays());
  return layout;
}

function displayState(): DisplayState { return getLayout().snapshot(getDisplays()); }

function publishDisplayState(): void {
  const win = mainWindow;
  if (win && !win.isDestroyed() && isTrustedPage(win.webContents.getURL())) win.webContents.send('companion:display-state', displayState());
}

function setBoundsIfChanged(win: BrowserWindow, bounds: Rectangle): void {
  const current = win.getBounds();
  if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) win.setBounds(bounds);
}

function applyWindowLayout(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const state = getLayout();
  const displays = getDisplays();
  state.reconcile(displays);
  const target = state.canvasDisplay(displays);
  if (state.mode === 'canvas' && state.fullscreen) {
    const changedBounds = !fullscreenBounds || Object.keys(target.bounds).some((key) => target.bounds[key as keyof Rectangle] !== fullscreenBounds![key as keyof Rectangle]);
    if (fullscreenDisplayId !== target.id || changedBounds) {
      if (fullscreenDisplayId !== null) win.setFullScreen(false);
      // Electron 44's transparent Windows windows implement setFullScreen by
      // setting monitor bounds, while isFullScreen() remains false. Keep one
      // renderer, track this presentation explicitly and include the taskbar
      // area. Never use that native flag as the transition guard here.
      setBoundsIfChanged(win, fitCanvasBounds(target));
      fullscreenDisplayId = target.id;
      fullscreenBounds = { ...target.bounds };
      win.setFullScreen(true);
      setBoundsIfChanged(win, target.bounds);
    }
  } else {
    const wasFullscreen = fullscreenDisplayId !== null || win.isFullScreen();
    fullscreenDisplayId = null;
    fullscreenBounds = null;
    if (wasFullscreen) win.setFullScreen(false);
    setBoundsIfChanged(win, state.getBounds(displays));
  }
  // Normal floating windows sit below the Windows taskbar. Fullscreen needs
  // the supported screen-saver level to cover that selected display entirely.
  if (fullscreenLayer !== state.fullscreen || !win.isAlwaysOnTop()) {
    win.setAlwaysOnTop(true, state.fullscreen ? 'screen-saver' : 'floating');
    fullscreenLayer = state.fullscreen;
  }
  publishDisplayState();
}

function cancelConnectionTest(): void {
  connectionTest?.abort(new Error('连接检测已取消。'));
  connectionTest = null;
}

function stopDesktopWork(): void {
  petDrag = null;
  agentRuntime?.cancel();
  cancelConnectionTest();
  cancelScreenCapture();
}

async function captureForWindow(requestId: string): Promise<Awaited<ReturnType<typeof capturePrimaryScreen>>> {
  const win = mainWindow;
  if (!win || win.isDestroyed() || quitting) throw new Error('桌面窗口已关闭。');
  if (systemSleeping || screenLocked) throw new Error('电脑已休眠或锁定，请解锁后重新发送。');
  if (modelConfigWrites || connectionTest) throw new Error('模型设置正在更新或检测，请稍后重试。');
  if (!modelConfig?.getPublic().allowScreen) throw new Error('尚未允许模型查看主屏幕。请在设置中授权后重试。');
  const revision = windowPresentationRevision;
  captureOperations += 1;
  try {
    // Output placement never selects the capture source: this function always
    // calls the dedicated primary-display capture implementation.
    const captured = await capturePrimaryScreen({ requestId, window: win, mayRestore: () => mainWindow === win && !quitting && !systemSleeping && !screenLocked && presentationVisible && revision === windowPresentationRevision });
    if (!modelConfig?.getPublic().allowScreen || systemSleeping || screenLocked || quitting) throw new Error('屏幕读取已取消，请重新授权后发送。');
    return captured;
  } finally {
    captureOperations -= 1;
    if (!captureOperations && mainWindow === win && !win.isDestroyed() && !quitting && !systemSleeping && !screenLocked && presentationVisible && !win.isVisible()) win.showInactive();
  }
}

function setMode(mode: WindowMode, reveal = true): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const state = getLayout();
  state.rememberCanvas(win.getBounds(), getDisplays());
  petDrag = null;
  currentMode = mode;
  state.setMode(mode);
  applyWindowLayout();
  win.webContents.send('companion:mode', mode);
  if (reveal) {
    presentationVisible = true;
    // A capture may temporarily hide the window. Reposition it immediately,
    // then reveal after pixels arrive so moving the canvas cannot cancel work.
    if (captureOperations || systemSleeping || screenLocked) return;
    if (win.isMinimized()) win.restore();
    if (mode === 'idle') { if (!win.isVisible()) win.showInactive(); }
    else {
      if (!win.isVisible()) win.show();
      if (!win.isFocused()) win.focus();
    }
  }
}

function createTrayIcon(): Electron.NativeImage {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inBody = (x - 15.5) ** 2 + (y - 15.5) ** 2 <= 13 ** 2;
      if (!inBody) continue;
      const eye = y >= 13 && y <= 16 && ((x >= 10 && x <= 12) || (x >= 19 && x <= 21));
      const offset = (y * size + x) * 4;
      pixels[offset] = eye ? 64 : 218;
      pixels[offset + 1] = eye ? 72 : 238;
      pixels[offset + 2] = eye ? 49 : 244;
      pixels[offset + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 1 });
}

function createTray(wakeShortcutRegistered: boolean): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(wakeShortcutRegistered ? '伴屏 · Ctrl+Alt+Space 唤出' : '伴屏 · 点击托盘唤出');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: wakeShortcutRegistered ? '唤出 Ctrl+Alt+Space' : '唤出（快捷键不可用）', click: () => setMode('input') },
    { label: '收起到宠物', click: () => setMode('idle') },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', () => setMode('input'));
  tray.on('click', () => setMode('input'));
}

function notifyReminder(payload: unknown): Promise<{ shown: boolean }> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('提醒参数必须是对象。');
  }
  const { id, title } = payload as Record<string, unknown>;
  if (typeof id !== 'string' || id.length < 1 || id.length > 120 || !id.trim()) {
    throw new TypeError('提醒 ID 必须是 1 到 120 个字符。');
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 200 || !title.trim()) {
    throw new TypeError('提醒内容必须是 1 到 200 个字符。');
  }
  if (!Notification.isSupported()) return Promise.resolve({ shown: false });
  const now = Date.now();
  for (const [previousId, attemptedAt] of reminderAttempts) {
    if (now - attemptedAt >= REMINDER_REPEAT_WINDOW_MS) reminderAttempts.delete(previousId);
  }
  if (reminderAttempts.has(id)) return Promise.resolve({ shown: false });
  // Reserve before creating the notification so concurrent IPC calls cannot duplicate it.
  reminderAttempts.set(id, now);
  while (reminderAttempts.size > MAX_REMINDER_IDS) {
    const oldestId = reminderAttempts.keys().next().value;
    if (oldestId === undefined) break;
    reminderAttempts.delete(oldestId);
  }
  return new Promise((resolve) => {
    let notification: Notification;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (shown: boolean): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ shown });
    };
    try {
      notification = new Notification({ title: '伴屏 · 提醒', body: title.trim(), silent: true });
      liveReminders.set(id, notification);
      while (liveReminders.size > MAX_VISIBLE_REMINDERS) {
        const oldest = liveReminders.entries().next().value;
        if (!oldest) break;
        liveReminders.delete(oldest[0]);
        oldest[1].close();
      }
      notification.once('show', () => finish(true));
      notification.once('failed', () => {
        if (liveReminders.get(id) === notification) liveReminders.delete(id);
        finish(false);
      });
      notification.once('close', () => {
        if (liveReminders.get(id) === notification) liveReminders.delete(id);
        finish(false);
      });
      notification.once('click', () => setMode('input'));
      // A request accepted by the OS is not proof that a toast appeared.
      timeout = setTimeout(() => finish(false), 5000);
      notification.show();
    } catch {
      liveReminders.delete(id);
      finish(false);
    }
  });
}

function registerIpc(): void {
  ipcMain.handle('companion:get-character-asset-base', (event) => {
    assertTrustedSender(event);
    return characterAssetRoot ? pathToFileURL(characterAssetRoot + path.sep).href : null;
  });
  ipcMain.handle('companion:drag-window', (event, phase: unknown, origin: unknown) => {
    const win = assertTrustedSender(event);
    if (phase !== 'start' && phase !== 'move' && phase !== 'end') throw new TypeError('未知拖动动作。');
    if (phase === 'end' || quitting || getLayout().fullscreen || !win.isVisible() || win.isMinimized()) { petDrag = null; return; }
    if (phase === 'start') {
      const bounds = win.getBounds();
      petDrag = null;
      if (!origin || typeof origin !== 'object' || Array.isArray(origin)) throw new TypeError('拖动起点无效。');
      const { x, y } = origin as Record<string, unknown>;
      const zoom = win.webContents.getZoomFactor();
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x * zoom > bounds.width || y * zoom > bounds.height) throw new TypeError('拖动起点不在窗口内。');
      // Preserve the actual pointer-down point even if IPC arrives after a fast
      // release. Local CSS coordinates become DIP here; later cursor reads are
      // main-process DIP, including across Windows display scaling changes.
      petDrag = { cursor: { x: bounds.x + x * zoom, y: bounds.y + y * zoom }, bounds, petAnchor: { ...getLayout().petBounds }, mode: currentMode };
      return;
    }
    if (!petDrag) return;
    const cursor = screen.getCursorScreenPoint();
    const displayId = screen.getDisplayNearestPoint(cursor).id;
    const display = getDisplays().find((item) => item.id === displayId)!;
    const { bounds, petAnchor, mode } = petDrag;
    const next = clampBounds({ ...bounds, x: bounds.x + cursor.x - petDrag.cursor.x, y: bounds.y + cursor.y - petDrag.cursor.y }, display.workArea);
    win.setBounds(next);
    if (mode === 'canvas') {
      getLayout().moveCanvas(next, display);
      publishDisplayState();
    } else {
      getLayout().petBounds = clampBounds({ ...petAnchor, x: petAnchor.x + next.x - bounds.x, y: petAnchor.y + next.y - bounds.y }, display.workArea);
    }
  });
  ipcMain.handle('companion:get-display-state', (event) => {
    assertTrustedSender(event);
    return displayState();
  });
  ipcMain.handle('companion:set-canvas-display', (event, displayId: unknown) => {
    const win = assertTrustedSender(event);
    if (typeof displayId !== 'number' || !Number.isInteger(displayId)) throw new TypeError('显示器编号无效。');
    const state = getLayout();
    state.rememberCanvas(win.getBounds(), getDisplays());
    state.selectDisplay(displayId, getDisplays());
    petDrag = null;
    if (currentMode === 'canvas') applyWindowLayout();
    else publishDisplayState();
    return displayState();
  });
  ipcMain.handle('companion:set-canvas-fullscreen', (event, value: unknown) => {
    const win = assertTrustedSender(event);
    if (typeof value !== 'boolean') throw new TypeError('全屏状态必须是布尔值。');
    const state = getLayout();
    state.rememberCanvas(win.getBounds(), getDisplays());
    if (value && currentMode !== 'canvas') setMode('canvas');
    state.fullscreen = value;
    petDrag = null;
    applyWindowLayout();
    return displayState();
  });
  ipcMain.handle('companion:get-mode', (event) => {
    assertTrustedSender(event);
    return currentMode;
  });
  ipcMain.handle('companion:set-mode', (event, mode: unknown) => {
    assertTrustedSender(event);
    if (mode !== 'idle' && mode !== 'input' && mode !== 'canvas') throw new Error('未知窗口状态。');
    setMode(mode);
  });
  ipcMain.handle('companion:hide', (event) => {
    const win = assertTrustedSender(event);
    windowPresentationRevision += 1;
    presentationVisible = false;
    stopDesktopWork();
    setMode('idle', false);
    win.hide();
  });
  ipcMain.handle('companion:quit', (event) => {
    assertTrustedSender(event);
    app.quit();
  });
  ipcMain.handle('companion:notify-reminder', (event, payload: unknown) => {
    assertTrustedSender(event);
    return notifyReminder(payload);
  });
  ipcMain.handle('companion:capture-screen', (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('截图请求必须是对象。');
    const requestId = validateCaptureRequestId((payload as Record<string, unknown>).requestId);
    return captureForWindow(requestId);
  });
  ipcMain.handle('companion:cancel-screen-capture', (event, requestId: unknown) => {
    assertTrustedSender(event);
    cancelScreenCapture(validateCaptureRequestId(requestId));
  });
  ipcMain.handle('companion:get-model-config', (event) => {
    assertTrustedSender(event);
    if (!modelConfig) throw new Error('模型设置还未就绪。');
    return modelConfig.getPublic();
  });
  ipcMain.handle('companion:save-model-config', async (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!modelConfig) throw new Error('模型设置还未就绪。');
    modelConfigWrites += 1;
    cancelConnectionTest();
    agentRuntime?.cancel();
    cancelScreenCapture();
    try {
      const previous = modelConfig.getPublic();
      const saved = await modelConfig.save(payload);
      if (previous.baseUrl !== saved.baseUrl || previous.modelId !== saved.modelId) agentRuntime?.clearHistory();
      return saved;
    } finally { modelConfigWrites -= 1; }
  });
  ipcMain.handle('companion:clear-model-secret', async (event) => {
    assertTrustedSender(event);
    if (!modelConfig) throw new Error('模型设置还未就绪。');
    modelConfigWrites += 1;
    cancelConnectionTest();
    agentRuntime?.cancel();
    cancelScreenCapture();
    try { return await modelConfig.clearSecret(); }
    finally { modelConfigWrites -= 1; }
  });
  ipcMain.handle('companion:run-agent', (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!agentRuntime) throw new Error('模型服务还未就绪。');
    if (systemSleeping || screenLocked) throw new Error('电脑已休眠或锁定，请解锁后重新发送。');
    if (modelConfigWrites > 0) throw new Error('正在保存模型设置，请稍后再发送。');
    if (connectionTest) throw new Error('正在检测模型连接，请稍后再发送。');
    agentRuntime.start(payload);
  });
  ipcMain.handle('companion:test-model-connection', async (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!modelConfig) throw new Error('模型设置还未就绪。');
    if (systemSleeping || screenLocked) throw new Error('电脑已休眠或锁定，请解锁后重新检测。');
    if (modelConfigWrites > 0) throw new Error('正在保存模型设置，请稍后检测。');
    cancelConnectionTest();
    agentRuntime?.cancel();
    cancelScreenCapture();
    const controller = new AbortController();
    connectionTest = controller;
    try {
      const config = modelConfig.resolveForConnectionTest(payload);
      return await checkModelConnection(config, { signal: controller.signal });
    } finally {
      if (connectionTest === controller) connectionTest = null;
    }
  });
  ipcMain.handle('companion:cancel-agent', (event, requestId: unknown) => {
    assertTrustedSender(event);
    agentRuntime?.cancel(validateCaptureRequestId(requestId));
  });
  ipcMain.handle('companion:set-always-on-top', (event, value: unknown) => {
    const win = assertTrustedSender(event);
    if (typeof value !== 'boolean') throw new Error('置顶状态必须是布尔值。');
    // Keep the selected presentation's taskbar policy for the legacy toggle.
    win.setAlwaysOnTop(true, getLayout().fullscreen ? 'screen-saver' : 'floating');
    return win.isAlwaysOnTop();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    ...getLayout().getBounds(getDisplays()),
    title: '伴屏 · 演示版',
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = win;
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => setMode(currentMode));
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    windowPresentationRevision += 1;
    presentationVisible = false;
    stopDesktopWork();
    setMode('idle', false);
    win.hide();
  });
  win.on('blur', () => { petDrag = null; });
  win.on('closed', () => { stopDesktopWork(); mainWindow = null; });
  win.on('enter-full-screen', publishDisplayState);
  win.on('leave-full-screen', () => {
    // Some platforms finish the transition after setFullScreen(false) returns.
    // Apply the saved normal bounds again once the native transition finishes.
    if (!getLayout().fullscreen && !win.isDestroyed()) setBoundsIfChanged(win, getLayout().getBounds(getDisplays()));
    publishDisplayState();
  });
  win.webContents.on('did-start-navigation', stopDesktopWork);
  win.webContents.on('render-process-gone', stopDesktopWork);
  win.webContents.on('will-prevent-unload', (event) => {
    if (!quitting) return;
    // A hidden feature panel can still contain the draft that blocked quitting.
    setMode('canvas');
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '还有未保存的草稿',
      message: '退出前，要保留当前草稿继续编辑吗？',
      detail: '选择“放弃草稿并退出”会丢弃尚未保存的修改。已经保存到本机的资料会保留。',
      buttons: ['继续编辑', '放弃草稿并退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice === 1) {
      // In Electron this overrides the renderer's request to cancel unloading.
      event.preventDefault();
    } else {
      quitting = false;
      win.webContents.send('companion:edit-draft');
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedPage(url)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents === win.webContents && isTrustedPage(contents.getURL()) && permission === 'clipboard-sanitized-write');
  });
  win.webContents.session.setPermissionCheckHandler((contents, permission) => {
    return contents === win.webContents && isTrustedPage(contents.getURL()) && permission === 'clipboard-sanitized-write';
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape' && getLayout().fullscreen) {
      event.preventDefault();
      getLayout().fullscreen = false;
      petDrag = null;
      applyWindowLayout();
      return;
    }
    if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    }
  });
  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) console.error('[companion] 页面加载失败: ' + code + ' ' + description);
  });

  const devUrl = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;
  let load: Promise<void>;
  if (devUrl) {
    if (!isTrustedPage(devUrl)) throw new Error('开发页面必须为 ' + DEV_ENTRY);
    const url = new URL(DEV_ENTRY);
    const requested = process.env.CHARACTER_STATE;
    if (requested && CHARACTER_STATES.has(requested)) url.searchParams.set('state', requested);
    if (process.env.CHARACTER_MODE === 'original') url.searchParams.set('character', 'original');
    load = win.loadURL(url.href);
  } else {
    load = win.loadFile(PAGE_PATH);
  }
  void load.catch((error: unknown) => {
    console.error('[companion] 无法加载界面，请先构建或启动开发服务。', error);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setMode('input'));
  app.on('before-quit', () => { quitting = true; presentationVisible = false; windowPresentationRevision += 1; stopDesktopWork(); });
  app.on('will-quit', () => {
    if (app.isReady()) globalShortcut.unregisterAll();
    tray?.destroy();
    tray = null;
  });
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });
  app.whenReady().then(async () => {
    modelConfig = new ModelConfigStore(app.getPath('userData'));
    await modelConfig.load();
    agentRuntime = new AgentRuntime({
      getConfig: () => {
        if (!modelConfig) throw new Error('模型设置还未就绪。');
        return modelConfig.getRuntime();
      },
      capture: async (requestId, signal) => {
        if (signal.aborted) throw new Error('截图已取消。');
        return captureForWindow(requestId);
      },
      cancelCapture: cancelScreenCapture,
      emit: (event) => {
        const win = mainWindow;
        if (win && !win.isDestroyed() && !quitting && isTrustedPage(win.webContents.getURL())) win.webContents.send('companion:agent-event', event);
      },
    });
    registerIpc();
    let wakeShortcutRegistered = false;
    try {
      wakeShortcutRegistered = globalShortcut.register(WAKE_SHORTCUT, () => setMode('input'));
    } catch {
      // The tray remains usable if the OS denies a shortcut registration.
    }
    if (!wakeShortcutRegistered) console.warn('[companion] Ctrl+Alt+Space 不可用，请点击托盘唤出。');
    createTray(wakeShortcutRegistered);
    createWindow();
    app.on('activate', () => setMode('input'));
    const restoreVisibleBounds = (): void => {
      const win = mainWindow;
      if (win && !win.isDestroyed()) {
        petDrag = null;
        applyWindowLayout();
      }
    };
    screen.on('display-added', restoreVisibleBounds);
    screen.on('display-removed', restoreVisibleBounds);
    screen.on('display-metrics-changed', restoreVisibleBounds);
    powerMonitor.on('suspend', () => {
      systemSleeping = true;
      windowPresentationRevision += 1;
      stopDesktopWork();
    });
    powerMonitor.on('lock-screen', () => {
      screenLocked = true;
      windowPresentationRevision += 1;
      stopDesktopWork();
    });
    const resumeWindow = (): void => {
      restoreVisibleBounds();
      const win = mainWindow;
      if (win && !win.isDestroyed() && !systemSleeping && !screenLocked && presentationVisible && !captureOperations) win.showInactive();
    };
    powerMonitor.on('resume', () => { systemSleeping = false; resumeWindow(); });
    powerMonitor.on('unlock-screen', () => { screenLocked = false; resumeWindow(); });
  }).catch((error: unknown) => {
    console.error('[companion] 桌面初始化失败。', error);
    app.quit();
  });
}

process.on('uncaughtException', (error) => {
  console.error('[companion] 主进程异常。', error);
  app.quit();
});
