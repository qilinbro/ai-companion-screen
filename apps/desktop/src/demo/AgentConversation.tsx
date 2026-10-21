import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, ScreenCaptureResult } from './desktop';
import { Icon } from './Icon';
import { MessageContent } from './MessageContent';

export type AgentPhase = 'idle' | 'thinking' | 'viewing' | 'responding';
export type AgentOutcome = 'completed' | 'cancelled' | 'error';
export type AgentTurn = { requestId: string; prompt: string; conversationId: string };
type Message = { id: string; role: 'user' | 'assistant'; text: string; phase?: AgentPhase; ended?: boolean; error?: string; cancelled?: boolean; capture?: ScreenCaptureResult };
type Props = { turn: AgentTurn | null; draft: string; onDraft: (value: string) => void; onSend: () => void; onClose: () => void; onSettings: () => void; onPhaseChange: (phase: AgentPhase) => void; onOutcome: (outcome: AgentOutcome) => void; fullscreen?: boolean; onFullscreen?: () => void; canFullscreen?: boolean; visible?: boolean; notice?: string };

export function AssistantLoader({ label = '正在思考' }: { label?: string }) {
  return <span className="assistant-loader" role="status" aria-label={label}><span /><span /><span /></span>;
}
export function AgentConversation({ turn, draft, onDraft, onSend, onClose, onSettings, onPhaseChange, onOutcome, fullscreen = false, onFullscreen, canFullscreen = false, visible = true, notice }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [copyNotice, setCopyNotice] = useState('');
  const [showLatest, setShowLatest] = useState(false);
  const active = useRef<string | null>(null);
  const started = useRef(new Set<string>());
  const mounted = useRef(true);
  const callback = useRef(onPhaseChange);
  const outcomeCallback = useRef(onOutcome);
  const body = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const phaseRef = useRef<AgentPhase>('idle');
  const follow = useRef(true);
  const composing = useRef(false);
  const busy = phase !== 'idle';
  callback.current = onPhaseChange;
  outcomeCallback.current = onOutcome;

  function updatePhase(next: AgentPhase) {
    if (phaseRef.current === next) return;
    phaseRef.current = next; setPhase(next); callback.current(next);
  }
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.companion?.onAgentEvent?.((event: AgentEvent) => {
      if (!mounted.current || event.requestId !== active.current) return;
      if (event.type === 'status') {
        updatePhase(event.status);
        setMessages((current) => current.map((message) => message.id === event.requestId ? { ...message, phase: event.status } : message));
      } else if (event.type === 'delta') {
        updatePhase('responding');
        setMessages((current) => current.map((message) => message.id === event.requestId ? { ...message, text: message.text + event.delta, phase: 'responding' } : message));
      } else if (event.type === 'capture') {
        setMessages((current) => current.map((message) => message.id === event.requestId ? { ...message, capture: event.capture } : message));
      } else {
        active.current = null; updatePhase('idle');
        outcomeCallback.current(event.type === 'error' ? 'error' : event.finishReason === 'cancelled' ? 'cancelled' : 'completed');
        setMessages((current) => current.map((message) => message.id === event.requestId ? { ...message, ended: true, phase: 'idle', ...(event.type === 'error' ? { error: event.message } : { cancelled: event.finishReason === 'cancelled' }) } : message));
      }
    });
    return () => {
      mounted.current = false; unsubscribe?.();
      if (active.current) void window.companion?.cancelAgent(active.current).catch(() => undefined);
      active.current = null;
    };
  }, []);
  useEffect(() => {
    if (!turn || started.current.has(turn.requestId)) return;
    started.current.add(turn.requestId);
    const requestId = turn.requestId;
    active.current = requestId; follow.current = true; setShowLatest(false); setCopyNotice('');
    setMessages((current) => [...current, { id: `${requestId}-user`, role: 'user', text: turn.prompt }, { id: requestId, role: 'assistant', text: '', phase: 'thinking' }]);
    updatePhase('thinking');
    const promise = window.companion?.runAgent?.(turn);
    if (!promise) {
      active.current = null; updatePhase('idle');
      outcomeCallback.current('error');
      setMessages((current) => current.map((message) => message.id === requestId ? { ...message, ended: true, phase: 'idle', error: '请在桌面应用中连接模型。' } : message));
      return;
    }
    void promise.catch((error: unknown) => {
      if (!mounted.current || active.current !== requestId) return;
      active.current = null; updatePhase('idle');
      outcomeCallback.current('error');
      setMessages((current) => current.map((message) => message.id === requestId ? { ...message, ended: true, phase: 'idle', error: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').slice(0, 200) : '暂时无法连接，请重试。' } : message));
    });
  }, [turn]);
  useEffect(() => {
    if (!follow.current || !visible) return;
    const frame = requestAnimationFrame(() => { if (body.current && follow.current) body.current.scrollTop = body.current.scrollHeight; });
    return () => cancelAnimationFrame(frame);
  }, [messages, fullscreen, visible]);
  useEffect(() => {
    const textarea = composer.current;
    if (!textarea || !visible) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [draft, fullscreen, visible]);
  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  async function stop() {
    const requestId = active.current;
    if (!requestId) return;
    active.current = null; updatePhase('idle');
    outcomeCallback.current('cancelled');
    setMessages((current) => current.map((message) => message.id === requestId ? { ...message, ended: true, phase: 'idle', cancelled: true } : message));
    try { await window.companion?.cancelAgent(requestId); }
    catch { if (mounted.current) setCopyNotice('未收到停止回执，请重试。'); }
  }
  const copy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); if (mounted.current) setCopyNotice('已复制'); }
    catch { if (mounted.current) setCopyNotice('复制未完成'); }
  }, []);
  function scrollLatest() {
    follow.current = true; setShowLatest(false);
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }
  return <section className="task-canvas agent-canvas" aria-label="对话" aria-busy={busy}>
    <header className="agent-header"><div className="agent-drag"><span className="agent-dot" /><span>伴屏</span>{fullscreen ? <span className="agent-fullscreen-hint">Esc 退出全屏</span> : null}</div><button className="agent-icon" aria-label="设置" title="设置" onClick={onSettings}><Icon name="settings" size={17} /></button>{canFullscreen ? <button className={`agent-icon${fullscreen ? ' is-fullscreen-control' : ''}`} aria-label={fullscreen ? '退出全屏' : '全屏展开'} title={fullscreen ? '退出全屏 · Esc' : '全屏展开'} onClick={onFullscreen}><Icon name={fullscreen ? 'restore' : 'expand'} size={17} /></button> : null}<button className="agent-icon" aria-label="收起对话" title="收起" onClick={onClose}><Icon name="close" size={17} /></button></header>
    {notice ? <p className="agent-window-notice" role="status">{notice}</p> : null}
    <div ref={body} className="agent-messages" tabIndex={0} aria-label="对话内容" onScroll={() => {
      if (!body.current) return;
      follow.current = body.current.scrollHeight - body.current.scrollTop - body.current.clientHeight < 24;
      setShowLatest(!follow.current);
    }}>
      {!messages.length ? <div className="agent-empty"><span className="agent-dot" /><p>想一起做点什么？</p></div> : null}
      {messages.map((message) => <article className={`agent-message from-${message.role}`} key={message.id}>
        {message.role === 'user' ? <p className="agent-user-text">{message.text}</p> : <>
          <div className="agent-answer"><MessageContent text={message.text} onCopy={copy} />{message.phase === 'responding' && !message.ended ? <span className="agent-stream-cursor" aria-hidden="true" /> : null}</div>
          {!message.ended && message.phase !== 'responding' ? <AssistantLoader label={message.phase === 'viewing' ? '正在查看当前画面' : '正在思考'} /> : null}
          {message.error ? <div className="agent-error" role="alert"><p>{message.error}</p><button onClick={onSettings}>检查连接</button></div> : null}
          {message.cancelled ? <p className="agent-ended">已停止</p> : null}
          {message.capture ? <details className="agent-context"><summary><img src={message.capture.dataUrl} alt="" /><span>本次主屏画面</span><Icon name="chevron" size={13} /></summary><img className="agent-context-image" src={message.capture.dataUrl} alt="本次获准查看的主屏画面" /><p>{message.capture.displayLabel} · {message.capture.width} × {message.capture.height}</p></details> : null}
          {message.ended && message.text ? <button className="agent-copy" aria-label="复制回复" title="复制" onClick={() => void copy(message.text)}><Icon name="copy" size={14} /></button> : null}
        </>}
      </article>)}<div className="agent-end" />
    </div>
    {showLatest ? <button className="agent-latest" type="button" onClick={scrollLatest}>回到最新<Icon name="arrow" size={13} /></button> : null}
    <form className="agent-compose" onSubmit={(event) => { event.preventDefault(); if (!composing.current && !busy) onSend(); }}><textarea ref={composer} value={draft} onChange={(event) => onDraft(event.target.value)} rows={1} maxLength={4000} aria-label="继续对话" placeholder="说点什么…" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); if (!busy) onSend(); } }} />{busy ? <button className="agent-send is-stop" type="button" aria-label="停止回复" title="停止" onClick={() => void stop()}><span /></button> : <button className="agent-send" type="submit" disabled={!draft.trim()} aria-label="发送" title="发送"><Icon name="arrow" size={17} /></button>}</form>
    {copyNotice ? <p className="agent-copy-notice" role="status">{copyNotice}</p> : null}
  </section>;
}
