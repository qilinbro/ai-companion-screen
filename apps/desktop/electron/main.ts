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
  screen,
  Tray,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import { cancelScreenCapture, capturePrimaryScreen, validateCaptureRequestId } from './screen-capture';
import { ModelConfigStore } from './model-config';
import { AgentRuntime } from './agent-runtime';

type WindowMode = 'idle' | 'input' | 'canvas';

const DEV_ENTRY = 'http://127.0.0.1:5173/character.html';
const PAGE_PATH = path.join(__dirname, '..', 'dist', 'character.html');
const FILE_ENTRY = pathToFileURL(PAGE_PATH).href;
const CHARACTER_STATES = new Set(['idle', 'curious', 'thinking', 'feedback']);
const WAKE_SHORTCUT = 'Control+Alt+Space';
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentMode: WindowMode = 'idle';
let compactWindowBounds: Rectangle | null = null;
let petDrag: { cursor: Electron.Point; bounds: Rectangle; compact: Rectangle } | null = null;
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
const userDataDir = process.env.COMPANION_USER_DATA_DIR;
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

function fitBounds(mode: WindowMode, previous?: Rectangle): Rectangle {
  const display = previous
    ? screen.getDisplayMatching(previous)
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  const margin = Math.min(20, Math.floor(Math.min(area.width, area.height) / 20));
  const availableWidth = Math.max(1, area.width - margin * 2);
  const width = Math.min(mode === 'idle' ? 180 : mode === 'input' ? 380 : 880, availableWidth);
  const height = Math.min(mode === 'idle' ? 180 : mode === 'input' ? 300 : 680, Math.max(1, area.height - margin * 2));
  // Keep the pet at the same bottom-center point when its input unfolds upward.
  // The initial position leaves enough room for the wider input near the edge.
  const anchorX = previous
    ? previous.x + previous.width / 2
    : area.x + area.width - margin - Math.min(380, availableWidth) / 2;
  const anchorBottom = previous ? previous.y + previous.height : area.y + area.height - margin;
  const x = anchorX - width / 2;
  const y = anchorBottom - height;
  return {
    x: Math.round(Math.min(Math.max(x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - height)),
    width,
    height,
  };
}

function setMode(mode: WindowMode, reveal = true): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  windowPresentationRevision += 1;
  cancelScreenCapture();
  const previous = win.getBounds();
  petDrag = null;
  // Keep the logical pet anchor when an unfolded input must fit near an edge.
  // Only a user drag changes that anchor, not the temporary layout clamp.
  compactWindowBounds ??= previous;
  const anchorBounds = currentMode === 'canvas' && mode === 'canvas' ? previous : compactWindowBounds;
  currentMode = mode;
  win.setResizable(false);
  win.setBounds(fitBounds(mode, anchorBounds));
  win.setAlwaysOnTop(true);
  win.setSkipTaskbar(true);
  win.webContents.send('companion:mode', mode);
  if (reveal) {
    if (win.isMinimized()) win.restore();
    if (mode === 'idle') win.showInactive();
    else {
      win.show();
      win.focus();
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
  ipcMain.handle('companion:drag-window', (event, phase: unknown, origin: unknown) => {
    const win = assertTrustedSender(event);
    if (phase !== 'start' && phase !== 'move' && phase !== 'end') throw new TypeError('未知拖动动作。');
    if (phase === 'end' || quitting || !win.isVisible() || win.isMinimized()) { petDrag = null; return; }
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
      petDrag = { cursor: { x: bounds.x + x * zoom, y: bounds.y + y * zoom }, bounds, compact: currentMode === 'canvas' ? compactWindowBounds ?? bounds : bounds };
      return;
    }
    if (!petDrag) return;
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const { bounds, compact } = petDrag;
    const x = Math.round(Math.max(area.x, Math.min(bounds.x + cursor.x - petDrag.cursor.x, area.x + area.width - bounds.width)));
    const y = Math.round(Math.max(area.y, Math.min(bounds.y + cursor.y - petDrag.cursor.y, area.y + area.height - bounds.height)));
    win.setPosition(x, y);
    compactWindowBounds = { ...compact, x: compact.x + x - bounds.x, y: compact.y + y - bounds.y };
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
    cancelScreenCapture();
    petDrag = null;
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
    const win = assertTrustedSender(event);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('截图请求必须是对象。');
    const requestId = validateCaptureRequestId((payload as Record<string, unknown>).requestId);
    const revision = windowPresentationRevision;
    return capturePrimaryScreen({ requestId, window: win, mayRestore: () => mainWindow === win && !quitting && revision === windowPresentationRevision });
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
    agentRuntime?.cancel();
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
    agentRuntime?.cancel();
    try { return await modelConfig.clearSecret(); }
    finally { modelConfigWrites -= 1; }
  });
  ipcMain.handle('companion:run-agent', (event, payload: unknown) => {
    assertTrustedSender(event);
    if (!agentRuntime) throw new Error('模型服务还未就绪。');
    if (modelConfigWrites > 0) throw new Error('正在保存模型设置，请稍后再发送。');
    agentRuntime.start(payload);
  });
  ipcMain.handle('companion:cancel-agent', (event, requestId: unknown) => {
    assertTrustedSender(event);
    agentRuntime?.cancel(validateCaptureRequestId(requestId));
  });
  ipcMain.handle('companion:set-always-on-top', (event, value: unknown) => {
    const win = assertTrustedSender(event);
    if (typeof value !== 'boolean') throw new Error('置顶状态必须是布尔值。');
    // This pet demo remains visible above other windows in both modes.
    win.setAlwaysOnTop(true);
    return win.isAlwaysOnTop();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    ...fitBounds(currentMode),
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
    cancelScreenCapture();
    win.hide();
  });
  win.on('blur', () => { petDrag = null; });
  win.on('closed', () => { petDrag = null; agentRuntime?.cancel(); cancelScreenCapture(); mainWindow = null; });
  win.webContents.on('did-start-navigation', () => { petDrag = null; agentRuntime?.cancel(); cancelScreenCapture(); });
  win.webContents.on('render-process-gone', () => { petDrag = null; agentRuntime?.cancel(); cancelScreenCapture(); });
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
  app.on('before-quit', () => { quitting = true; windowPresentationRevision += 1; agentRuntime?.cancel(); cancelScreenCapture(); });
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
        const win = mainWindow;
        if (!win || win.isDestroyed() || signal.aborted) throw new Error('截图已取消。');
        const revision = windowPresentationRevision;
        return capturePrimaryScreen({ requestId, window: win, mayRestore: () => mainWindow === win && !quitting && revision === windowPresentationRevision });
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
      if (win && !win.isDestroyed()) win.setBounds(fitBounds(currentMode, win.getBounds()));
    };
    screen.on('display-removed', restoreVisibleBounds);
    screen.on('display-metrics-changed', restoreVisibleBounds);
  }).catch((error: unknown) => {
    console.error('[companion] 桌面初始化失败。', error);
    app.quit();
  });
}

process.on('uncaughtException', (error) => {
  console.error('[companion] 主进程异常。', error);
  app.quit();
});
