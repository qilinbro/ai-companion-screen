import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { PublicModelConfig, SaveModelConfigInput } from './desktop';

type ModelFields = Pick<PublicModelConfig, 'baseUrl' | 'modelId' | 'persistKey' | 'allowScreen'>;
type ModelBridge = {
  getModelConfig: () => Promise<PublicModelConfig>;
  saveModelConfig: (config: SaveModelConfigInput) => Promise<PublicModelConfig>;
};
type Props = { onClose: () => void; onSaved: () => void };
const EMPTY_FIELDS: ModelFields = { baseUrl: '', modelId: '', persistKey: false, allowScreen: false };

function modelBridge(): Partial<ModelBridge> | undefined {
  return window.companion as (typeof window.companion & Partial<ModelBridge>) | undefined;
}
function publicFields(config: PublicModelConfig): ModelFields {
  return { baseUrl: config.baseUrl, modelId: config.modelId, persistKey: config.canPersistSecret && config.persistKey, allowScreen: config.allowScreen };
}

export function ModelSettings({ onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ModelFields>(EMPTY_FIELDS);
  const [baseline, setBaseline] = useState<ModelFields>(EMPTY_FIELDS);
  const [config, setConfig] = useState<PublicModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [keyChanged, setKeyChanged] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const operation = useRef(0);
  const saving = useRef(false);
  const savedSinceOpen = useRef(false);
  const titleId = useId();
  const keyNoteId = useId();
  const screenNoteId = useId();
  const confirmTitleId = useId();
  const available = Boolean(modelBridge()?.getModelConfig && modelBridge()?.saveModelConfig);
  const serviceChanged = config !== null && draft.baseUrl !== baseline.baseUrl;
  const dirty = config !== null && (keyChanged || draft.baseUrl !== baseline.baseUrl || draft.modelId !== baseline.modelId || draft.persistKey !== baseline.persistKey || draft.allowScreen !== baseline.allowScreen);

  const loadConfig = useCallback(async () => {
    const bridge = modelBridge();
    if (!bridge?.getModelConfig || !bridge.saveModelConfig) { setLoading(false); return; }
    const revision = ++operation.current;
    setLoading(true);
    setLoadError('');
    try {
      const current = await bridge.getModelConfig();
      if (!mounted.current || operation.current !== revision) return;
      const fields = publicFields(current);
      setConfig(current);
      setDraft(fields);
      setBaseline(fields);
      setKeyChanged(false);
      if (keyRef.current) keyRef.current.value = '';
    } catch {
      if (mounted.current && operation.current === revision) setLoadError('暂时无法读取配置，请重试。');
    } finally {
      if (mounted.current && operation.current === revision) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    const password = keyRef.current;
    void loadConfig();
    return () => {
      mounted.current = false;
      operation.current += 1;
      if (password) password.value = '';
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [loadConfig]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!panelRef.current?.getClientRects().length) return;
      if (confirmClose) continueRef.current?.focus();
      else if (!loading && config) baseUrlRef.current?.focus();
      else headingRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, confirmClose, config]);

  const finishClose = useCallback(() => { if (savedSinceOpen.current) onSaved(); else onClose(); }, [onClose, onSaved]);
  const requestClose = useCallback(() => {
    if (saving.current) return;
    if (dirty) setConfirmClose(true);
    else finishClose();
  }, [dirty, finishClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!panelRef.current?.getClientRects().length || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (confirmClose) setConfirmClose(false);
        else requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      const focusOutsideControls = !controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || focusOutsideControls)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || focusOutsideControls)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmClose, requestClose]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const bridge = modelBridge();
    if (!config || loading || saving.current || !bridge?.saveModelConfig) return;
    saving.current = true;
    setBusy(true);
    setSaveError('');
    const revision = ++operation.current;
    try {
      // Read the uncontrolled password only for this call. An empty field keeps
      // the existing secret; it is never populated from the saved configuration.
      const apiKey = keyRef.current?.value;
      const current = await bridge.saveModelConfig({
        baseUrl: draft.baseUrl,
        modelId: draft.modelId,
        persistKey: config.canPersistSecret && draft.persistKey,
        allowScreen: draft.allowScreen,
        ...(apiKey ? { apiKey } : {}),
      });
      if (!mounted.current || operation.current !== revision) return;
      if (keyRef.current) keyRef.current.value = '';
      const fields = publicFields(current);
      setConfig(current); setDraft(fields); setBaseline(fields); setKeyChanged(false);
      savedSinceOpen.current = true;
      // Security-storage or permission receipts remain visible until dismissed.
      if (!current.message?.trim()) onSaved();
    } catch {
      // Preserve every field, including the uncontrolled password, for retry.
      if (mounted.current && operation.current === revision) setSaveError('暂时没能保存，请检查填写内容后重试。');
    } finally {
      saving.current = false;
      if (mounted.current && operation.current === revision) setBusy(false);
    }
  }

  return <section ref={panelRef} className="model-settings" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={loading || busy}>
    <div inert={confirmClose}>
      <header><h2 ref={headingRef} id={titleId} tabIndex={-1}>模型</h2><button className="model-settings-close" type="button" onClick={requestClose} disabled={busy} aria-label="关闭模型设置"><Icon name="close" size={17} /></button></header>
      {!available ? <p className="model-setting-note" role="status">请在桌面应用中配置</p> : null}
      {available && loading ? <p className="model-setting-note" role="status">正在读取配置…</p> : null}
      {loadError ? <div><p className="model-setting-note" role="alert">{loadError}</p><div className="model-setting-actions"><button type="button" onClick={() => void loadConfig()} disabled={loading}>重试</button></div></div> : null}
      <form onSubmit={(event) => void save(event)}>
        <label className="model-setting-field"><span>服务地址</span><input ref={baseUrlRef} type="url" value={draft.baseUrl} autoComplete="off" spellCheck={false} placeholder="服务的 API 地址" disabled={!config || loading || busy} required onChange={(event) => { setDraft((current) => ({ ...current, baseUrl: event.target.value, allowScreen: false })); setSaveError(''); }} /></label>
        <label className="model-setting-field"><span>模型</span><input type="text" value={draft.modelId} autoComplete="off" spellCheck={false} placeholder="模型名称" disabled={!config || loading || busy} required onChange={(event) => { setDraft((current) => ({ ...current, modelId: event.target.value, allowScreen: false })); setSaveError(''); }} /></label>
        <label className="model-setting-field"><span>密钥</span><input ref={keyRef} type="password" defaultValue="" autoComplete="new-password" spellCheck={false} aria-describedby={keyNoteId} placeholder={serviceChanged ? '服务变更，请重新填写密钥（如需要）' : config?.hasApiKey ? '已设置，留空保持原密钥' : '输入密钥（如服务需要）'} disabled={!config || loading || busy} onInput={() => { setKeyChanged(Boolean(keyRef.current?.value)); setSaveError(''); }} /></label>
        <p className="model-setting-note" id={keyNoteId}>{serviceChanged ? '旧服务密钥不会沿用；新服务如需密钥，请重新填写。' : config?.hasApiKey ? '已有密钥不会回显；留空保持不变。' : '密钥只交给上方服务。'}</p>
        <label className="model-setting-field is-toggle"><input type="checkbox" checked={draft.persistKey} disabled={!config?.canPersistSecret || loading || busy} onChange={(event) => setDraft((current) => ({ ...current, persistKey: event.target.checked }))} /><span>保存在本机</span></label>
        {config && !config.canPersistSecret ? <p className="model-setting-note">此设备无法安全保存密钥，仅本次运行有效。</p> : null}
        <label className="model-setting-field is-toggle"><input type="checkbox" checked={draft.allowScreen} aria-describedby={screenNoteId} disabled={!config || loading || busy} onChange={(event) => setDraft((current) => ({ ...current, allowScreen: event.target.checked }))} /><span>允许模型查看当前屏幕</span></label>
        <p className="model-setting-note" id={screenNoteId}>仅本次运行。需要时将画面发送到上方服务。</p>
        {config?.message ? <p className="model-setting-note" role="status">{config.message}</p> : null}
        {saveError ? <p className="model-setting-note" role="alert">{saveError}</p> : null}
        <div className="model-setting-actions"><button type="submit" disabled={!config || loading || busy}>{busy ? '保存中…' : '保存'}</button><button type="button" disabled={busy} onClick={requestClose}>{savedSinceOpen.current ? '完成' : '取消'}</button></div>
      </form>
    </div>
    {confirmClose ? <div role="alertdialog" aria-modal="true" aria-labelledby={confirmTitleId}>
      <h3 id={confirmTitleId}>还有未保存的修改</h3>
      <div className="model-setting-actions"><button ref={continueRef} type="button" onClick={() => setConfirmClose(false)}>继续编辑</button><button type="button" onClick={() => { if (keyRef.current) keyRef.current.value = ''; finishClose(); }}>放弃修改</button></div>
    </div> : null}
  </section>;
}
