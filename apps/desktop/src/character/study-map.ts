import type { CharacterState } from './types';

const STUDY_STATES: Record<CharacterState, string> = {
  idle: 'idle',
  curious: 'curious',
  thinking: 'thinking',
  viewing: 'searching',
  responding: 'writing',
  feedback: 'happy',
  error: 'confused',
  dragging: 'dragging',
};

export function toStudyState(state: CharacterState): string {
  return STUDY_STATES[state];
}
