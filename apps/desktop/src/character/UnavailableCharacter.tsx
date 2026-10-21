import type { CharacterState } from './types';

export function UnavailableCharacter({ state, reason = 'missing' }: {
  state: CharacterState;
  reason?: 'missing' | 'not-included';
}) {
  return (
    <span className="character-unavailable" data-animation-state={state}>
      <span>{reason === 'not-included' ? '原角色未随附' : '原角色未加载'}</span>
      <span className="character-unavailable-action">点击输入</span>
    </span>
  );
}
