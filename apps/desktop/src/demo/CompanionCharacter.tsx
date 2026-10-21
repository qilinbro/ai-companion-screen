import { StudyCharacter } from '../character/StudyCharacter';
import { UnavailableCharacter } from '../character/UnavailableCharacter';
import type { CharacterState } from '../character/types';

export function CompanionCharacter({ state, reducedMotion = false }: { state: CharacterState; reducedMotion?: boolean }) {
  // The local-only entry loads the user's existing character from this machine.
  // Public builds remove this branch and never include the character assets.
  if (import.meta.env.DEV || import.meta.env.MODE === 'local-character') {
    return <StudyCharacter state={state} reducedMotion={reducedMotion} />;
  }
  return <UnavailableCharacter state={state} reason="not-included" />;
}
