import { useEffect, useRef, useState } from 'react';

export type PanelName = 'memory' | 'settings' | 'activity';

interface DemoMemory {
  id: string;
  category: string;
  content: string;
  updatedAt: string;
  example: boolean;
}

interface LoadedMemories {
  entries: DemoMemory[];
  initialize: boolean;
  notice: string;
}

const MEMORY_KEY = 'banscreen-demo-memories-v1';
const MOTION_KEY = 'banscreen-demo-reduced-motion-v1';
const DEFAULT_CATEGORY = '偏好';
const CATEGORIES = ['偏好', '项目', '日常'];
let desktopAlwaysOnTop = false;
const SEED_DATE = '2026-10-20T00:00:00.000Z';
const EXAMPLES: DemoMemory[] = [
  { id: 'example-quiet', category: '偏好', content: '专注的时候，喜欢安静一点的陪伴。', updatedAt: SEED_DATE, example: true },
  { id: 'example-project', category: '项目', content: '正在探索一个住在桌面角落的小伙伴。', updatedAt: SEED_DATE, example: true },
  { id: 'example-style', category: '日常', content: '比起长篇大论，更喜欢清楚、简短的回答。', updatedAt: SEED_DATE, example: true },
];

function loadMemories(): LoadedMemories {
  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    if (!stored) return { entries: EXAMPLES.map((entry) => ({ ...entry })), initialize: true, notice: '' };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length > 1000 || !parsed.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      return typeof item.id === 'string' && typeof item.category === 'string' &&
        typeof item.content === 'string' && typeof item.updatedAt === 'string' &&
        typeof item.example === 'boolean';
    })) throw new Error('Invalid memory data');
    return { entries: parsed as DemoMemory[], initialize: false, notice: '' };
  } catch {
    return { entries: [], initialize: false, notice: '无法读取本地演示记忆。原数据未被覆盖；可以导出当前列表，或在浏览器设置中检查存储权限。' };
  }
}

function readReducedMotion(): boolean {
  try {
    const stored = localStorage.getItem(MOTION_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // The system preference still works when browser storage is unavailable.
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function AddIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function memoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '本地记忆' : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function DemoPanels({ panel, onClose }: { panel: PanelName; onClose: () => void }) {
  const [loaded] = useState(loadMemories);
  const [memories, setMemories] = useState(loaded.entries);
  const [notice, setNotice] = useState(loaded.notice);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);
  const [alwaysOnTop, setAlwaysOnTop] = useState(desktopAlwaysOnTop);
  const [topPending, setTopPending] = useState(false);
  const [settingNotice, setSettingNotice] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<() => void>(() => undefined);

  const editing = memories.find((entry) => entry.id === editingId);
  const editorOpen = creating || editingId !== null;
  const dirty = editorOpen && (content !== (editing?.content ?? '') || category !== (editing?.category ?? DEFAULT_CATEGORY));

  function discardDraft(): boolean {
    return !dirty || window.confirm('这条记忆还没有保存。放弃修改并继续吗？');
  }

  function requestClose() {
    if (discardDraft()) onClose();
  }
  closeRef.current = requestClose;

  useEffect(() => {
    if (!loaded.initialize) return;
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(loaded.entries));
    } catch {
      setNotice('浏览器未允许保存演示记忆。当前示例仅临时显示，关闭后不会保留修改。');
    }
  }, [loaded]);

  useEffect(() => {
    document.body.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || !dialogRef.current?.getClientRects().length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey, true);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [panel]);

  useEffect(() => {
    if (editorOpen) editorRef.current?.focus();
  }, [creating, editingId, editorOpen]);

  function persist(next: DemoMemory[], message: string): boolean {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
      setMemories(next);
      setNotice(message);
      return true;
    } catch {
      setNotice('保存失败，浏览器存储可能已满或不可用。你的输入还在，可以复制后再试。');
      return false;
    }
  }

  function resetEditor() {
    setCreating(false);
    setEditingId(null);
    setContent('');
    setCategory(DEFAULT_CATEGORY);
  }

  function startNew() {
    if (!discardDraft()) return;
    setCreating(true);
    setEditingId(null);
    setContent('');
    setCategory(DEFAULT_CATEGORY);
    setNotice('');
  }

  function editMemory(entry: DemoMemory) {
    if (!discardDraft()) return;
    setCreating(false);
    setEditingId(entry.id);
    setContent(entry.content);
    setCategory(entry.category);
    setNotice('');
  }

  function saveMemory() {
    const trimmed = content.trim();
    if (!trimmed) {
      setNotice('先写下一点想保留的内容。');
      editorRef.current?.focus();
      return;
    }
    const entry: DemoMemory = {
      id: editingId ?? (window.crypto?.randomUUID?.() ?? `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      category,
      content: trimmed,
      updatedAt: new Date().toISOString(),
      example: false,
    };
    const next = editingId ? memories.map((item) => item.id === editingId ? entry : item) : [entry, ...memories];
    if (persist(next, '已保存在此浏览器。演示记忆不会发送给 AI。')) resetEditor();
  }

  function deleteMemory(entry: DemoMemory) {
    if (entry.id === editingId && !discardDraft()) return;
    if (!window.confirm('删除这条演示记忆？删除后无法恢复。')) return;
    if (persist(memories.filter((item) => item.id !== entry.id), '这条演示记忆已从此浏览器删除。') && entry.id === editingId) resetEditor();
  }

  function exportMemories() {
    try {
      const blob = new Blob([JSON.stringify({ kind: 'banscreen-demo-memories', version: 1, exportedAt: new Date().toISOString(), memories }, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'banscreen-demo-memories.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(window.companion ? '已发起 JSON 导出，请在保存窗口选择位置。未保存的草稿不包含在导出中。' : '已发起 JSON 下载，请在下载列表中查看。未保存的草稿不包含在导出中。');
    } catch {
      setNotice('无法发起导出。请检查浏览器下载权限后重试。');
    }
  }

  function toggleMotion() {
    const next = !reducedMotion;
    try {
      localStorage.setItem(MOTION_KEY, String(next));
      setReducedMotion(next);
      setSettingNotice('动画偏好已保存在此浏览器。');
    } catch {
      setSettingNotice('无法保存动画偏好，请检查浏览器存储权限。');
    }
  }

  async function toggleOnTop() {
    if (!window.companion || topPending) return;
    setTopPending(true);
    try {
      const next = await window.companion.setAlwaysOnTop(!alwaysOnTop);
      desktopAlwaysOnTop = next;
      setAlwaysOnTop(next);
      setSettingNotice(next ? '桌面窗口已置顶。' : '已取消桌面窗口置顶。');
    } catch {
      setSettingNotice('未能更改置顶，请重试。');
    } finally {
      setTopPending(false);
    }
  }

  async function quit() {
    try {
      await window.companion?.quit();
    } catch {
      setSettingNotice('暂时无法退出，请通过桌面菜单重试。');
    }
  }

  const titles: Record<PanelName, string> = { memory: '记住的小事', settings: '按你的节奏', activity: '此刻，安静待命' };
  const filtered = memories.filter((entry) => `${entry.category} ${entry.content}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));

  return (
    <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className={`panel panel-${panel}`} role="dialog" aria-modal="true" aria-labelledby="demo-panel-title" tabIndex={-1} ref={dialogRef}>
        <header className="panel-header">
          <div>
            <h2 className="panel-title" id="demo-panel-title">{titles[panel]}</h2>
          </div>
          <button className="icon-button" onClick={requestClose} aria-label="关闭浮层" title="关闭 · Esc"><CloseIcon /></button>
        </header>

        {panel === 'memory' && <>
          <p className="panel-note">演示记忆 · 仅保存在此浏览器。示例内容可自由修改，尚未连接模型记忆。</p>
          <div className="memory-actions">
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">查找记忆</span>
              <input className="field-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜一个词，想起一件小事…" type="search" maxLength={200} />
            </label>
            <button className="button button-secondary" onClick={startNew}><AddIcon />新增记忆</button>
          </div>

          {editorOpen && <form className="memory-editor" onSubmit={(event) => { event.preventDefault(); saveMemory(); }}>
            <label className="field">
              <span className="field-label">{creating ? '想让我记住什么？' : '修改这条记忆'}</span>
              <textarea ref={editorRef} className="field-input" rows={3} value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} placeholder="比如：回答问题时，先告诉我结论。" />
            </label>
            <div className="memory-actions">
              <label className="field">
                <span className="field-label">类别</span>
                <select className="field-input" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
              </label>
              <span className="memory-meta">{content.length}/800</span>
              <button type="button" className="button button-secondary" onClick={() => { if (discardDraft()) resetEditor(); }}>取消</button>
              <button type="submit" className="button button-primary">保存记忆</button>
            </div>
          </form>}

          {notice && <p className="inline-notice" role="status">{notice}</p>}
          <div className="memory-list">
            {filtered.length > 0 ? filtered.map((entry) => <article className="memory-item" key={entry.id}>
              <div className="memory-meta"><span>{entry.category}</span><span>{entry.example ? '示例 · 非真实用户信息' : `手动添加 · ${memoryDate(entry.updatedAt)}`}</span></div>
              <p>{entry.content}</p>
              <div className="memory-actions">
                <button className="button button-secondary" onClick={() => editMemory(entry)} aria-label={`编辑记忆：${entry.content.slice(0, 20)}`}>编辑</button>
                <button className="button button-secondary" onClick={() => deleteMemory(entry)} aria-label={`删除记忆：${entry.content.slice(0, 20)}`}>删除</button>
              </div>
            </article>) : <div className="empty-panel"><p>{search ? '还没找到这件小事。' : '留一点空间，记住接下来的小事。'}</p><span className="panel-note">{search ? '试试更短的关键词，或新增一条记忆。' : '点击“新增记忆”，由你决定保留什么。'}</span></div>}
          </div>
          <footer className="panel-footer"><span className="panel-note">{memories.length} 条本地演示记忆</span><button className="button button-secondary" onClick={exportMemories}>导出 JSON</button></footer>
        </>}

        {panel === 'settings' && <>
          <p className="panel-note">陪伴可以轻一点。你决定它出现的方式。</p>
          <div className="settings-row">
            <div><strong>窗口保持置顶</strong><p className="panel-note">{window.companion ? '在其他窗口上方，留一个小小的位置。' : '桌面客户端可用；当前是浏览器预览。'}</p></div>
            <button className={`button ${alwaysOnTop && window.companion ? 'button-primary' : 'button-secondary'}`} role="switch" aria-checked={Boolean(alwaysOnTop && window.companion)} aria-label="窗口保持置顶" disabled={!window.companion || topPending} onClick={() => void toggleOnTop()}>{topPending ? '更改中…' : window.companion ? alwaysOnTop ? '已开启' : '已关闭' : '仅桌面'}</button>
          </div>
          <div className="settings-row">
            <div><strong>减弱动画</strong><p className="panel-note">让呼吸、浮动和过渡更安静。</p></div>
            <button className={`button ${reducedMotion ? 'button-primary' : 'button-secondary'}`} role="switch" aria-checked={reducedMotion} aria-label="减弱动画" onClick={toggleMotion}>{reducedMotion ? '已开启' : '已关闭'}</button>
          </div>
          <div className="settings-row">
            <div><strong>当前版本：交互 Demo</strong><p className="panel-note">演示对话与任务步骤均为示例。尚未连接 AI 模型、屏幕识别、语音或跨屏服务。</p></div>
          </div>
          <div className="settings-row">
            <div><strong>你的内容留在哪里</strong><p className="panel-note">手动保存的演示记忆与动画偏好保存在本地浏览器。不会上传到模型服务；清除浏览器数据后也会被清除。</p></div>
          </div>
          {settingNotice && <p className="inline-notice" role="status">{settingNotice}</p>}
          <footer className="panel-footer"><span className="panel-note">{window.companion ? '收起画布可回到桌面角色。' : '浏览器预览 · 桌面操作不可用'}</span><button className="button button-secondary" disabled={!window.companion} onClick={() => void quit()}>退出应用</button></footer>
        </>}

        {panel === 'activity' && <>
          <div className="empty-panel">
            <span className="activity-orbit" aria-hidden="true"><span /></span>
            <p>不用时时忙碌，也能好好陪着。</p>
            <span className="panel-note">这是交互演示，当前没有真实 Agent 任务在后台运行。</span>
          </div>
          <div className="settings-row"><div><strong>画布里的过程是示例</strong><p className="panel-note">示例对话、步骤和结果用于体验界面，不代表模型正在思考或工具已经执行。</p></div></div>
          <div className="settings-row"><div><strong>小事，由你亲手留下</strong><p className="panel-note">新增、编辑、删除和导出演示记忆会真实操作此浏览器的本地数据。</p></div></div>
          <footer className="panel-footer"><span className="panel-note">演示说明 · 非运行日志</span><button className="button button-secondary" onClick={requestClose}>知道了</button></footer>
        </>}
      </section>
    </div>
  );
}
