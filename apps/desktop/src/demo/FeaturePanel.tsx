import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import { CONNECTIONS, RULES, useWorkspace, workspaceActions, type Memory, type RulePreference, type StoreResult, type Workspace } from './local-store';

export type FeaturePage = 'overview' | 'memory' | 'activity' | 'scheduled' | 'connections' | 'rules' | 'profile';
type FeaturePanelProps = { initialPage?: FeaturePage; onClose: () => void; onRunDemo: (prompt: string) => void };
type PanelContentProps = { workspace: Workspace; onDirty: (dirty: boolean) => void; protect: (action: () => void) => void };
const PAGE_TITLES: Record<FeaturePage, string> = { overview: '关于我的小世界', memory: '记忆', activity: '活动', scheduled: '提醒', connections: '连接', rules: '行动偏好', profile: '我的伙伴' };
const PAGES: { page: Exclude<FeaturePage, 'overview'>; description: string }[] = [
  { page: 'memory', description: '记住你愿意留下的事' },
  { page: 'scheduled', description: '到时间，轻轻提醒你' },
  { page: 'activity', description: '刚刚一起做过的事' },
  { page: 'connections', description: '看看跨应用协作的样子' },
  { page: 'rules', description: '什么可以做，什么交给你' },
  { page: 'profile', description: '名字和安静陪伴的方式' },
];
const DEMOS = [
  ['读懂屏幕', '帮我翻译一下当前页面'],
  ['一起解决报错', '我遇到了报错，帮我看看'],
  ['资料研究与并行工作', '并行调研三个周末出行方案'],
  ['持续跟进一个目标', '持续跟进这次项目发布'],
  ['云电脑与本机接管', '演示云电脑和本机接管'],
  ['跨渠道继续聊', '演示 Slack 和 Teams 跨渠道对话'],
  ['在 Space 里一起写文档', '在 Space 中用 @dot 起草文档'],
  ['语音通话', '打开语音通话演示'],
  ['读取本地文件', '读取一份本地文件'],
  ['理清接下来的一步', '帮我理清接下来的一步'],
] as const;
const RULE_OPTIONS: { value: RulePreference; label: string }[] = [{ value: 'allow', label: '允许' }, { value: 'explicit', label: '明确要求时' }, { value: 'ask', label: '每次询问' }, { value: 'handoff', label: '交给我做' }];
const STATUS_LABELS = { running: '演示进行中', paused: '演示已暂停', completed: '演示已完成', cancelled: '演示已结束' };

function formatDate(value: string): string { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '时间未知'; }
function localDateTime(offset = 60 * 60 * 1000): string { const date = new Date(Date.now() + offset); const pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function useDraftProtection(dirty: boolean, onDirty: (dirty: boolean) => void) {
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
}
function ResultMessage({ result }: { result: StoreResult | null }) { return result ? <p className={`feature-note ${result.ok ? 'feature-success' : 'feature-error'}`} role={result.ok ? 'status' : 'alert'}>{result.ok ? '已保存到本机。' : result.error}</p> : null; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="feature-empty">{children}</p>; }

function MemoryPanel({ workspace, onDirty, protect }: PanelContentProps) {
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ id?: string; title: string; content: string; baselineTitle: string; baselineContent: string } | null>(null);
  const [result, setResult] = useState<StoreResult | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const titleId = useId();
  const contentId = useId();
  const dirty = editor !== null && (editor.title !== editor.baselineTitle || editor.content !== editor.baselineContent);
  useDraftProtection(dirty, onDirty);
  const query = search.trim().toLocaleLowerCase();
  const memories = workspace.memories.filter((item) => `${item.title}\n${item.content}`.toLocaleLowerCase().includes(query));
  function edit(memory?: Memory) { protect(() => { setEditor({ id: memory?.id, title: memory?.title ?? '', content: memory?.content ?? '', baselineTitle: memory?.title ?? '', baselineContent: memory?.content ?? '' }); setResult(null); setDeleteId(null); }); }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const saved = workspaceActions.saveMemory(editor);
    setResult(saved);
    if (saved.ok) setEditor(null);
    else if (saved.id) setEditor((current) => current ? { ...current, id: saved.id } : null);
  }
  function exportMemories() {
    try {
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), memories: workspace.memories }, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `Dot-memories-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResult(null);
    } catch { setResult({ ok: false, error: '暂时无法导出，请重试。记忆内容仍保留在本机。' }); }
  }
  return <>
    <p className="feature-note">只保留你亲自写下的内容。当前记忆是本地笔记，还没有接入模型检索。</p>
    <div className="feature-actions"><button className="feature-button is-primary" onClick={() => edit()}>添加记忆</button><button className="feature-button" onClick={exportMemories} disabled={!workspace.memories.length}>导出 JSON</button></div>
    {editor ? <form className="feature-form" onSubmit={save}>
      <label htmlFor={titleId}>标题</label><input className="feature-field" id={titleId} value={editor.title} maxLength={100} autoFocus onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="例如：我喜欢的工作方式" required />
      <label htmlFor={contentId}>想记住的内容</label><textarea className="feature-field" id={contentId} value={editor.content} maxLength={10000} rows={5} onChange={(event) => setEditor({ ...editor, content: event.target.value })} placeholder="只写下你愿意留下的事…" required />
      <div className="feature-actions"><button className="feature-button is-primary" type="submit">保存记忆</button><button className="feature-button" type="button" onClick={() => protect(() => { setEditor(null); setResult(null); })}>取消编辑</button></div>
    </form> : null}
    <ResultMessage result={result} />
    <label className="feature-search"><span className="feature-sr-only">搜索记忆</span><input className="feature-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索记忆…" type="search" /></label>
    {!memories.length ? <EmptyState>{workspace.memories.length ? '没有找到相关记忆。' : '这里还是空的。留下一件你愿意让我记住的事吧。'}</EmptyState> : <ul className="feature-list">{memories.map((memory) => <li className="feature-memory" key={memory.id}>
      <div className="feature-row"><strong>{memory.title}</strong><span className="feature-note">{formatDate(memory.updatedAt)}</span></div><p className="feature-memory-content">{memory.content}</p>
      <div className="feature-actions"><button className="feature-button" onClick={() => edit(memory)}>编辑</button>{deleteId === memory.id ? <><span className="feature-note">确定忘记这条？</span><button className="feature-button is-danger" onClick={() => protect(() => { setResult(workspaceActions.deleteMemory(memory.id)); setDeleteId(null); if (editor?.id === memory.id) setEditor(null); })}>确认删除</button><button className="feature-button" onClick={() => setDeleteId(null)}>保留</button></> : <button className="feature-button" onClick={() => setDeleteId(memory.id)}>忘记</button>}</div>
    </li>)}</ul>}
  </>;
}

function ScheduledPanel({ workspace, onDirty }: PanelContentProps) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'once' | 'daily'>('once');
  const [baselineAt, setBaselineAt] = useState(() => localDateTime());
  const [at, setAt] = useState(baselineAt);
  const [time, setTime] = useState('09:00');
  const [pendingId, setPendingId] = useState<string>();
  const [result, setResult] = useState<StoreResult | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  useDraftProtection(Boolean(title || mode !== 'once' || at !== baselineAt || time !== '09:00'), onDirty);
  function create(event: React.FormEvent) {
    event.preventDefault();
    const saved = workspaceActions.createReminder({ id: pendingId, title, mode, at, time });
    setResult(saved);
    if (saved.ok) { const next = localDateTime(); setTitle(''); setMode('once'); setBaselineAt(next); setAt(next); setTime('09:00'); setPendingId(undefined); }
    else if (saved.id) setPendingId(saved.id);
  }
  return <>
    <p className="feature-note">真实本地提醒。仅应用运行时触发；关闭应用期间无法通知，重新打开后会检查已到期提醒。每日时间跟随电脑的本地时区。</p>
    <form className="feature-form" onSubmit={create}>
      <label htmlFor={titleId}>提醒什么</label><input id={titleId} className="feature-field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="例如：站起来活动一下" required />
      <div className="feature-row feature-schedule-fields"><label>频率<select className="feature-field" value={mode} onChange={(event) => setMode(event.target.value as 'once' | 'daily')}><option value="once">只提醒一次</option><option value="daily">每天</option></select></label>{mode === 'once' ? <label htmlFor={dateId}>什么时候<input id={dateId} className="feature-field" type="datetime-local" value={at} onInput={(event) => setAt(event.currentTarget.value)} onChange={(event) => setAt(event.target.value)} required /></label> : <label htmlFor={timeId}>每天几点<input id={timeId} className="feature-field" type="time" value={time} onInput={(event) => setTime(event.currentTarget.value)} onChange={(event) => setTime(event.target.value)} required /></label>}</div>
      <div className="feature-actions"><button type="submit" className="feature-button is-primary">保存提醒</button></div>
    </form>
    <ResultMessage result={result} />
    {!workspace.reminders.length ? <EmptyState>还没有提醒。写下一件之后要做的小事。</EmptyState> : <ul className="feature-list">{workspace.reminders.map((reminder) => <li key={reminder.id}>
      <div className="feature-row"><strong>{reminder.title}</strong><span className="feature-note">{reminder.enabled ? '已启用' : reminder.lastTriggeredAt && reminder.mode === 'once' ? '已到期' : '已暂停'}</span></div>
      <p className="feature-note">{reminder.mode === 'daily' ? `每天 ${reminder.time}` : formatDate(reminder.at)}{reminder.lastTriggeredAt ? ` · 上次提醒 ${formatDate(reminder.lastTriggeredAt)}` : ''}</p>
      <div className="feature-actions"><button className="feature-button" onClick={() => setResult(workspaceActions.setReminderEnabled(reminder.id, !reminder.enabled))} disabled={!reminder.enabled && reminder.mode === 'once' && Date.parse(reminder.at) <= Date.now()}>{reminder.enabled ? '暂停' : '启用'}</button>{deleteId === reminder.id ? <><button className="feature-button is-danger" onClick={() => { setResult(workspaceActions.deleteReminder(reminder.id)); setDeleteId(null); }}>确认删除</button><button className="feature-button" onClick={() => setDeleteId(null)}>取消</button></> : <button className="feature-button" onClick={() => setDeleteId(reminder.id)}>删除</button>}</div>
    </li>)}</ul>}
  </>;
}

function ActivityPanel({ workspace }: PanelContentProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<StoreResult | null>(null);
  const query = search.trim().toLocaleLowerCase();
  const activities = workspace.activities.filter((activity) => `${activity.title}\n${activity.summary ?? ''}`.toLocaleLowerCase().includes(query));
  return <>
    <p className="feature-note">这里记录本地截图任务、交互演示和到期提醒。截图与识别全文不会写入活动；没有调用模型或执行命令，最多保留 200 条。</p>
    <input className="feature-field" aria-label="搜索活动和请求摘要" placeholder="找一件之前做过的事…" type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={200} />
    {workspace.activities.length ? <><div className="feature-actions">{confirmClear ? <><span className="feature-note">删除全部活动记录？</span><button className="feature-button is-danger" onClick={() => { setResult(workspaceActions.clearActivities()); setConfirmClear(false); }}>确认清空</button><button className="feature-button" onClick={() => setConfirmClear(false)}>取消</button></> : <button className="feature-button" onClick={() => setConfirmClear(true)}>清空记录</button>}</div>{activities.length === 0 ? <EmptyState>没有找到相关记录，可以换个关键词。</EmptyState> : null}<ul className="feature-list">{activities.map((activity) => <li key={activity.id}>
      <div className="feature-row"><strong>{activity.title}</strong><span className="feature-note">{activity.kind === 'reminder' ? '本地提醒已到期' : activity.kind === 'screen-local' ? ({ running: '正在本机处理', paused: '等待输入', completed: '本地处理已完成', cancelled: '本次处理已结束' })[activity.status] : STATUS_LABELS[activity.status]}</span></div><p className="feature-note">{formatDate(activity.updatedAt)} · {activity.kind === 'reminder' ? '本地提醒' : activity.kind === 'screen-local' ? '本地截图与识别' : '流程演示'}</p>{activity.summary ? <p className="feature-activity-summary">{activity.summary}</p> : null}
    </li>)}</ul></> : <EmptyState>还没有活动。每一次演示或本地提醒，都会在这里留下回执。</EmptyState>}
    <ResultMessage result={result} />
  </>;
}

function ConnectionsPanel({ workspace }: PanelContentProps) {
  const [result, setResult] = useState<StoreResult | null>(null);
  return <><p className="feature-note">演示连接：只在本机保存开关，用来体验未来的协作流程。不会登录账户、读取资料或建立真实连接。</p><ul className="feature-list">{CONNECTIONS.map((name) => <li className="feature-row" key={name}><div><strong>{name}</strong><p className="feature-note">{workspace.connections[name] ? '演示连接已开启' : '尚未开启演示连接'}</p></div><button className={`feature-button ${workspace.connections[name] ? 'is-active' : ''}`} aria-pressed={workspace.connections[name] ?? false} onClick={() => setResult(workspaceActions.setConnection(name, !workspace.connections[name]))}>{workspace.connections[name] ? '关闭演示' : '开启演示'}</button></li>)}</ul><ResultMessage result={result} /></>;
}

function RulesPanel({ workspace, onDirty }: PanelContentProps) {
  const [draft, setDraft] = useState({ ...workspace.rules });
  const [baseline, setBaseline] = useState({ ...workspace.rules });
  const [result, setResult] = useState<StoreResult | null>(null);
  useDraftProtection(RULES.some((rule) => draft[rule.id] !== baseline[rule.id]), onDirty);
  return <><p className="feature-note">这些是本地保存的演示偏好，不会授予系统权限，也不会启动任何真实操作。</p><form onSubmit={(event) => { event.preventDefault(); const saved = workspaceActions.saveRules(draft); setResult(saved); if (saved.ok) setBaseline({ ...draft }); }}><ul className="feature-list">{RULES.map((rule) => <li className="feature-row" key={rule.id}><label htmlFor={`rule-${rule.id}`}><strong>{rule.title}</strong><p className="feature-note">{rule.description}</p></label><select className="feature-field" id={`rule-${rule.id}`} value={draft[rule.id] ?? 'ask'} onChange={(event) => setDraft({ ...draft, [rule.id]: event.target.value as RulePreference })}>{RULE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></li>)}</ul><div className="feature-actions"><button className="feature-button is-primary" type="submit">保存偏好</button></div></form><ResultMessage result={result} /></>;
}

function ProfilePanel({ workspace, onDirty }: PanelContentProps) {
  const [draft, setDraft] = useState({ ...workspace.profile });
  const [baseline, setBaseline] = useState({ ...workspace.profile });
  const [result, setResult] = useState<StoreResult | null>(null);
  const nameId = useId();
  useDraftProtection(draft.name !== baseline.name || draft.reducedMotion !== baseline.reducedMotion, onDirty);
  return <><p className="feature-note">熟悉的角色，换一个你喜欢的称呼。设置仅保存在这台电脑上。</p><form className="feature-form" onSubmit={(event) => { event.preventDefault(); const saved = workspaceActions.updateProfile(draft); setResult(saved); if (saved.ok) { const profile = { ...draft, name: draft.name.trim() || 'Dot' }; setDraft(profile); setBaseline(profile); } }}><label htmlFor={nameId}>伙伴昵称</label><input id={nameId} className="feature-field" value={draft.name} maxLength={24} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Dot" /><label className="feature-checkbox"><input type="checkbox" checked={draft.reducedMotion} onChange={(event) => setDraft({ ...draft, reducedMotion: event.target.checked })} /><span>减弱动画<p className="feature-note">让界面安静一些，减少循环动作与展开效果。</p></span></label><div className="feature-actions"><button className="feature-button is-primary" type="submit">保存设置</button></div></form><ResultMessage result={result} /></>;
}

export function FeaturePanel({ initialPage = 'overview', onClose, onRunDemo }: FeaturePanelProps) {
  const workspace = useWorkspace();
  const [page, setPage] = useState<FeaturePage>(initialPage);
  const previousInitialPage = useRef(initialPage);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const guardButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const headingId = useId();
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  const protect = useCallback((action: () => void) => { if (dirty) setPending(() => action); else action(); }, [dirty]);
  const back = useCallback(() => protect(page === 'overview' ? onClose : () => setPage('overview')), [page, onClose, protect]);

  useEffect(() => {
    if (previousInitialPage.current === initialPage) return;
    previousInitialPage.current = initialPage;
    protect(() => setPage(initialPage));
  }, [initialPage, protect]);
  useEffect(() => { previousFocus.current = document.activeElement; return () => { const previous = previousFocus.current; if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }; }, []);
  useEffect(() => {
    const focusPanel = () => { if (!panelRef.current?.getClientRects().length) return; if (pending) guardButtonRef.current?.focus(); else headingRef.current?.focus({ preventScroll: true }); };
    const frame = requestAnimationFrame(focusPanel);
    const host = panelRef.current?.parentElement;
    const observer = new MutationObserver(focusPanel);
    if (host) observer.observe(host, { attributes: true, attributeFilter: ['hidden'] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [page, pending]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!panelRef.current?.getClientRects().length) return;
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (pending) setPending(null); else back(); return; }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
      const first = nodes[0]; const last = nodes.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [back, pending]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const contentProps = { workspace, onDirty, protect };
  return <section ref={panelRef} className="task-canvas feature-panel" role="dialog" aria-modal="true" aria-labelledby={headingId}>
    <div className="feature-panel-content" inert={pending !== null}>
      <header className="work-header feature-header"><button className="feature-button feature-back" onClick={back} aria-label={page === 'overview' ? '返回宠物' : '返回资料目录'}><Icon name="back" size={17} /></button><div className="work-drag"><h1 ref={headingRef} tabIndex={-1} id={headingId} className="work-title">{PAGE_TITLES[page]}</h1></div><button className="work-close" onClick={() => protect(onClose)} aria-label="收起资料，返回宠物"><Icon name="close" size={18} /></button></header>
      <div className="feature-body">
        {!workspace.persistence.saved ? <div className="feature-persistence" role="alert"><p className="feature-note">{workspace.persistence.message}</p><button className="feature-button" onClick={() => workspaceActions.retrySave()}>重试保存</button></div> : null}
        {page === 'overview' ? <><p className="feature-intro">我是 {workspace.profile.name}。平时安静陪着你，需要时，我们再一起把事情做好。</p><nav className="feature-nav" aria-label="资料目录">{PAGES.map(({ page: target, description }) => <button key={target} className="feature-nav-row" onClick={() => protect(() => setPage(target))}><span><strong>{PAGE_TITLES[target]}</strong><span className="feature-note">{description}</span></span><Icon name="chevron" size={16} /></button>)}</nav><div className="feature-demo-links"><h2>功能与场景</h2><p className="feature-note">读屏与报错入口会真实截取主屏幕并识别文字；其余外部协作仍为预设演示。不会执行终端命令。</p>{DEMOS.map(([label, prompt]) => <button className="feature-text-link" key={label} onClick={() => protect(() => onRunDemo(prompt))}>{label}<span aria-hidden="true"> ↗</span></button>)}</div></> : null}
        {page === 'memory' ? <MemoryPanel {...contentProps} /> : null}
        {page === 'scheduled' ? <ScheduledPanel {...contentProps} /> : null}
        {page === 'activity' ? <ActivityPanel {...contentProps} /> : null}
        {page === 'connections' ? <ConnectionsPanel {...contentProps} /> : null}
        {page === 'rules' ? <RulesPanel {...contentProps} /> : null}
        {page === 'profile' ? <ProfilePanel {...contentProps} /> : null}
      </div>
      <footer className="feature-footer"><span>只属于这台电脑的小世界</span><button className="feature-button" onClick={back}>{page === 'overview' ? '返回宠物' : '返回目录'}</button></footer>
    </div>
    {pending ? <div className="feature-unsaved" role="alertdialog" aria-modal="true" aria-labelledby="feature-unsaved-title"><h2 id="feature-unsaved-title">还有没保存的修改</h2><p className="feature-note">留下继续编辑，或放弃这次草稿。</p><div className="feature-actions"><button ref={guardButtonRef} className="feature-button is-primary" onClick={() => setPending(null)}>继续编辑</button><button className="feature-button" onClick={() => { const action = pending; setPending(null); setDirty(false); action(); }}>放弃修改</button></div></div> : null}
  </section>;
}
