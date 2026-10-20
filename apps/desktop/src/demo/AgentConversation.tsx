import { Fragment, useEffect, useRef, useState } from 'react';
import type { AgentEvent, ScreenCaptureResult } from './desktop';
import { Icon } from './Icon';

export type AgentPhase = 'idle' | 'thinking' | 'viewing' | 'responding';
export type AgentOutcome = 'completed' | 'cancelled' | 'error';
export type AgentTurn = { requestId: string; prompt: string; conversationId: string };
type Message = { id: string; role: 'user' | 'assistant'; text: string; phase?: AgentPhase; ended?: boolean; error?: string; cancelled?: boolean; capture?: ScreenCaptureResult };
type Props = { turn: AgentTurn | null; draft: string; onDraft: (value: string) => void; onSend: () => void; onClose: () => void; onSettings: () => void; onPhaseChange: (phase: AgentPhase) => void; onOutcome: (outcome: AgentOutcome) => void };

export function AssistantLoader({ label = '正在思考' }: { label?: string }) {
  return <span className="assistant-loader" role="status" aria-label={label}><span /><span /><span /></span>;
}
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>);
}
function prose(text: string, key: string) {
  return text.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) return <ul key={`${key}-${index}`}>{lines.map((line, row) => <li key={row}>{inline(line.replace(/^\s*[-*]\s+/, ''))}</li>)}</ul>;
    const heading = /^(#{1,4})\s+(.+)$/.exec(block);
    if (heading) return <h2 key={`${key}-${index}`}>{inline(heading[2] ?? '')}</h2>;
    return <p key={`${key}-${index}`}>{inline(block)}</p>;
  });
}
function MessageContent({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const fences = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let offset = 0;
  for (const match of text.matchAll(fences)) {
    const index = match.index ?? 0;
    blocks.push(...prose(text.slice(offset, index), `p-${index}`));
    blocks.push(<pre key={`c-${index}`}><code>{match[2]}</code></pre>);
    offset = index + match[0].length;
  }
  blocks.push(...prose(text.slice(offset), `p-${offset}`));
  return <>{blocks}</>;
}

export function AgentConversation({ turn, draft, onDraft, onSend, onClose, onSettings, onPhaseChange, onOutcome }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [copyNotice, setCopyNotice] = useState('');
  const active = useRef<string | null>(null);
  const started = useRef(new Set<string>());
  const mounted = useRef(true);
  const callback = useRef(onPhaseChange);
  const outcomeCallback = useRef(onOutcome);
  const body = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const composing = useRef(false);
  const busy = phase !== 'idle';
  callback.current = onPhaseChange;
  outcomeCallback.current = onOutcome;

  function updatePhase(next: AgentPhase) { setPhase(next); callback.current(next); }
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
    active.current = requestId; follow.current = true; setCopyNotice('');
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
    if (!follow.current) return;
    const frame = requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  async function stop() {
    const requestId = active.current;
    if (!requestId) return;
    active.current = null; updatePhase('idle');
    outcomeCallback.current('cancelled');
    setMessages((current) => current.map((message) => message.id === requestId ? { ...message, ended: true, phase: 'idle', cancelled: true } : message));
    try { await window.companion?.cancelAgent(requestId); }
    catch { if (mounted.current) setCopyNotice('未收到停止回执，请重试。'); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); if (mounted.current) setCopyNotice('已复制'); }
    catch { if (mounted.current) setCopyNotice('复制未完成'); }
  }
  return <section className="task-canvas agent-canvas" aria-label="对话" aria-busy={busy}>
    <header className="agent-header"><div className="agent-drag"><span className="agent-dot" /><span>伴屏</span></div><button className="agent-icon" aria-label="模型设置" title="模型设置" disabled={busy} onClick={onSettings}><Icon name="settings" size={17} /></button><button className="agent-icon" aria-label="收起对话" title="收起" onClick={onClose}><Icon name="close" size={17} /></button></header>
    <div ref={body} className="agent-messages" onScroll={() => { if (body.current) follow.current = body.current.scrollHeight - body.current.scrollTop - body.current.clientHeight < 80; }}>
      {!messages.length ? <div className="agent-empty"><span className="agent-dot" /><p>想一起做点什么？</p></div> : null}
      {messages.map((message) => <article className={`agent-message from-${message.role}`} key={message.id}>
        {message.role === 'user' ? <p className="agent-user-text">{message.text}</p> : <>
          <div className={`agent-answer ${message.phase === 'responding' && !message.ended ? 'is-streaming' : ''}`}><MessageContent text={message.text} /></div>
          {!message.ended && message.phase !== 'responding' ? <AssistantLoader label={message.phase === 'viewing' ? '正在查看当前画面' : '正在思考'} /> : null}
          {message.error ? <div className="agent-error" role="alert"><p>{message.error}</p><button onClick={onSettings}>检查连接</button></div> : null}
          {message.cancelled ? <p className="agent-ended">已停止</p> : null}
          {message.capture ? <details className="agent-context"><summary><img src={message.capture.dataUrl} alt="" /><span>当前画面</span><Icon name="chevron" size={13} /></summary><img className="agent-context-image" src={message.capture.dataUrl} alt="本次查看的画面" /></details> : null}
          {message.ended && message.text ? <button className="agent-copy" aria-label="复制回复" title="复制" onClick={() => void copy(message.text)}><Icon name="copy" size={14} /></button> : null}
        </>}
      </article>)}<div ref={end} className="agent-end" />
    </div>
    <form className="agent-compose" onSubmit={(event) => { event.preventDefault(); if (!composing.current && !busy) onSend(); }}><textarea value={draft} onChange={(event) => onDraft(event.target.value)} rows={1} maxLength={4000} aria-label="继续对话" placeholder="说点什么…" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); if (!busy) onSend(); } }} />{busy ? <button className="agent-send is-stop" type="button" aria-label="停止回复" title="停止" onClick={() => void stop()}><span /></button> : <button className="agent-send" type="submit" disabled={!draft.trim()} aria-label="发送" title="发送"><Icon name="arrow" size={17} /></button>}</form>
    {copyNotice ? <p className="agent-copy-notice" role="status">{copyNotice}</p> : null}
  </section>;
}
