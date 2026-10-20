import { useEffect, useRef, useState } from 'react';
import { CompanionCharacter } from './CompanionCharacter';
import { AgentConversation, type AgentOutcome, type AgentPhase, type AgentTurn } from './AgentConversation';
import type { CharacterState } from '../character/types';
import { ModelSettings } from './ModelSettings';
import { Icon } from './Icon';
import { usePetDrag } from './usePetDrag';

type Mode = 'idle' | 'input' | 'canvas';
export function DemoApp() {
  const [mode, setMode] = useState<Mode>(() => new URLSearchParams(location.search).get('mode') === 'input' ? 'input' : 'idle');
  const [draft, setDraft] = useState('');
  const [turn, setTurn] = useState<AgentTurn | null>(null);
  const [phase, setPhase] = useState<AgentPhase>('idle');
  const [reaction, setReaction] = useState<{ state: 'feedback' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [modelName, setModelName] = useState('');
  const [notice, setNotice] = useState('');
  const [preparing, setPreparing] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const pet = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const changing = useRef(false);
  const submitting = useRef(false);
  const sequence = useRef(0);
  const conversationId = useRef(`chat-${Date.now()}`);
  const modelTarget = useRef('');
  const busy = phase !== 'idle';
  const petDrag = usePetDrag(mode);
  const characterState: CharacterState = petDrag.dragging ? 'dragging' : phase !== 'idle' ? phase : reaction?.state ?? (mode === 'input' ? 'curious' : 'idle');

  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 2400);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  function onPhaseChange(next: AgentPhase) {
    setPhase(next);
    if (next !== 'idle') setReaction(null);
  }
  function onOutcome(outcome: AgentOutcome) {
    setReaction(outcome === 'cancelled' ? null : { state: outcome === 'completed' ? 'feedback' : 'error' });
  }

  useEffect(() => window.companion?.onMode(setMode), []);
  useEffect(() => { document.body.dataset.preview = window.companion ? 'false' : 'true'; void refreshConfig(); }, []);
  useEffect(() => {
    if (mode === 'input') input.current?.focus();
    else composing.current = false;
    if (mode === 'idle') pet.current?.focus({ preventScroll: true });
  }, [mode]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || composing.current || showSettings) return;
      event.preventDefault(); void changeMode('idle');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [showSettings]);

  async function refreshConfig() {
    try { const config = await window.companion?.getModelConfig?.(); if (config) trackConfig(config); }
    catch { setModelName(''); }
  }
  function trackConfig(config: { baseUrl: string; modelId: string; configured: boolean }) {
    const target = `${config.baseUrl}\n${config.modelId}`;
    if (modelTarget.current && modelTarget.current !== target) {
      conversationId.current = `chat-${Date.now()}-${++sequence.current}`;
      setTurn(null); setPhase('idle'); setReaction(null);
    }
    modelTarget.current = target;
    setModelName(config.configured ? config.modelId : '');
  }
  async function changeMode(next: Mode) {
    if (changing.current) return false;
    changing.current = true;
    try {
      if (window.companion) await window.companion.setMode(next);
      setMode(next); setNotice(''); return true;
    } catch { setNotice('窗口未打开，请重试。'); return false; }
    finally { changing.current = false; }
  }
  async function openSettings() {
    if (busy || preparing) return;
    if (await changeMode('canvas')) setShowSettings(true);
  }
  function closeSettings() {
    setShowSettings(false);
    if (!turn) void changeMode('input');
  }
  async function submit() {
    const prompt = draft.trim();
    if (!prompt || composing.current || changing.current || submitting.current || busy) return;
    if (showSettings) { await changeMode('canvas'); return; }
    if (!window.companion?.runAgent || !window.companion.getModelConfig) {
      setNotice('请在桌面应用中连接模型。');
      return;
    }
    submitting.current = true; setPreparing(true);
    try {
      const config = await window.companion.getModelConfig();
      trackConfig(config);
      if (!config.configured) {
        if (await changeMode('canvas')) setShowSettings(true);
        return;
      }
      const next: AgentTurn = { requestId: `turn-${Date.now()}-${++sequence.current}`, conversationId: conversationId.current, prompt };
      if (await changeMode('canvas')) { setTurn(next); setDraft(''); setNotice(''); }
    } catch { setNotice('暂时无法读取模型配置。'); }
    finally { submitting.current = false; setPreparing(false); }
  }

  return <main className={`pet-stage mode-${mode}`} aria-label="伴屏">
    {mode === 'input' ? <section className="pet-input" aria-label="输入">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="pet-input-row"><textarea ref={input} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="说点什么…" aria-label="输入内容" maxLength={4000} rows={2} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); void submit(); }
        }} /><button className="pet-send" type="submit" disabled={!draft.trim() || busy || preparing} aria-label="发送"><Icon name="arrow" size={18} /></button></div>
      </form>
      {notice ? <p className="pet-input-message" role="status">{notice}</p> : null}
      <div className="pet-input-footer"><button className="pet-more" onClick={() => void openSettings()} aria-label="模型设置" title="模型设置" disabled={busy || preparing}><Icon name="settings" size={16} /></button>{turn ? <button className="pet-resume" onClick={() => void changeMode('canvas')}>继续对话</button> : <button className="pet-resume" onClick={() => void openSettings()} disabled={preparing}>{modelName || '连接模型'}</button>}<span className="pet-shortcut" aria-hidden="true">Ctrl Alt Space</span><button className="pet-fold" onClick={() => void changeMode('idle')} aria-label="收起"><Icon name="minus" size={16} /></button></div>
    </section> : null}
    <div className="canvas-host" hidden={mode !== 'canvas'} inert={showSettings}><AgentConversation key={conversationId.current} turn={turn} draft={draft} onDraft={setDraft} onSend={() => void submit()} onClose={() => void changeMode('idle')} onSettings={() => void openSettings()} onPhaseChange={onPhaseChange} onOutcome={onOutcome} /></div>
    {showSettings ? <div className="model-settings-host" hidden={mode !== 'canvas'}><ModelSettings onClose={closeSettings} onSaved={() => { void refreshConfig(); closeSettings(); }} /></div> : null}
    <div className="pet-home"><button ref={pet} className={`pet-button${petDrag.dragging ? ' is-dragging' : ''}`} disabled={showSettings && mode === 'canvas'} onPointerDown={petDrag.onPointerDown} onPointerMove={petDrag.onPointerMove} onPointerUp={petDrag.onPointerUp} onPointerCancel={petDrag.onPointerCancel} onLostPointerCapture={petDrag.onLostPointerCapture} onDragStart={(event) => event.preventDefault()} onClick={(event) => { if (event.detail === 0 || petDrag.shouldClick()) void changeMode(mode === 'idle' ? 'input' : 'idle'); }} aria-label={mode === 'idle' ? '唤出' : '收起宠物'} title="单击展开，按住拖动"><CompanionCharacter state={characterState} /></button></div>
  </main>;
}
