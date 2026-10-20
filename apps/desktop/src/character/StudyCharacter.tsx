import { useEffect, useRef, useState } from 'react';
import { OriginalCharacter } from './OriginalCharacter';
import { mountStudyCharacter } from './study-loader';
import { CHARACTER_LABELS, type CharacterHandle, type CharacterState } from './types';

export function StudyCharacter({ state, reducedMotion = false }: { state: CharacterState; reducedMotion?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const handleRef = useRef<CharacterHandle | null>(null);
  const stateRef = useRef(state);
  const [failed, setFailed] = useState(false);

  stateRef.current = state;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let cancelled = false;
    const controller = new AbortController();
    mountStudyCharacter(svg, { state: stateRef.current, signal: controller.signal, reducedMotion })
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        handle.setState(stateRef.current);
        handle.setPaused(document.hidden);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[character] 学习占位加载失败，回退原创占位。', error);
        if (!cancelled) setFailed(true);
      });

    const onVisibility = (): void => handleRef.current?.setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!failed) handleRef.current?.setState(state);
  }, [state, failed]);

  if (failed) return <OriginalCharacter state={state} />;

  return (
    <svg
      ref={svgRef}
      className="character character-study"
      data-animation-state={state}
      role="img"
      aria-label={`伴屏 · ${CHARACTER_LABELS[state]}`}
    />
  );
}
