import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenCaptureResult } from './screen-capture';
import type { PublicModelConfig, SaveModelConfigInput } from './model-config';
import type { AgentEvent } from './agent-runtime';

type WindowMode = 'idle' | 'input' | 'canvas';

contextBridge.exposeInMainWorld('companion', Object.freeze({
  version: 1,
  setMode: (mode: WindowMode): Promise<void> => ipcRenderer.invoke('companion:set-mode', mode),
  dragWindow: (phase: 'start' | 'move' | 'end', origin?: { x: number; y: number }): Promise<void> => ipcRenderer.invoke('companion:drag-window', phase, origin),
  hide: (): Promise<void> => ipcRenderer.invoke('companion:hide'),
  quit: (): Promise<void> => ipcRenderer.invoke('companion:quit'),
  notifyReminder: (reminder: { id: string; title: string }): Promise<{ shown: boolean }> => ipcRenderer.invoke('companion:notify-reminder', reminder),
  captureScreen: (request: { requestId: string }): Promise<ScreenCaptureResult> => ipcRenderer.invoke('companion:capture-screen', request),
  cancelScreenCapture: (requestId: string): Promise<void> => ipcRenderer.invoke('companion:cancel-screen-capture', requestId),
  getModelConfig: (): Promise<PublicModelConfig> => ipcRenderer.invoke('companion:get-model-config'),
  saveModelConfig: (input: SaveModelConfigInput): Promise<PublicModelConfig> => ipcRenderer.invoke('companion:save-model-config', input),
  clearModelSecret: (): Promise<PublicModelConfig> => ipcRenderer.invoke('companion:clear-model-secret'),
  runAgent: (request: { requestId: string; prompt: string; conversationId?: string }): Promise<void> => ipcRenderer.invoke('companion:run-agent', request),
  cancelAgent: (requestId: string): Promise<void> => ipcRenderer.invoke('companion:cancel-agent', requestId),
  onAgentEvent: (listener: (event: AgentEvent) => void): (() => void) => {
    if (typeof listener !== 'function') throw new TypeError('模型事件监听器必须是函数。');
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const item = value as Record<string, unknown>;
      if (typeof item.requestId !== 'string') return;
      if (item.type === 'status' && ['thinking', 'viewing', 'responding'].includes(String(item.status))) listener(value as AgentEvent);
      else if (item.type === 'delta' && typeof item.delta === 'string') listener(value as AgentEvent);
      else if (item.type === 'capture' && item.capture && typeof item.capture === 'object') listener(value as AgentEvent);
      else if (item.type === 'done' && (item.finishReason === 'completed' || item.finishReason === 'cancelled')) listener(value as AgentEvent);
      else if (item.type === 'error' && typeof item.message === 'string') listener(value as AgentEvent);
    };
    ipcRenderer.on('companion:agent-event', handler);
    return () => ipcRenderer.removeListener('companion:agent-event', handler);
  },
  setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke('companion:set-always-on-top', value),
  onEditDraft: (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') throw new TypeError('草稿编辑监听器必须是函数。');
    let active = true;
    const handler = (): void => { if (active) listener(); };
    ipcRenderer.on('companion:edit-draft', handler);
    return () => {
      active = false;
      ipcRenderer.removeListener('companion:edit-draft', handler);
    };
  },
  onMode: (listener: (mode: WindowMode) => void): (() => void) => {
    if (typeof listener !== 'function') throw new TypeError('窗口状态监听器必须是函数。');
    let active = true;
    let receivedEvent = false;
    const handler = (_event: Electron.IpcRendererEvent, mode: unknown): void => {
      if (!active || (mode !== 'idle' && mode !== 'input' && mode !== 'canvas')) return;
      receivedEvent = true;
      listener(mode);
    };
    ipcRenderer.on('companion:mode', handler);
    void ipcRenderer.invoke('companion:get-mode').then((mode: unknown) => {
      if (active && !receivedEvent && (mode === 'idle' || mode === 'input' || mode === 'canvas')) listener(mode);
    }).catch(() => {
      // A closed or untrusted page cannot subscribe to desktop controls.
    });
    return () => {
      active = false;
      ipcRenderer.removeListener('companion:mode', handler);
    };
  },
}));
