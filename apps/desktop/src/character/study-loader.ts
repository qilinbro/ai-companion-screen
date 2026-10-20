import type {
  GrokCharacterConstructor,
  GrokCharacterInstance,
  GrokCharacterOptions,
} from './grok';
import { toStudyState } from './study-map';
import type { CharacterHandle, CharacterState } from './types';

const SCRIPT_BASE = '/__study';
const SCRIPTS: readonly string[] = [
  `${SCRIPT_BASE}/geometry-data.js`,
  `${SCRIPT_BASE}/src/math.js`,
  `${SCRIPT_BASE}/src/tables.js`,
  `${SCRIPT_BASE}/src/pose.js`,
  `${SCRIPT_BASE}/src/tricks.js`,
  `${SCRIPT_BASE}/src/fx.js`,
  `${SCRIPT_BASE}/src/eyes.js`,
  `${SCRIPT_BASE}/src/character.js`,
];

let enginePromise: Promise<GrokCharacterConstructor> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.studySrc = src;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error(`无法加载学习占位脚本: ${src}`));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
}

export function loadStudyEngine(): Promise<GrokCharacterConstructor> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    for (const src of SCRIPTS) {
      await loadScript(src);
    }
    const constructor = window.GrokCharacter;
    if (typeof constructor !== 'function') {
      throw new Error('学习占位引擎未注册 window.GrokCharacter');
    }
    return constructor;
  })().catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });

  return enginePromise;
}

export interface MountStudyOptions {
  state: CharacterState;
  sizePx?: number;
  signal?: AbortSignal;
  reducedMotion?: boolean;
}

export async function mountStudyCharacter(
  svg: SVGSVGElement,
  options: MountStudyOptions,
): Promise<CharacterHandle> {
  const Constructor = await loadStudyEngine();
  if (options.signal?.aborted) throw new DOMException('角色挂载已取消。', 'AbortError');
  const reduceMotion = options.reducedMotion ||
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const engineOptions: GrokCharacterOptions = {
    sizePx: options.sizePx,
    shape: 'blob',
    color: 'black',
    scheme: 'light',
    mode: 'hold',
    state: 'idle',
    loginWrap: true,
    followPointer: false,
    reduceMotion,
  };

  let instance: GrokCharacterInstance;
  try {
    instance = new Constructor(svg, engineOptions);
  } catch (error) {
    svg.replaceChildren();
    throw error;
  }

  let currentState: CharacterState | undefined;
  const setState = (state: CharacterState): void => {
    if (currentState === state) return;
    currentState = state;
    // The original pencil overlay keeps drawing even with reduced motion;
    // use its quiet working face in that accessibility mode.
    instance.setState(reduceMotion && state === 'responding' ? 'working' : toStudyState(state), { resetEyes: false });
  };

  try {
    setState(options.state);
  } catch (error) {
    instance.destroy();
    svg.replaceChildren();
    throw error;
  }
  console.info('[character] 学习占位已加载；仅本机开发使用，不随构建分发。');

  return {
    setState,
    setPaused: (paused: boolean) => instance.setPaused(paused),
    dispose: () => {
      instance.destroy();
      svg.replaceChildren();
    },
  };
}
