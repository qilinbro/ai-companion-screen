import { useEffect, useRef, useState, type PointerEvent } from 'react';

// A short press stays a click. Window coordinates come from the main process.
export function usePetDrag(mode: string) {
  const gesture = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);
  const [dragging, setDragging] = useState(false);
  function send(phase: 'start' | 'move' | 'end', origin?: { x: number; y: number }) {
    void window.companion?.dragWindow?.(phase, origin).catch(() => undefined);
  }
  function finish() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (gesture.current) {
      if (gesture.current.moved) { send('move'); suppressClickUntil.current = Date.now() + 300; }
      send('end'); gesture.current = null;
    }
    setDragging(false);
  }
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => { window.removeEventListener('blur', finish); finish(); };
  }, [mode]);
  return {
    dragging,
    shouldClick: () => Date.now() > suppressClickUntil.current,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || !event.isPrimary) return;
      // A pointer press must not move keyboard focus to the transparent pet
      // button. Its click still opens the input; Tab/Enter remain available.
      event.preventDefault();
      if (!window.companion?.dragWindow) return;
      gesture.current = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      send('start', { x: event.clientX, y: event.clientY });
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { finish(); return; }
      if (!current.moved && Math.hypot(event.screenX - current.x, event.screenY - current.y) < 5) return;
      current.moved = true; setDragging(true); event.preventDefault();
      if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; send('move'); });
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) { if (gesture.current?.id === event.pointerId) finish(); },
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
}
