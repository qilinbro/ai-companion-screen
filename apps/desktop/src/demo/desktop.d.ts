export type ScreenCaptureResult = {
  requestId: string;
  dataUrl: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  displayLabel: string;
  capturedAt: string;
};
export type PublicModelConfig = {
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  configured: boolean;
  canPersistSecret: boolean;
  allowScreen: boolean;
  persistKey: boolean;
  message?: string;
};
export type SaveModelConfigInput = { baseUrl: string; modelId: string; apiKey?: string; persistKey: boolean; allowScreen: boolean };
export type ModelConnectionResult = {
  ok: boolean;
  code: 'connected' | 'not_configured' | 'authentication' | 'address' | 'model' | 'capability' | 'invalid_response' | 'network' | 'timeout' | 'cancelled' | 'provider_error';
  message: string;
  checks: { text: boolean; streaming: boolean; tools: boolean; vision: 'not_tested' };
};
export type DisplayRect = { x: number; y: number; width: number; height: number };
export type DisplayState = {
  displays: Array<{ id: number; label: string; isPrimary: boolean; scaleFactor: number; bounds: DisplayRect; workArea: DisplayRect }>;
  canvasDisplayId: number;
  fullscreen: boolean;
  mode: 'idle' | 'input' | 'canvas';
};
export type AgentEvent =
  | { requestId: string; type: 'status'; status: 'thinking' | 'viewing' | 'responding' }
  | { requestId: string; type: 'delta'; delta: string }
  | { requestId: string; type: 'capture'; capture: ScreenCaptureResult }
  | { requestId: string; type: 'done'; finishReason: 'completed' | 'cancelled' }
  | { requestId: string; type: 'error'; message: string; code?: string };

declare global {
  interface Window {
    companion?: {
      version: 1;
      getCharacterAssetBase(): Promise<string | null>;
      setMode(mode: 'idle' | 'input' | 'canvas'): Promise<void>;
      dragWindow(phase: 'start' | 'move' | 'end', origin?: { x: number; y: number }): Promise<void>;
      hide(): Promise<void>;
      quit(): Promise<void>;
      notifyReminder(reminder: { id: string; title: string }): Promise<{ shown: boolean }>;
      captureScreen(request: { requestId: string }): Promise<ScreenCaptureResult>;
      cancelScreenCapture(requestId: string): Promise<void>;
      getModelConfig(): Promise<PublicModelConfig>;
      saveModelConfig(input: SaveModelConfigInput): Promise<PublicModelConfig>;
      testModelConnection(input: SaveModelConfigInput): Promise<ModelConnectionResult>;
      clearModelSecret(): Promise<PublicModelConfig>;
      getDisplayState(): Promise<DisplayState>;
      setCanvasDisplay(displayId: number): Promise<DisplayState>;
      setCanvasFullscreen(fullscreen: boolean): Promise<DisplayState>;
      onDisplayState(listener: (state: DisplayState) => void): () => void;
      runAgent(request: { requestId: string; prompt: string; conversationId?: string }): Promise<void>;
      cancelAgent(requestId: string): Promise<void>;
      onAgentEvent(listener: (event: AgentEvent) => void): () => void;
      setAlwaysOnTop(value: boolean): Promise<boolean>;
      onEditDraft(listener: () => void): () => void;
      onMode(listener: (mode: 'idle' | 'input' | 'canvas') => void): () => void;
    };
  }
}
