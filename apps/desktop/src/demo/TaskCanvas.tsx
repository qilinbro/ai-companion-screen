import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Icon } from './Icon';
import type { TaskIntent, TaskKind } from './intent';
export { getTaskKind } from './intent';

export type DemoTask = {
  id: number;
  kind: TaskKind;
  prompt: string;
  intent?: TaskIntent;
};
export type PlaybackState = 'running' | 'paused' | 'completed' | 'cancelled';
type TaskCanvasProps = {
  task: DemoTask;
  onClose: () => void;
  onPlaybackState?: (state: PlaybackState, summary?: string) => void;
  onRunDemo?: (prompt: string) => void;
  memories?: { content: string; category?: string }[];
};

export const TASK_TITLES: Record<DemoTask['kind'], string> = {
  translate: '一起读懂这段英文', repair: '把这个报错理清楚', general: '从这一件事开始',
  research: '把线索放在一起', followup: '一件事，持续跟进', computer: '看看它怎样用电脑',
  channels: '换个地方，继续聊', space: '一起写这份文档', voice: '说说接下来想做什么', files: '读一份你选的文件',
  screen: '看看眼前这一屏',
};

const NOTES: Record<DemoTask['kind'], string> = {
  translate: '翻译流程演示 · 使用示例原文，没有读取屏幕',
  repair: '排错流程演示 · 没有读取屏幕或执行命令',
  general: '协作流程演示 · 下方背景来自你确认的本地记录',
  research: '并行工作演示 · 研究内容与任务均为示例',
  followup: '持续目标演示 · 选择会改变本地草稿，不创建定时任务',
  computer: '电脑操作演示 · 画面为示例，没有截图或电脑控制',
  channels: '跨渠道演示 · 消息只留在当前画布，不向外部发送',
  space: '页面协作演示 · 文档可本地编辑，不连接 ChatGPT Space',
  voice: '通话界面演示 · 不录音、不识别语音、不拨打电话',
  files: '本地文件读取 · 仅读取你选择的一个文件，内容不外发',
  screen: '主屏幕截图与文字提取 · 本地处理',
};
const PROMPTS: [DemoTask['kind'], string][] = [
  ['translate', '帮我翻译一下当前页面'], ['repair', '我遇到了报错，帮我看看'],
  ['research', '并行调研三个周末出行方案'], ['followup', '持续跟进这次项目发布'],
  ['computer', '演示云电脑和本机接管'], ['channels', '演示 Slack 和 Teams 跨渠道对话'],
  ['space', '在 Space 中用 @dot 起草文档'], ['voice', '打开语音通话演示'],
  ['files', '读取一份本地文件'], ['general', '帮我理清接下来的一步'],
];
type ChildTask = { title: string; state: 'running' | 'completed' | 'cancelled' };
type LocalFile = { name: string; text: string; characters: number; lines: number };
type Channel = 'ChatGPT' | 'Slack' | 'Teams';
type Message = { channel: Channel; author: string; text: string };
const INITIAL_DOCUMENT = '# 发布准备\n\n## 目标\n让第一次使用的用户，顺利完成一个小任务。\n\n## 待补充\n- 发布前检查\n- 需要确认的决定\n';
const DRAFT_DOCUMENT = '# 发布准备\n\n## 目标\n让第一次使用的用户，顺利完成一个小任务。\n\n## 发布前检查\n- 核对首次启动与输入流程\n- 检查暂停、继续和结果导出\n- 邀请两位同事试用并整理反馈\n\n## 等待确认\n是否先发布给小范围用户？\n\n> 本地预设草稿，尚未核对真实项目资料。\n';

function PlaybackIcon({ paused }: { paused: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">{paused
    ? <path d="m7 4 8 6-8 6V4Z" fill="currentColor" />
    : <><rect x="5" y="4" width="3" height="12" rx="1" fill="currentColor" /><rect x="12" y="4" width="3" height="12" rx="1" fill="currentColor" /></>}</svg>;
}
function DemoText({ text, state, stateRef }: { text: string; state: PlaybackState; stateRef: MutableRefObject<PlaybackState> }) {
  const [length, setLength] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? text.length : 0);
  useEffect(() => {
    if (state !== 'running' || length >= text.length) return;
    const timer = window.setTimeout(() => {
      if (stateRef.current === 'running') setLength((current) => Math.min(text.length, current + 2));
    }, 28);
    return () => window.clearTimeout(timer);
  }, [text, length, state, stateRef]);
  return <>{state === 'completed' ? text : text.slice(0, length)}</>;
}

function TaskPlayback({ task, onClose, onPlaybackState, onRunDemo, memories = [] }: TaskCanvasProps) {
  const [state, setState] = useState<PlaybackState>('running');
  const stateRef = useRef<PlaybackState>('running');
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const callbackRef = useRef(onPlaybackState);
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState('');
  const decisionRef = useRef('');
  const parallel = task.kind === 'research' || task.kind === 'followup';
  const duration = parallel ? 9000 : 5600;
  const visible = elapsed >= 3000 ? 3 : elapsed >= 1650 ? 2 : elapsed >= 450 ? 1 : 0;
  const cancelled = state === 'cancelled';
  const childTitles = task.kind === 'followup' ? ['核对发布清单', '整理等待中的决定', '准备下一次回报'] : ['比较出行时间', '整理预算范围', '查看活动安排'];
  const [children, setChildren] = useState<ChildTask[]>(() => childTitles.map((title) => ({ title, state: 'running' })));
  const childRef = useRef(children);
  const childTimer = useRef<number | null>(null);
  const [computer, setComputer] = useState<'cloud' | 'local'>('cloud');
  const [takeover, setTakeover] = useState(false);
  const [computerNote, setComputerNote] = useState('准备一份发布前检查清单');
  const [channel, setChannel] = useState<Channel>('ChatGPT');
  const [messages, setMessages] = useState<Message[]>([
    { channel: 'ChatGPT', author: '你 · 示例', text: '帮我准备周五的发布回顾。' },
    { channel: 'ChatGPT', author: 'Dot · 示例', text: '我会先整理检查清单和需要你决定的事。' },
    { channel: 'Slack', author: '你 · 示例', text: '预算控制在 1,000 元以内。' },
    { channel: 'Teams', author: 'Dot · 示例', text: '这里也可以接着聊。各渠道显示各自的消息。' },
  ]);
  const [messageDraft, setMessageDraft] = useState('');
  const [documentText, setDocumentText] = useState(INITIAL_DOCUMENT);
  const [drafted, setDrafted] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [voiceNotes, setVoiceNotes] = useState<string[]>([]);
  const [file, setFile] = useState<LocalFile | null>(null);
  const [fileError, setFileError] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const fileVersion = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { callbackRef.current = onPlaybackState; }, [onPlaybackState]);
  useEffect(() => { callbackRef.current?.(state); }, [state]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; fileVersion.current += 1; }; }, []);
  useEffect(() => {
    if (state !== 'running') return;
    let previous = performance.now();
    timerRef.current = window.setInterval(() => {
      if (stateRef.current !== 'running') return;
      const now = performance.now();
      elapsedRef.current = Math.min(duration, elapsedRef.current + now - previous);
      previous = now;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= duration && (!parallel || childRef.current.every((child) => child.state !== 'running')) && (task.kind !== 'followup' || decisionRef.current)) {
        stateRef.current = 'completed';
        setState('completed');
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 50);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); timerRef.current = null; };
  }, [state, duration, task.kind, parallel]);
  useEffect(() => {
    if (!parallel) return;
    const started = performance.now();
    childTimer.current = window.setInterval(() => {
      if (stateRef.current === 'cancelled' || stateRef.current === 'completed') return;
      const age = performance.now() - started;
      let changed = false;
      const next = childRef.current.map((child, index) => {
        if (child.state !== 'running' || age < ([4500, 6500, 8000][index] ?? 8000)) return child;
        changed = true;
        return { ...child, state: 'completed' as const };
      });
      if (changed) { childRef.current = next; setChildren(next); }
      if (next.every((child) => child.state !== 'running') && childTimer.current !== null) { window.clearInterval(childTimer.current); childTimer.current = null; }
    }, 150);
    return () => { if (childTimer.current !== null) window.clearInterval(childTimer.current); childTimer.current = null; };
  }, [parallel]);

  function togglePlayback() {
    if (stateRef.current !== 'running' && stateRef.current !== 'paused') return;
    const next = stateRef.current === 'running' ? 'paused' : 'running';
    stateRef.current = next;
    setState(next);
  }
  function stopPlayback() {
    if (stateRef.current === 'cancelled' || stateRef.current === 'completed') return;
    stateRef.current = 'cancelled';
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (childTimer.current !== null) window.clearInterval(childTimer.current);
    timerRef.current = null;
    childTimer.current = null;
    fileVersion.current += 1;
    setReadingFile(false);
    const next = childRef.current.map((child) => child.state === 'running' ? { ...child, state: 'cancelled' as const } : child);
    childRef.current = next;
    setChildren(next);
    setCallActive(false);
    setState('cancelled');
  }
  function stopChild(index: number) {
    if (stateRef.current === 'cancelled' || childRef.current[index]?.state !== 'running') return;
    const next = childRef.current.map((child, current) => current === index ? { ...child, state: 'cancelled' as const } : child);
    childRef.current = next;
    setChildren(next);
  }
  function chooseDecision(value: string) {
    if (stateRef.current === 'cancelled') return;
    decisionRef.current = value;
    setDecision(value);
  }
  function fileIsCurrent(version: number) {
    return mounted.current && version === fileVersion.current && stateRef.current !== 'cancelled';
  }
  async function readFile(selected: File | undefined) {
    if (!selected || stateRef.current === 'cancelled') return;
    const version = ++fileVersion.current;
    setFile(null); setFileError(''); setReadingFile(false);
    if (!/\.(txt|md|json|csv|log)$/i.test(selected.name)) { setFileError('请选择 txt、md、json、csv 或 log 文件。'); return; }
    if (selected.size > 1024 * 1024) { setFileError('文件大于 1 MB，请选择更小的文本文件。'); return; }
    setReadingFile(true);
    try {
      const content = await selected.text();
      if (!fileIsCurrent(version)) return;
      setFile({ name: selected.name, text: content, characters: Array.from(content).length, lines: content.length ? content.split(/\r\n|\n|\r/).length : 0 });
    } catch {
      if (fileIsCurrent(version)) setFileError('暂时无法读取这份文件，请重新选择。');
    } finally {
      if (fileIsCurrent(version)) setReadingFile(false);
    }
  }

  const decisionDraft = decision === '先小范围试用' ? '邀请两位同事，收集第一轮反馈后再决定发布日期。' : '先核对启动、输入、暂停和导出，再决定开放试用。';
  function resultMarkdown() {
    const statusLabel = state === 'completed' ? '示例播放完毕' : cancelled ? '已停止' : state === 'paused' ? '已暂停' : '播放中';
    const heading = `# ${TASK_TITLES[task.kind]}\n\n> ${NOTES[task.kind]}\n\n请求：${task.prompt}\n\n状态：${statusLabel}\n\n`;
    let body = '';
    if (task.kind === 'translate') body = `${visible >= 1 ? '## 示例原文\nMake room for what matters.\n\nA quieter workspace helps you focus on one thing at a time. Start small, take a breath, and let the next step become clear.\n\n' : ''}${visible >= 2 ? '## 示例译文\n给重要的事，留一点空间。\n\n安静一些的工作环境，能帮你一次专注做好一件事。从一个小步骤开始，深呼吸，让下一步慢慢清晰起来。\n\n' : ''}${visible >= 3 ? '“make room” 也有为重要的事情留出时间和注意力的意思。' : ''}`;
    if (task.kind === 'repair') body = `${visible >= 1 ? "## 示例报错\nTS2307: Cannot find module 'vite' or its corresponding type declarations.\n\n" : ''}${visible >= 2 ? '## 排查建议示例\n确认当前目录包含 package.json，再检查是否声明与安装了 vite。\n\n' : ''}${visible >= 3 ? '## 命令示例（未执行）\n```text\nnpm install\nnpm run build\n```\n\n没有实际读取屏幕、检查依赖或修复项目。' : ''}`;
    if (task.kind === 'general' && visible >= 2) body = `## 本地已确认背景\n${memories.length ? memories.map((memory) => `- ${memory.content}`).join('\n') : '暂无已确认背景。'}\n\n${visible >= 3 ? '## 思路示例\n明确结果，准备材料，先完成一个容易开始的小步骤。未经过模型分析。' : ''}`;
    if (parallel && visible >= 2) body = `## 并行任务示例\n${children.map((child) => `- ${child.title}：${child.state === 'completed' ? '示例完成' : child.state === 'cancelled' ? '已停止' : '示例运行中'}`).join('\n')}\n\n${visible < 3 ? '' : task.kind === 'followup' ? `## 当前本地草稿\n${decision ? `已选择：${decision}\n下一步：${decisionDraft}` : '尚未选择发布策略。'}\n\n未创建真实计划或发送邀请。` : '## 比较草稿示例\n- 近郊散步：路程短，预算较低。\n- 博物馆：室内活动，需要另查预约。\n- 城市漫游：时间灵活，需要另查天气。\n\n未搜索实时地点、价格或天气。'}`;
    if (task.kind === 'computer' && visible >= 2) body = `## 示例电脑\n${computer === 'cloud' ? '云电脑' : '本机'} · ${takeover ? '用户接管示例' : 'Dot 控制示例'}\n\n便签：${computerNote}\n\n未连接电脑、读取屏幕或执行操作。`;
    if (task.kind === 'channels' && visible >= 2) body = `## 本地示例消息\n${messages.map((message) => `- [${message.channel}] ${message.author}：${message.text}`).join('\n')}\n\n消息没有发送到 ChatGPT、Slack 或 Teams。`;
    if (task.kind === 'space' && visible >= 2) body = documentText;
    if (task.kind === 'voice' && visible >= 2) body = `## 通话界面示例\n${callActive ? '示例界面已开启' : '示例界面已结束/尚未开启'} · ${muted ? '静音' : '未静音'}\n\n## 你补充的文字\n${voiceNotes.length ? voiceNotes.map((note) => `- ${note}`).join('\n') : '暂无文字补充。'}\n\n没有录音、语音识别或通话服务。`;
    if (task.kind === 'files') body = file ? `## 实际读取的文件\n文件名：${file.name}\n字符数：${file.characters}\n行数：${file.lines}\n\n## 文件内容\n${file.text}` : '尚未读取文件。';
    return heading + (body || '主流程尚未展开结果。') + '\n';
  }
  async function copyResult() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(resultMarkdown());
      if (mounted.current) setFeedback('已复制当前内容。');
    } catch { if (mounted.current) setFeedback('复制失败，可以下载 Markdown 文件。'); }
  }
  function downloadResult() {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([resultMarkdown()], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `伴屏-${task.kind}-${task.id}.md`;
      document.body.append(link); link.click(); link.remove();
      setFeedback('已发起 Markdown 下载。');
    } catch { setFeedback('未能发起下载，请尝试复制。'); }
    finally { if (url) { const downloadedUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000); } }
  }

  const text = (content: string) => <DemoText text={content} state={state} stateRef={stateRef} />;
  const parallelTasks = <div className="work-task-list" aria-label="三个并行示例任务">
    {children.map((child, index) => <div className="work-task-row" key={child.title}>
      <span>{child.title}</span><span className="work-chip">{child.state === 'completed' ? '示例完成' : child.state === 'cancelled' ? '已停止' : '示例运行中'}</span>
      <button className="work-button" onClick={() => stopChild(index)} disabled={child.state !== 'running' || cancelled} aria-label={`停止${child.title}示例`}>停止</button>
    </div>)}<p className="work-note">暂停主流程时，子任务示例继续；“停止全部”会停止两者。</p>
  </div>;
  const status = cancelled ? '已停止 · 保留当前内容，不再推进'
    : state === 'paused' ? parallel ? '主流程已暂停 · 并行子任务仍可继续' : '主流程已暂停'
    : state === 'completed' ? '示例播放完毕 · 本地交互仍可使用'
    : task.kind === 'followup' && elapsed >= duration && !decision ? '等待你的决定 · 请在下方选择'
    : `演示中 · ${visible < 1 ? '准备画布' : visible < 2 ? '展开请求' : visible < 3 ? '整理内容' : '保留结果'}`;

  return <section className="task-canvas" aria-label={TASK_TITLES[task.kind]}>
    <header className="work-header">
      <div className="work-drag"><h1 className="work-title">{TASK_TITLES[task.kind]}</h1><span className="work-label">{task.kind === 'files' ? '本地可用' : '交互演示'}</span></div>
      <button className="work-close" onClick={onClose} aria-label="收起画布，任务演示可在应用运行时继续" title="收起画布"><Icon name="close" size={18} /></button>
    </header>
    <div className="work-body">
      <p className="work-note">{NOTES[task.kind]}</p>
      <p className="work-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
      {task.kind === 'translate' ? <>
        {visible >= 1 ? <section className="work-section work-source"><span className="work-label">示例原文</span><h2>Make room for what matters.</h2><p>{text('A quieter workspace helps you focus on one thing at a time. Start small, take a breath, and let the next step become clear.')}</p></section> : null}
        {visible >= 2 ? <section className="work-section work-translation"><span className="work-label">中文译文示例</span><h2>给重要的事，留一点空间。</h2><p>{text('安静一些的工作环境，能帮你一次专注做好一件事。从一个小步骤开始，深呼吸，让下一步慢慢清晰起来。')}</p></section> : null}
        {visible >= 3 ? <section className="work-section"><span className="work-label">阅读提示示例</span><p>{text('这里的 “make room” 也有为重要的事情留出时间和注意力的意思。')}</p></section> : null}
      </> : null}
      {task.kind === 'repair' ? <>
        {visible >= 1 ? <section className="work-section work-error"><span className="work-label">示例报错</span><h2>项目暂时找不到 Vite。</h2><pre><code>{"TS2307: Cannot find module 'vite'\nor its corresponding type declarations."}</code></pre></section> : null}
        {visible >= 2 ? <section className="work-section"><span className="work-label">可能原因与建议示例</span><p>{text('先确认打开的是包含 package.json 的项目根目录，再检查其中是否声明并安装了 vite。缺少依赖与目录错误，都可能造成这个报错。')}</p></section> : null}
        {visible >= 3 ? <section className="work-section"><span className="work-label">命令示例 · 未执行</span><div className="work-terminal"><pre><code>{'npm install\nnpm run build'}</code></pre></div><p className="work-note">尚未检查或修复真实项目。</p></section> : null}
      </> : null}
      {task.kind === 'general' ? <>
        {visible >= 1 ? <section className="work-section work-source"><span className="work-label">这次想做的事</span><h2>{task.prompt}</h2></section> : null}
        {visible >= 2 ? <section className="work-section"><span className="work-label">本地已确认背景</span>{memories.length ? <ul className="work-memory-list">{memories.slice(0, 5).map((memory, index) => <li key={`${index}-${memory.content}`}>{memory.category ? <span className="work-chip">{memory.category}</span> : null} {memory.content}</li>)}</ul> : <p>还没有你确认的背景。可以从宠物的记忆入口添加。</p>}<p className="work-note">直接展示本地记录；没有调用模型或进行语义检索。</p></section> : null}
        {visible >= 3 ? <section className="work-section work-translation"><span className="work-label">下一步示例</span><h2>先从一个小步骤开始。</h2><p>{text('明确想得到的结果，准备需要的材料，再做一件容易开始的小事。需要时收起这张画布，内容会留在这里。')}</p></section> : null}
      </> : null}
      {parallel ? <>
        {visible >= 1 ? <section className="work-section work-source"><span className="work-label">{task.kind === 'followup' ? '持续目标示例' : '研究请求示例'}</span><h2>{task.prompt}</h2><p>{text(task.kind === 'followup' ? '跟进检查清单，只在需要决定时回来找你。这里用本地预设内容演示这个过程。' : '把同一个问题拆成三条线索，同时整理，再把结果带回一张画布。这里没有进行网络研究。')}</p></section> : null}
        {visible >= 2 ? <section className="work-section"><span className="work-label">并行工作 · 示例</span>{parallelTasks}</section> : null}
        {visible >= 3 ? task.kind === 'research' ? <section className="work-section work-result"><span className="work-label">比较草稿 · 示例</span><h3>留半天时间，选一个轻松的安排。</h3><ul><li>近郊散步：路程短，预算较低。</li><li>博物馆：室内活动，需要另查预约。</li><li>城市漫游：时间灵活，需要另查天气。</li></ul><p className="work-note">未查询真实地点、价格、预约或天气。</p></section> : <section className="work-section work-result"><span className="work-label">有一个决定需要你</span><h3>下一步，怎样开放试用？</h3><div className="work-actions">{['先小范围试用', '先完成发布检查'].map((option) => <button key={option} className={`work-button ${decision === option ? 'is-selected' : ''}`} disabled={cancelled} aria-pressed={decision === option} onClick={() => chooseDecision(option)}>{option}</button>)}</div><p aria-live="polite">{decision ? `本地草稿已更新：${decisionDraft}` : '选择后，当前草稿会按你的决定更新。'}</p><p className="work-note">没有发送邀请或保存真实日程。定时提醒可从本地计划入口创建。</p></section> : null}
      </> : null}
      {task.kind === 'computer' ? <>
        {visible >= 1 ? <section className="work-section"><span className="work-label">两种工作环境 · 示例</span><h2>需要时，给它一张工作桌。</h2><p>{text('在云电脑与本机示例之间切换，接管后编辑一张便签，再把示例控制权交还。')}</p></section> : null}
        {visible >= 2 ? <section className="work-section"><div className="work-tabs" aria-label="示例电脑切换">{(['cloud', 'local'] as const).map((item) => <button className="work-button" key={item} disabled={cancelled} aria-pressed={computer === item} onClick={() => { setComputer(item); setTakeover(false); }}>{item === 'cloud' ? '云电脑 · 示例' : '本机 · 示例'}</button>)}</div><div className="work-screen"><div className="work-screen-bar"><span>{computer === 'cloud' ? 'Dot 的云电脑' : '你的电脑'} · 示例画面</span><span className="work-chip">{takeover ? '你已接管 · 示例' : 'Dot 控制 · 示例'}</span></div><p className="work-note">没有连接真实电脑，也没有读取屏幕。</p><label className="work-field">示例便签<textarea className="work-input" rows={3} value={computerNote} onChange={(event) => setComputerNote(event.target.value)} disabled={!takeover || cancelled} maxLength={1000} /></label><button className="work-button" disabled={cancelled} onClick={() => setTakeover((value) => !value)}>{takeover ? '交还示例控制权' : '接管示例电脑'}</button></div></section> : null}
        {visible >= 3 ? <section className="work-section"><span className="work-label">你始终可以接手</span><p>{text('需要登录或做决定时，示例交接会停在你面前。这张画布不收集密码，也不会执行鼠标、键盘或终端操作。')}</p></section> : null}
      </> : null}
      {task.kind === 'channels' ? <>
        {visible >= 1 ? <section className="work-section"><span className="work-label">同一个伙伴 · 渠道示例</span><h2>在哪里聊，都能接着做。</h2><p>{text('切换渠道，查看彼此分开的示例消息。你输入的文字会追加到当前本地对话，不会发送给外部账户。')}</p></section> : null}
        {visible >= 2 ? <section className="work-section"><div className="work-tabs" aria-label="示例聊天渠道">{(['ChatGPT', 'Slack', 'Teams'] as const).map((item) => <button className="work-button" key={item} onClick={() => setChannel(item)} aria-pressed={channel === item}>{item}</button>)}</div><div className="work-messages">{messages.filter((message) => message.channel === channel).map((message, index) => <div className="work-message" key={`${channel}-${index}`}><span className="work-label">{message.author}</span><p>{message.text}</p></div>)}</div></section> : null}
        {visible >= 3 ? <section className="work-section"><form className="work-inline-form" onSubmit={(event) => { event.preventDefault(); if (!messageDraft.trim() || cancelled) return; setMessages((current) => [...current, { channel, author: '你 · 本地输入', text: messageDraft.trim() }]); setMessageDraft(''); setFeedback(`已追加到 ${channel} 本地示例，没有对外发送。`); }}><label className="work-field">补充到 {channel} 示例<input className="work-input" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={1000} disabled={cancelled} placeholder="补充一句…" /></label><button className="work-button" type="submit" disabled={!messageDraft.trim() || cancelled}>添加到示例</button></form><p className="work-note">真实渠道需各自连接；私人信息不会因切换渠道而获得分享授权。</p></section> : null}
      </> : null}
      {task.kind === 'space' ? <>
        {visible >= 1 ? <section className="work-section"><span className="work-label">一份能带走的本地文档</span><h2>把想法，写在同一页上。</h2><p>{text('先写下你的目标，再让 @dot 示例补一份草稿。你可以直接改字，最终复制或下载。')}</p></section> : null}
        {visible >= 2 ? <section className="work-section"><label className="work-field">演示文档 · 本地可编辑<textarea className="work-input work-document" rows={11} value={documentText} onChange={(event) => setDocumentText(event.target.value)} disabled={cancelled} maxLength={20000} spellCheck={false} /></label></section> : null}
        {visible >= 3 ? <section className="work-section"><div className="work-actions"><button className="work-button" disabled={cancelled || drafted} onClick={() => { setDocumentText((current) => current === INITIAL_DOCUMENT ? DRAFT_DOCUMENT : `${current.trimEnd()}\n\n## @dot 示例补充\n- 核对首次启动与输入流程\n- 检查暂停、继续和结果导出\n- 确认是否先小范围试用\n\n> 本地预设内容，未分析真实项目。\n`); setDrafted(true); setFeedback('已填入本地预设草稿，可以继续修改。'); }}>{drafted ? '@dot 草稿已填入' : '@dot 补一份草稿 · 示例'}</button></div><p className="work-note">未调用模型或 Space 服务。页面中的周期描述不等于已保存的定时任务。</p></section> : null}
      </> : null}
      {task.kind === 'voice' ? <>
        {visible >= 1 ? <section className="work-section"><span className="work-label">通话界面示例</span><h2>不必组织好一大段话。</h2><p>{text('有时只需要说说想法。这是语音交互的界面预览，按钮只改变本地状态，没有打开麦克风。')}</p></section> : null}
        {visible >= 2 ? <section className="work-section work-call"><div className={`work-call-orb ${callActive ? 'is-active' : ''}`} aria-hidden="true">···</div><p role="status">{callActive ? muted ? '通话界面示例 · 已静音' : '通话界面示例 · 未录音' : '通话界面尚未开启 / 已结束'}</p><div className="work-actions"><button className="work-button" disabled={!callActive || cancelled} aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? '取消静音示例' : '静音示例'}</button><button className="work-button" disabled={cancelled} onClick={() => { setCallActive((value) => !value); setMuted(false); }}>{callActive ? '结束界面演示' : '开始界面演示'}</button></div></section> : null}
        {visible >= 3 ? <section className="work-section"><form className="work-inline-form" onSubmit={(event) => { event.preventDefault(); if (!voiceDraft.trim() || cancelled) return; setVoiceNotes((current) => [...current, voiceDraft.trim()]); setVoiceDraft(''); }}><label className="work-field">也可以补充文字<input className="work-input" value={voiceDraft} onChange={(event) => setVoiceDraft(event.target.value)} maxLength={1000} disabled={cancelled} placeholder="比如：先整理需要决定的事" /></label><button type="submit" className="work-button" disabled={!voiceDraft.trim() || cancelled}>添加补充</button></form>{voiceNotes.length ? <ul>{voiceNotes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}<p className="work-note">只留在当前画布；结束通话界面不会停止主流程，停止按钮会。</p></section> : null}
      </> : null}
      {task.kind === 'files' ? <>
        {visible >= 1 ? <section className="work-section"><span className="work-label">只读你亲手选的那一份</span><h2>把材料，放到眼前。</h2><p>支持 txt、md、json、csv、log，单个文件不超过 1 MB。</p><label className="work-field">选择本地文本文件<input className="work-file-input" type="file" accept=".txt,.md,.json,.csv,.log,text/plain,text/markdown,application/json,text/csv" disabled={cancelled} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} /></label>{readingFile ? <p role="status">正在读取你选择的文件…</p> : null}{fileError ? <p className="work-feedback" role="alert">{fileError}</p> : null}</section> : null}
        {visible >= 2 ? <section className="work-section work-source"><span className="work-label">实际读取结果</span>{file ? <><h3>{file.name}</h3><p>{file.characters.toLocaleString()} 个字符 · {file.lines.toLocaleString()} 行</p></> : <p>尚未读取文件。选好以后，这里会显示真实信息。</p>}</section> : null}
        {visible >= 3 ? <section className="work-section"><span className="work-label">{file ? '文件内容 · 前 12,000 字符' : '等待你提供材料'}</span>{file ? <pre className="work-file-preview">{file.text.slice(0, 12000) || '（空文件）'}</pre> : <p>{text('没有示例数据冒充读取结果。文件只在本地浏览器内存中使用，不会发送给模型或外部服务。')}</p>}{file && file.text.length > 12000 ? <p className="work-note">预览已截断；复制或导出包含实际读取的完整内容。</p> : null}</section> : null}
      </> : null}
      {visible >= 3 || cancelled ? <section className="work-section work-export"><div className="work-actions"><button className="work-button" onClick={() => void copyResult()}><Icon name="copy" size={15} />复制当前内容</button><button className="work-button" onClick={downloadResult}>下载 Markdown</button></div>{feedback ? <p className="work-feedback" role="status">{feedback}</p> : null}</section> : null}
      {onRunDemo ? <details className="work-more"><summary>换一个示例</summary><div className="work-actions">{PROMPTS.filter(([kind]) => kind !== task.kind).map(([kind, prompt]) => <button className="work-button" key={kind} onClick={() => onRunDemo(prompt)}>{TASK_TITLES[kind]}</button>)}</div></details> : null}
    </div>
    <footer className="work-footer">
      <button className="work-pause" onClick={togglePlayback} disabled={state === 'completed' || cancelled}>{state === 'completed' ? <Icon name="check" size={16} /> : <PlaybackIcon paused={state === 'paused'} />}{state === 'completed' ? '示例播放完毕' : cancelled ? '已停止' : state === 'paused' ? '继续主流程' : '暂停主流程'}</button>
      <button className="work-stop" onClick={stopPlayback} disabled={state === 'completed' || cancelled}>停止全部</button>
      <button className="work-return" onClick={onClose}><Icon name="back" size={16} />收起</button>
    </footer>
  </section>;
}

export function TaskCanvas(props: TaskCanvasProps) {
  return <TaskPlayback key={props.task.id} {...props} />;
}
