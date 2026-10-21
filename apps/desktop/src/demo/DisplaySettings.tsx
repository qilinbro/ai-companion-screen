import { useEffect, useRef, useState } from 'react';
import type { DisplayState } from './desktop';

export function DisplaySettings({ state, onChange }: { state: DisplayState | null; onChange: (state: DisplayState) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function update(action: () => Promise<DisplayState> | undefined) {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await action(); if (next && mounted.current) onChange(next); }
    catch { if (mounted.current) setError('显示器已变化或暂时不可用，请重新选择。'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className="display-settings" aria-labelledby="canvas-display-heading" aria-busy={busy}>
    <h3 id="canvas-display-heading">画布位置</h3>
    {state ? <>
      <label className="model-setting-field"><span>显示器</span><select value={state.canvasDisplayId} disabled={busy} onChange={(event) => { const id = Number(event.target.value); void update(() => window.companion?.setCanvasDisplay(id)); }}>
        {state.displays.map((display, index) => <option key={display.id} value={display.id}>{display.isPrimary ? '主屏' : '副屏'} · {display.label || `显示器 ${index + 1}`} · {Math.round(display.scaleFactor * 100)}%</option>)}
      </select></label>
      <div className="display-setting-actions"><p className="model-setting-note">{state.displays.length === 1 ? '当前连接了 1 台显示器。' : '选择后立即移动画布，会话继续保留。'}</p><button type="button" disabled={busy} onClick={() => void update(() => window.companion?.setCanvasFullscreen(!state.fullscreen))}>{state.fullscreen ? '退出全屏' : '全屏展开'}</button></div>
      <p className="model-setting-note">Esc 退出全屏。收起后宠物回到原处；获准读屏时仍只读取主屏。</p>
    </> : <p className="model-setting-note">显示器选择仅在桌面应用中可用。</p>}
    {error ? <p className="model-setting-note" role="alert">{error}</p> : null}
  </section>;
}
