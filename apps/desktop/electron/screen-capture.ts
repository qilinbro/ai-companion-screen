import { desktopCapturer, screen, type BrowserWindow } from 'electron';

export type ScreenCaptureResult = {
  requestId: string;
  dataUrl: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  displayLabel: string;
  capturedAt: string;
};
type CaptureJob = { requestId: string; controller: AbortController };
let activeCapture: CaptureJob | null = null;
let acquiringSource = false;

export function validateCaptureRequestId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new TypeError('截图请求 ID 必须为 1 到 120 位字母、数字、下划线或短横线。');
  }
  return value;
}

function interrupted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('截图已取消。');
}
function checkCurrent(job: CaptureJob): void {
  if (job.controller.signal.aborted || activeCapture !== job) throw interrupted(job.controller.signal);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(interrupted(signal)); return; }
    const onAbort = (): void => reject(interrupted(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function cancelScreenCapture(requestId?: string): void {
  if (activeCapture && (requestId === undefined || activeCapture.requestId === requestId)) {
    activeCapture.controller.abort(new Error('截图已取消。'));
  }
}

export async function capturePrimaryScreen(options: {
  requestId: string;
  window: BrowserWindow;
  mayRestore: () => boolean;
}): Promise<ScreenCaptureResult> {
  const requestId = validateCaptureRequestId(options.requestId);
  if (activeCapture || acquiringSource) throw new Error('正在读取上一张屏幕，请稍后重试。');
  const win = options.window;
  if (win.isDestroyed()) throw new Error('桌面窗口已关闭。');
  const job: CaptureJob = { requestId, controller: new AbortController() };
  activeCapture = job;
  const timeout = setTimeout(() => job.controller.abort(new Error('读取屏幕超时，请重试。')), 20000);
  const wasVisible = win.isVisible() && !win.isMinimized();
  let hiddenByCapture = false;
  const restore = (): void => {
    if (!hiddenByCapture) return;
    hiddenByCapture = false;
    if (!win.isDestroyed() && options.mayRestore()) win.showInactive();
  };
  try {
    const primary = screen.getPrimaryDisplay();
    const pixelWidth = Math.max(1, Math.round(primary.size.width * primary.scaleFactor));
    const pixelHeight = Math.max(1, Math.round(primary.size.height * primary.scaleFactor));
    const ratio = Math.min(1, 2560 / Math.max(pixelWidth, pixelHeight));
    const thumbnailSize = { width: Math.max(1, Math.round(pixelWidth * ratio)), height: Math.max(1, Math.round(pixelHeight * ratio)) };
    if (wasVisible) { hiddenByCapture = true; win.hide(); }
    await abortable(new Promise<void>((resolve) => setTimeout(resolve, 220)), job.controller.signal);
    checkCurrent(job);
    acquiringSource = true;
    let sourcesPromise: ReturnType<typeof desktopCapturer.getSources>;
    try {
      sourcesPromise = desktopCapturer.getSources({ types: ['screen'], thumbnailSize, fetchWindowIcons: false });
    } catch (error) {
      acquiringSource = false;
      throw error;
    }
    void sourcesPromise.then(() => { acquiringSource = false; }, () => { acquiringSource = false; });
    const sources = await abortable(sourcesPromise, job.controller.signal);
    checkCurrent(job);
    // The canvas target is unrelated to capture. If Windows changed the primary
    // display during acquisition, discard rather than returning a former primary.
    if (screen.getPrimaryDisplay().id !== primary.id) throw new Error('主屏幕已变更，请重新读取当前画面。');
    const source = sources.find((item) => item.display_id === String(primary.id));
    if (!source || source.thumbnail.isEmpty()) throw new Error('未获取到主屏幕画面。请检查系统屏幕捕获设置后重试。');
    let image = source.thumbnail;
    const sourceSize = image.getSize();
    if (Math.max(sourceSize.width, sourceSize.height) > 2560) {
      const resizeRatio = 2560 / Math.max(sourceSize.width, sourceSize.height);
      image = image.resize({ width: Math.max(1, Math.round(sourceSize.width * resizeRatio)), height: Math.max(1, Math.round(sourceSize.height * resizeRatio)), quality: 'best' });
    }
    const { width, height } = image.getSize();
    const png = image.toPNG();
    if (!png.length || png.length > 24 * 1024 * 1024) throw new Error('屏幕图像大小异常，请重试。');
    const capturedAt = new Date().toISOString();
    // Restore once pixels arrive without changing the mode or stealing focus.
    restore();
    checkCurrent(job);
    return { requestId, dataUrl: `data:image/png;base64,${png.toString('base64')}`, mimeType: 'image/png', width, height, displayLabel: primary.label || `主屏幕 ${primary.id}`, capturedAt };
  } finally {
    clearTimeout(timeout);
    restore();
    if (activeCapture === job) activeCapture = null;
  }
}

