import { useEffect, useRef, useState } from 'react';
import { UnavailableCharacter } from './UnavailableCharacter';
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
      .catch(() => {
        if (cancelled) return;
        console.warn('[character] 原角色未加载，请检查本机角色素材后重启。');
        setFailed(true);
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

  if (failed) return <UnavailableCharacter state={state} />;

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
