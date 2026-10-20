import { useEffect, useRef, useSyncExternalStore } from 'react';

export type Memory = { id: string; title: string; content: string; createdAt: string; updatedAt: string };
export type Reminder = { id: string; title: string; mode: 'once' | 'daily'; at: string; time: string; enabled: boolean; nextDueAt: string; lastTriggeredAt?: string };
export type Activity = { id: string; title: string; kind: string; status: 'running' | 'paused' | 'completed' | 'cancelled'; summary?: string; createdAt: string; updatedAt: string };
export type RulePreference = 'allow' | 'explicit' | 'ask' | 'handoff';
export type Workspace = {
  version: 1;
  profile: { name: string; reducedMotion: boolean };
  memories: Memory[];
  reminders: Reminder[];
  activities: Activity[];
  connections: Record<string, boolean>;
  rules: Record<string, RulePreference>;
  persistence: { saved: boolean; message: string };
};
export type StoreResult = { ok: boolean; error?: string; id?: string };

export const CONNECTIONS = ['Slack', 'Teams', 'GitHub', 'Drive', 'Calendar', 'Space', '本机', '云电脑'] as const;
export const RULES = [
  { id: 'screen', title: '查看屏幕', description: '了解你当前正在看的内容' },
  { id: 'files', title: '读取文件', description: '使用你选择的项目资料' },
  { id: 'commands', title: '运行命令', description: '演示终端与修复工作流' },
  { id: 'messages', title: '发送消息', description: '演示跨应用协作流程' },
] as const;
const STORAGE_KEY = 'companion-dot-workspace-v1';
const DEFAULT_RULES: Record<string, RulePreference> = { screen: 'ask', files: 'ask', commands: 'ask', messages: 'handoff' };
const listeners = new Set<() => void>();
const dueListeners = new Set<(reminder: { id: string; title: string }) => void>();
let loaded = false;
let timer: number | undefined;
let snapshot: Workspace = emptyWorkspace();

function emptyWorkspace(): Workspace {
  return { version: 1, profile: { name: 'Dot', reducedMotion: false }, memories: [], reminders: [], activities: [], connections: Object.fromEntries(CONNECTIONS.map((key) => [key, false])), rules: { ...DEFAULT_RULES }, persistence: { saved: true, message: '' } };
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === 'string'; }
function validDate(value: unknown): value is string { return isString(value) && Number.isFinite(Date.parse(value)); }
function text(value: string, maximum: number): string { return value.trim().slice(0, maximum); }
function newId(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function isRule(value: unknown): value is RulePreference { return value === 'allow' || value === 'explicit' || value === 'ask' || value === 'handoff'; }

function readWorkspace(raw: unknown): Workspace {
  if (!isObject(raw) || raw.version !== 1) throw new Error('unsupported workspace');
  const result = emptyWorkspace();
  if (isObject(raw.profile)) result.profile = { name: isString(raw.profile.name) ? text(raw.profile.name, 24) || 'Dot' : 'Dot', reducedMotion: raw.profile.reducedMotion === true };
  if (Array.isArray(raw.memories)) result.memories = raw.memories.filter((item): item is Memory => isObject(item) && isString(item.id) && isString(item.title) && isString(item.content) && validDate(item.createdAt) && validDate(item.updatedAt)).slice(0, 1000);
  if (Array.isArray(raw.reminders)) result.reminders = raw.reminders.filter((item): item is Reminder => isObject(item) && isString(item.id) && isString(item.title) && (item.mode === 'once' || item.mode === 'daily') && isString(item.at) && isString(item.time) && typeof item.enabled === 'boolean' && validDate(item.nextDueAt) && (item.mode !== 'daily' || /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))).slice(0, 200);
  if (Array.isArray(raw.activities)) result.activities = raw.activities.filter((item): item is Activity => isObject(item) && isString(item.id) && isString(item.title) && isString(item.kind) && ['running', 'paused', 'completed', 'cancelled'].includes(String(item.status)) && validDate(item.createdAt) && validDate(item.updatedAt)).slice(0, 200).map((item) => item.status === 'running' || item.status === 'paused' ? { ...item, status: 'cancelled', summary: '上次应用已关闭；演示没有自动重放。' } : { ...item, summary: isString(item.summary) ? item.summary : undefined });
  if (isObject(raw.connections)) for (const key of CONNECTIONS) result.connections[key] = raw.connections[key] === true;
  if (isObject(raw.rules)) for (const key of Object.keys(DEFAULT_RULES)) { const value = raw.rules[key]; if (isRule(value)) result.rules[key] = value; }
  return result;
}

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) snapshot = readWorkspace(JSON.parse(raw));
  } catch {
    snapshot = { ...snapshot, persistence: { saved: false, message: '无法读取本地资料。当前使用内存，关闭应用后可能丢失；原存储未被改写。' } };
  }
}
function getSnapshot(): Workspace { ensureLoaded(); return snapshot; }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useWorkspace(): Workspace { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }

function commit(next: Workspace): StoreResult {
  let result: StoreResult = { ok: true };
  try {
    const { persistence: _persistence, ...data } = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    snapshot = { ...next, persistence: { saved: true, message: '' } };
  } catch {
    const message = '未保存到本机。内容暂存在内存，关闭应用后会丢失；请保留草稿并重试。';
    snapshot = { ...next, persistence: { saved: false, message } };
    result = { ok: false, error: message };
  }
  listeners.forEach((listener) => listener());
  return result;
}
function dailyDue(time: string, after = Date.now()): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(after);
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (date.getTime() <= after) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
function activityWithDate(input: Omit<Activity, 'createdAt' | 'updatedAt'>, current: Workspace): Activity {
  const prior = current.activities.find((item) => item.id === input.id);
  const now = new Date().toISOString();
  return { ...input, title: text(input.title, 240), kind: text(input.kind, 80), summary: input.summary?.slice(0, 2000), createdAt: prior?.createdAt ?? now, updatedAt: now };
}
function withActivity(current: Workspace, input: Omit<Activity, 'createdAt' | 'updatedAt'>): Workspace {
  const activity = activityWithDate(input, current);
  return { ...current, activities: [activity, ...current.activities.filter((item) => item.id !== activity.id)].slice(0, 200) };
}

export const workspaceActions = {
  updateProfile(profile: Workspace['profile']): StoreResult {
    const current = getSnapshot();
    return commit({ ...current, profile: { name: text(profile.name, 24) || 'Dot', reducedMotion: profile.reducedMotion } });
  },
  saveMemory(input: { id?: string; title: string; content: string }): StoreResult {
    const current = getSnapshot();
    const title = text(input.title, 100);
    const content = text(input.content, 10000);
    if (!title || !content) return { ok: false, error: '请填写标题和内容。' };
    if (!input.id && current.memories.length >= 1000) return { ok: false, error: '本地记忆已达 1000 条，请先导出或整理。' };
    const id = input.id ?? newId();
    const prior = current.memories.find((item) => item.id === id);
    const now = new Date().toISOString();
    const memory = { id, title, content, createdAt: prior?.createdAt ?? now, updatedAt: now };
    return { ...commit({ ...current, memories: [memory, ...current.memories.filter((item) => item.id !== id)] }), id };
  },
  deleteMemory(id: string): StoreResult { const current = getSnapshot(); return commit({ ...current, memories: current.memories.filter((item) => item.id !== id) }); },
  createReminder(input: { id?: string; title: string; mode: 'once' | 'daily'; at?: string; time?: string }): StoreResult {
    const current = getSnapshot();
    const title = text(input.title, 160);
    if (!title) return { ok: false, error: '请写下要提醒的事。' };
    if (!input.id && current.reminders.length >= 200) return { ok: false, error: '本地提醒已达 200 条，请先整理。' };
    const time = input.time ?? '';
    const at = input.at ?? '';
    if (input.mode === 'daily' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, error: '请选择每天提醒的时间。' };
    if (input.mode === 'once' && (!validDate(at) || Date.parse(at) <= Date.now())) return { ok: false, error: '请选择将来的提醒时间。' };
    const id = input.id ?? newId();
    const reminder: Reminder = { id, title, mode: input.mode, at, time, enabled: true, nextDueAt: input.mode === 'daily' ? dailyDue(time) : new Date(at).toISOString() };
    return { ...commit({ ...current, reminders: [reminder, ...current.reminders.filter((item) => item.id !== id)] }), id };
  },
  setReminderEnabled(id: string, enabled: boolean): StoreResult {
    const current = getSnapshot();
    const item = current.reminders.find((reminder) => reminder.id === id);
    if (item && enabled && item.mode === 'once' && Date.parse(item.at) <= Date.now()) return { ok: false, error: '这条一次性提醒已到期，请新建一个提醒。' };
    return commit({ ...current, reminders: current.reminders.map((reminder) => reminder.id === id ? { ...reminder, enabled, nextDueAt: enabled && reminder.mode === 'daily' ? dailyDue(reminder.time) : reminder.nextDueAt } : reminder) });
  },
  deleteReminder(id: string): StoreResult { const current = getSnapshot(); return commit({ ...current, reminders: current.reminders.filter((item) => item.id !== id) }); },
  setConnection(id: string, enabled: boolean): StoreResult {
    const current = getSnapshot();
    if (!(CONNECTIONS as readonly string[]).includes(id)) return { ok: false, error: '未知的演示连接。' };
    return commit({ ...current, connections: { ...current.connections, [id]: enabled } });
  },
  setRule(id: string, preference: RulePreference): StoreResult {
    const current = getSnapshot();
    if (!(id in DEFAULT_RULES) || !isRule(preference)) return { ok: false, error: '未知的演示偏好。' };
    return commit({ ...current, rules: { ...current.rules, [id]: preference } });
  },
  saveRules(rules: Record<string, RulePreference>): StoreResult {
    const current = getSnapshot();
    return commit({ ...current, rules: Object.fromEntries(Object.entries(DEFAULT_RULES).map(([id, value]) => [id, isRule(rules[id]) ? rules[id] : value])) });
  },
  recordActivity(input: { id: string; title: string; kind: string; status: Activity['status']; summary?: string }): StoreResult {
    const current = getSnapshot();
    const prior = current.activities.find((item) => item.id === input.id);
    if (prior && prior.title === text(input.title, 240) && prior.kind === text(input.kind, 80) && prior.status === input.status && prior.summary === input.summary?.slice(0, 2000)) return { ok: current.persistence.saved, error: current.persistence.saved ? undefined : current.persistence.message };
    return commit(withActivity(current, input));
  },
  clearActivities(): StoreResult { return commit({ ...getSnapshot(), activities: [] }); },
  retrySave(): StoreResult { return commit(getSnapshot()); },
};

function checkReminders() {
  const current = getSnapshot();
  const now = Date.now();
  const due = current.reminders.filter((item) => item.enabled && Date.parse(item.nextDueAt) <= now);
  if (!due.length) return;
  const dueIds = new Set(due.map((item) => item.id));
  let next: Workspace = { ...current, reminders: current.reminders.map((item) => dueIds.has(item.id) ? { ...item, enabled: item.mode === 'daily', nextDueAt: item.mode === 'daily' ? dailyDue(item.time, now) : item.nextDueAt, lastTriggeredAt: new Date(now).toISOString() } : item) };
  for (const item of due) next = withActivity(next, { id: `reminder-${item.id}-${now}`, title: item.title, kind: 'reminder', status: 'completed', summary: '本次运行检查发现本地提醒已到期；回执时间为本次检查时间。应用关闭期间不会触发提醒。' });
  commit(next);
  for (const item of due) for (const listener of dueListeners) listener({ id: item.id, title: item.title });
}

export function useLocalReminders(onDue: (reminder: { id: string; title: string }) => void): void {
  const callback = useRef(onDue);
  useEffect(() => { callback.current = onDue; }, [onDue]);
  useEffect(() => {
    const listener = (reminder: { id: string; title: string }) => callback.current(reminder);
    dueListeners.add(listener);
    if (timer === undefined) { timer = window.setInterval(checkReminders, 1000); checkReminders(); }
    return () => {
      dueListeners.delete(listener);
      if (!dueListeners.size && timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };
  }, []);
}
