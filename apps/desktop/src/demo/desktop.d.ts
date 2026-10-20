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
      setMode(mode: 'idle' | 'input' | 'canvas'): Promise<void>;
      dragWindow(phase: 'start' | 'move' | 'end', origin?: { x: number; y: number }): Promise<void>;
      hide(): Promise<void>;
      quit(): Promise<void>;
      notifyReminder(reminder: { id: string; title: string }): Promise<{ shown: boolean }>;
      captureScreen(request: { requestId: string }): Promise<ScreenCaptureResult>;
      cancelScreenCapture(requestId: string): Promise<void>;
      getModelConfig(): Promise<PublicModelConfig>;
      saveModelConfig(input: SaveModelConfigInput): Promise<PublicModelConfig>;
      clearModelSecret(): Promise<PublicModelConfig>;
      runAgent(request: { requestId: string; prompt: string; conversationId?: string }): Promise<void>;
      cancelAgent(requestId: string): Promise<void>;
      onAgentEvent(listener: (event: AgentEvent) => void): () => void;
      setAlwaysOnTop(value: boolean): Promise<boolean>;
      onEditDraft(listener: () => void): () => void;
      onMode(listener: (mode: 'idle' | 'input' | 'canvas') => void): () => void;
    };
  }
}
