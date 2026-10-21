import type {
  GrokCharacterConstructor,
  GrokCharacterInstance,
  GrokCharacterOptions,
} from './grok';
import { toStudyState } from './study-map';
import type { CharacterHandle, CharacterState } from './types';

// The offline local entry references existing files; it does not copy the
// character into build output. The normal release removes this module entirely.
const SCRIPT_PATHS: readonly string[] = [
  'geometry-data.js',
  'src/math.js',
  'src/tables.js',
  'src/pose.js',
  'src/tricks.js',
  'src/fx.js',
  'src/eyes.js',
  'src/character.js',
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
    const scriptBase = import.meta.env.MODE === 'local-character'
      ? (await window.companion?.getCharacterAssetBase?.() ?? new URL('../../../vendor/grok-study/replica', location.href).href).replace(/\/$/, '')
      : '/__study';
    for (const scriptPath of SCRIPT_PATHS) {
      await loadScript(`${scriptBase}/${scriptPath}`);
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
