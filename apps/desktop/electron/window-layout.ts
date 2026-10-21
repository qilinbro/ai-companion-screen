/** Electron exposes both window bounds and display work areas in DIP. Do not
 * multiply these values by scaleFactor: that is only for screenshot pixels. */
export type WindowMode = 'idle' | 'input' | 'canvas';
export type Rect = { x: number; y: number; width: number; height: number };
export type DisplayInfo = {
  id: number;
  label: string;
  isPrimary: boolean;
  scaleFactor: number;
  bounds: Rect;
  workArea: Rect;
};
export type DisplayState = {
  displays: DisplayInfo[];
  canvasDisplayId: number;
  fullscreen: boolean;
  mode: WindowMode;
};

export function clampBounds(bounds: Rect, area: Rect): Rect {
  const width = Math.max(1, Math.min(Math.round(bounds.width), area.width));
  const height = Math.max(1, Math.min(Math.round(bounds.height), area.height));
  return {
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
    width,
    height,
  };
}

export function nearestDisplay(bounds: Rect, displays: DisplayInfo[]): DisplayInfo {
  if (!displays.length) throw new Error('没有可用显示器。');
  let best = displays.find((display) => display.isPrimary) ?? displays[0]!;
  let distance = Infinity;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  for (const display of displays) {
    const area = display.workArea;
    const dx = Math.max(area.x - x, 0, x - (area.x + area.width));
    const dy = Math.max(area.y - y, 0, y - (area.y + area.height));
    const value = dx * dx + dy * dy;
    if (value < distance) { best = display; distance = value; }
  }
  return best;
}

export function fitPetBounds(mode: 'idle' | 'input', display: DisplayInfo, anchor?: Rect): Rect {
  const area = display.workArea;
  const margin = Math.min(20, Math.floor(Math.min(area.width, area.height) / 20));
  const width = Math.min(mode === 'idle' ? 180 : 380, Math.max(1, area.width - margin * 2));
  const height = Math.min(mode === 'idle' ? 180 : 300, Math.max(1, area.height - margin * 2));
  const center = anchor ? anchor.x + anchor.width / 2 : area.x + area.width - margin - Math.min(380, area.width - margin * 2) / 2;
  const bottom = anchor ? anchor.y + anchor.height : area.y + area.height - margin;
  return clampBounds({ x: center - width / 2, y: bottom - height, width, height }, area);
}

export function fitCanvasBounds(display: DisplayInfo, previous?: Rect): Rect {
  const area = display.workArea;
  const margin = Math.min(24, Math.floor(Math.min(area.width, area.height) / 20));
  const width = Math.min(previous?.width ?? 960, Math.max(1, area.width - margin * 2));
  const height = Math.min(previous?.height ?? 740, Math.max(1, area.height - margin * 2));
  return clampBounds({ x: previous?.x ?? area.x + (area.width - width) / 2, y: previous?.y ?? area.y + (area.height - height) / 2, width, height }, area);
}

/** Layout state deliberately owns no task or model state. Moving the one
 * existing BrowserWindow cannot replay a request or recreate the renderer. */
export class WindowLayout {
  mode: WindowMode = 'idle';
  fullscreen = false;
  petBounds: Rect;
  private preferredCanvasDisplayId: number;
  private readonly canvasBounds = new Map<number, Rect>();

  constructor(displays: DisplayInfo[]) {
    const primary = displays.find((display) => display.isPrimary) ?? displays[0];
    if (!primary) throw new Error('没有可用显示器。');
    this.petBounds = fitPetBounds('idle', primary);
    this.preferredCanvasDisplayId = primary.id;
  }

  canvasDisplay(displays: DisplayInfo[]): DisplayInfo {
    const display = displays.find((item) => item.id === this.preferredCanvasDisplayId)
      ?? displays.find((item) => item.isPrimary) ?? displays[0];
    if (!display) throw new Error('没有可用显示器。');
    return display;
  }

  selectDisplay(id: number, displays: DisplayInfo[]): void {
    if (!Number.isInteger(id) || !displays.some((display) => display.id === id)) throw new Error('该显示器当前不可用，请重新选择。');
    this.preferredCanvasDisplayId = id;
  }

  setMode(mode: WindowMode): void {
    this.mode = mode;
    if (mode !== 'canvas') this.fullscreen = false;
  }

  reconcile(displays: DisplayInfo[]): void {
    this.petBounds = clampBounds(this.petBounds, nearestDisplay(this.petBounds, displays).workArea);
    for (const display of displays) {
      const previous = this.canvasBounds.get(display.id);
      if (previous) this.canvasBounds.set(display.id, fitCanvasBounds(display, previous));
    }
    // Keep the preferred display ID during unplugging. Reconnecting that
    // display can restore its canvas while the fallback stays visible now.
  }

  getBounds(displays: DisplayInfo[]): Rect {
    if (this.mode !== 'canvas') return fitPetBounds(this.mode, nearestDisplay(this.petBounds, displays), this.petBounds);
    const display = this.canvasDisplay(displays);
    if (this.fullscreen) return { ...display.bounds };
    return fitCanvasBounds(display, this.canvasBounds.get(display.id));
  }

  rememberCanvas(bounds: Rect, displays: DisplayInfo[]): void {
    if (this.mode === 'canvas' && !this.fullscreen) {
      const display = this.canvasDisplay(displays);
      this.canvasBounds.set(display.id, fitCanvasBounds(display, bounds));
    }
  }

  moveCanvas(bounds: Rect, display: DisplayInfo): void {
    this.preferredCanvasDisplayId = display.id;
    this.canvasBounds.set(display.id, clampBounds(bounds, display.workArea));
  }

  snapshot(displays: DisplayInfo[]): DisplayState {
    return { displays, canvasDisplayId: this.canvasDisplay(displays).id, fullscreen: this.fullscreen, mode: this.mode };
  }
}
