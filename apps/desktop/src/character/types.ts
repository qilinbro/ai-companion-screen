export type CharacterState = 'idle' | 'curious' | 'thinking' | 'viewing' | 'responding' | 'feedback' | 'error' | 'dragging';

export const CHARACTER_STATES: readonly CharacterState[] = ['idle', 'curious', 'thinking', 'viewing', 'responding', 'feedback', 'error', 'dragging'];

export const CHARACTER_LABELS: Record<CharacterState, string> = {
  idle: '陪伴中', curious: '等你输入', thinking: '正在思考', viewing: '正在查看画面',
  responding: '正在回复', feedback: '回复完成', error: '暂时遇到问题', dragging: '正在移动',
};

export interface CharacterHandle {
  setState(state: CharacterState): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export function parseCharacterState(value: string | null): CharacterState {
  if (value === null || value === '') return 'idle';
  for (const state of CHARACTER_STATES) {
    if (state === value) return state;
  }
  console.warn(`[character] 未知 state=${value}，使用 idle`);
  return 'idle';
}
