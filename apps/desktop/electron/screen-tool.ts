import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { capturePrimaryScreen } from './screen-capture';

// Code-level adapter for a future model runtime. This module does not create a
// server, connect to a model, or decide when an external service may see pixels.
export const CAPTURE_SCREEN_TOOL = Object.freeze({
  type: 'function' as const,
  name: 'capture_screen',
  description: 'Capture one current image of the primary display. Returns PNG image data and capture metadata. Does not interpret the image, run commands, or retain a screenshot.',
  strict: true,
  parameters: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
});

export type CaptureScreenToolResult = {
  mimeType: 'image/png';
  base64: string;
  metadata: { requestId: string; width: number; height: number; displayLabel: string; capturedAt: string };
};

export async function callCaptureScreenTool(args: unknown, context: {
  requestId?: string;
  window: BrowserWindow;
  mayRestore: () => boolean;
}): Promise<CaptureScreenToolResult> {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Reflect.ownKeys(args).length !== 0) {
    throw new TypeError('capture_screen 不接受参数。');
  }
  const capture = await capturePrimaryScreen({ ...context, requestId: context.requestId ?? randomUUID() });
  const prefix = 'data:image/png;base64,';
  if (!capture.dataUrl.startsWith(prefix)) throw new Error('截图没有返回 PNG 数据。');
  return {
    mimeType: capture.mimeType,
    base64: capture.dataUrl.slice(prefix.length),
    metadata: { requestId: capture.requestId, width: capture.width, height: capture.height, displayLabel: capture.displayLabel, capturedAt: capture.capturedAt },
  };
}
