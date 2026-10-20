import { StudyCharacter } from '../character/StudyCharacter';
import type { CharacterState } from '../character/types';
import { DotPet } from './DotPet';

export function CompanionCharacter({ state, reducedMotion = false }: { state: CharacterState; reducedMotion?: boolean }) {
  // Local study assets are served only by the development server. Vite removes
  // this branch and its imports from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('character') !== 'original') {
    return <StudyCharacter state={state} reducedMotion={reducedMotion} />;
  }
  return <DotPet state={state} />;
}
