import { useEffect, useRef, useState } from 'react';
import type { ScreenCaptureResult } from './desktop';
import { Icon } from './Icon';

export type ScreenRequest = { id: string; prompt: string; captureOnOpen: boolean };
export type ScreenState = 'idle' | 'capturing' | 'ready' | 'error';
type Props = { request: ScreenRequest; onClose: () => void; onStateChange?: (state: ScreenState) => void };
function CaptureIcon({ refresh = false }: { refresh?: boolean }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{refresh ? <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1a8 8 0 0 1 13.4 3.4M4.5 14.5a8 8 0 0 0 13.4 3.4" /></> : <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 22h8m-4-4v4" /></>}</svg>;
}
export function ScreenCanvas({ request, onClose, onStateChange }: Props) {
  const [state, setState] = useState<ScreenState>('idle');
  const [capture, setCapture] = useState<ScreenCaptureResult | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const epoch = useRef(0);
  const active = useRef<string | null>(null);
  const mounted = useRef(true);
  const stateCallback = useRef(onStateChange);
  stateCallback.current = onStateChange;
  const busy = state === 'capturing';
  const supported = Boolean(window.companion?.captureScreen);

  function updateState(next: ScreenState) { setState(next); stateCallback.current?.(next); }
  useEffect(() => {
    mounted.current = true;
    if (request.captureOnOpen) void takeScreenshot();
    return () => {
      mounted.current = false; epoch.current += 1;
      if (active.current) void window.companion?.cancelScreenCapture(active.current).catch(() => undefined);
      active.current = null;
    };
  }, [request.id]);

  async function takeScreenshot() {
    if (active.current) return;
    if (!window.companion?.captureScreen) { setError('请在桌面版截屏。'); updateState('error'); return; }
    const version = ++epoch.current;
    const requestId = `${request.id}-${version}`;
    active.current = requestId;
    setError(''); setFeedback(''); updateState('capturing');
    try {
      const result = await window.companion.captureScreen({ requestId });
      if (!mounted.current || version !== epoch.current || result.requestId !== requestId) return;
      setCapture(result); updateState('ready');
    } catch {
      if (!mounted.current || version !== epoch.current) return;
      setError('截屏未完成，请重试。'); updateState('error');
    } finally { if (active.current === requestId) active.current = null; }
  }
  function cancel() {
    const id = active.current; epoch.current += 1; active.current = null;
    if (id) void window.companion?.cancelScreenCapture(id).catch(() => undefined);
    setError(''); updateState(capture ? 'ready' : 'idle');
  }
  function save() {
    if (!capture) return;
    try {
      const anchor = document.createElement('a');
      anchor.href = capture.dataUrl; anchor.download = `screen-${capture.capturedAt.replace(/[:.]/g, '-')}.png`;
      document.body.append(anchor); anchor.click(); anchor.remove(); setFeedback('已发起保存');
    } catch { setFeedback('保存未完成'); }
  }
  return <section className="task-canvas screenshot-canvas" aria-label="截屏" aria-busy={busy}>
    <header className="work-header"><div className="work-drag"><h1 className="work-title">截屏</h1></div><div className="shot-actions"><button className="shot-icon" aria-label="重新截屏" title="重新截屏" disabled={busy || !supported} onClick={() => void takeScreenshot()}><CaptureIcon refresh /></button><button className="shot-icon shot-save" aria-label="保存截图" title="保存" disabled={busy || !capture} onClick={save}><Icon name="arrow" size={18} /></button><button className="work-close" aria-label="收起画布" title="收起" onClick={onClose}><Icon name="close" size={18} /></button></div></header>
    <div className="shot-body">
      {request.prompt ? <p className="shot-prompt">{request.prompt}</p> : null}
      {capture ? <figure className="shot-figure"><img src={capture.dataUrl} alt="当前屏幕截图" width={capture.width} height={capture.height} /><figcaption>{capture.displayLabel} · {capture.width} × {capture.height}</figcaption></figure> : <div className="shot-empty"><CaptureIcon /><button className="work-button is-primary" disabled={busy || !supported} onClick={() => void takeScreenshot()}>{busy ? '截屏中…' : '截屏'}</button></div>}
      {error ? <p className="shot-message" role="alert">{error}</p> : null}
    </div>
    <footer className="shot-footer"><span role="status">{busy ? '截屏中…' : feedback || (capture ? '已截屏' : '待接入模型')}</span>{busy ? <button onClick={cancel}>取消</button> : <button onClick={onClose}>收起</button>}</footer>
  </section>;
}
