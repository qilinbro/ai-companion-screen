export interface GrokCharacterInstance {
  setState(name: string, options?: { resetEyes?: boolean }): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

export interface GrokCharacterOptions {
  sizePx?: number;
  shape?: string;
  color?: string;
  scheme?: 'light' | 'dark';
  mode?: 'onboarding' | 'hold';
  state?: string;
  loginWrap?: boolean;
  followPointer?: boolean;
  reduceMotion?: boolean;
  paused?: boolean;
  [key: string]: unknown;
}

export type GrokCharacterConstructor = new (
  svg: SVGSVGElement,
  options?: GrokCharacterOptions,
) => GrokCharacterInstance;

declare global {
  interface Window {
    GrokCharacter?: GrokCharacterConstructor;
  }
}

export {};
