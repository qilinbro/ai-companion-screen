import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';

export type PublicModelConfig = {
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  configured: boolean;
  canPersistSecret: boolean;
  allowScreen: boolean;
  persistKey: boolean;
  message?: string;
};

export type SaveModelConfigInput = {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  persistKey: boolean;
  allowScreen: boolean;
};

export type RuntimeModelConfig = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  allowScreen: boolean;
};

type DiskModelConfig = {
  baseUrl: string;
  modelId: string;
  encryptedApiKey?: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_CONFIG_BYTES = 64 * 1024;

function rawHostname(value: string): string {
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority || authority.includes('@')) return '';
  const match = authority.startsWith('[')
    ? /^(\[[^\]]+\])(?::\d+)?$/.exec(authority)
    : /^([^:]+)(?::\d+)?$/.exec(authority);
  return (match?.[1] ?? '').toLowerCase();
}

/** Exact loopback hostnames only; URL's aliases such as 127.1 are not accepted. */
export function isLocalModelUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username && !parsed.password
      && !parsed.search && !parsed.hash
      && LOCAL_HOSTS.has(rawHostname(baseUrl))
      && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeModelBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 2048) {
    throw new Error('请输入有效的模型服务地址。');
  }
  const input = value.trim();
  if (/[\u0000-\u0020\\?#]/.test(input)) {
    throw new Error('模型服务地址不能包含空白、查询参数或片段。');
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('请输入完整的 http 或 https 模型服务地址。');
  }
  if (parsed.username || parsed.password || !rawHostname(input)) {
    throw new Error('模型服务地址不能包含用户名或密码。');
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalModelUrl(input))) {
    throw new Error('远程模型服务必须使用 HTTPS；HTTP 仅允许本机地址。');
  }
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/chat/completions')) {
    pathname = pathname.slice(0, -'/chat/completions'.length);
  }
  parsed.pathname = pathname || '/v1';
  return parsed.href.replace(/\/+$/, '');
}

function normalizeModelId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('请输入模型名称。');
  const modelId = value.trim();
  if (modelId.length < 1 || modelId.length > 200 || /[\u0000-\u001f\u007f]/.test(modelId)) {
    throw new Error('模型名称须为 1 至 200 个字符。');
  }
  return modelId;
}

function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('密钥格式无效，长度不能超过 8192 个字符。');
  }
  return value.trim();
}

function canPersistSecret(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Electron's basic_text fallback is not protected by an OS secret store.
    return process.platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend());
  } catch {
    return false;
  }
}

function parseInput(input: unknown): SaveModelConfigInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('模型配置格式无效。');
  }
  const data = input as Record<string, unknown>;
  const permitted = new Set(['baseUrl', 'modelId', 'apiKey', 'persistKey', 'allowScreen']);
  if (Object.keys(data).some((key) => !permitted.has(key))
    || typeof data.persistKey !== 'boolean' || typeof data.allowScreen !== 'boolean') {
    throw new Error('模型配置参数无效。');
  }
  const result: SaveModelConfigInput = {
    baseUrl: normalizeModelBaseUrl(data.baseUrl),
    modelId: normalizeModelId(data.modelId),
    persistKey: data.persistKey,
    allowScreen: data.allowScreen,
  };
  if (data.apiKey !== undefined) result.apiKey = normalizeApiKey(data.apiKey);
  return result;
}

/** Main-process-only store. No environment variables or other applications are read. */
export class ModelConfigStore {
  private readonly filePath: string;
  private runtime: RuntimeModelConfig = { baseUrl: '', modelId: '', apiKey: '', allowScreen: false };
  private persistKey = false;
  private message: string | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = path.join(path.resolve(userDataPath), 'model-config.json');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation, operation);
    this.pending = next.catch(() => undefined);
    return next;
  }

  async load(): Promise<void> {
    return this.serialize(async () => {
      this.runtime = { baseUrl: '', modelId: '', apiKey: '', allowScreen: false };
      this.persistKey = false;
      this.message = undefined;
      let source: string;
      try {
        const metadata = await fs.lstat(this.filePath);
        if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CONFIG_BYTES) {
          throw new Error('invalid_config');
        }
        source = await fs.readFile(this.filePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          this.message = '无法读取本应用的模型配置，请重新保存配置。';
        }
        return;
      }
      let encryptedApiKey: unknown;
      try {
        const data: unknown = JSON.parse(source);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_config');
        const disk = data as Record<string, unknown>;
        this.runtime.baseUrl = normalizeModelBaseUrl(disk.baseUrl);
        this.runtime.modelId = normalizeModelId(disk.modelId);
        encryptedApiKey = disk.encryptedApiKey;
      } catch {
        this.runtime = { baseUrl: '', modelId: '', apiKey: '', allowScreen: false };
        this.message = '已保存的模型配置无效，请重新保存配置。';
        return;
      }
      if (encryptedApiKey === undefined) return;
      this.persistKey = true;
      try {
        if (typeof encryptedApiKey !== 'string' || encryptedApiKey.length > MAX_CONFIG_BYTES
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encryptedApiKey)
          || !encryptedApiKey || !canPersistSecret()) throw new Error('secret_unavailable');
        const buffer = Buffer.from(encryptedApiKey, 'base64');
        this.runtime.apiKey = normalizeApiKey(safeStorage.decryptString(buffer));
      } catch {
        this.runtime.apiKey = '';
        this.message = '无法解密已保存的密钥，请重新输入密钥或清除保存的密钥。';
      }
    });
  }

  getPublic(): PublicModelConfig {
    return {
      baseUrl: this.runtime.baseUrl,
      modelId: this.runtime.modelId,
      hasApiKey: this.runtime.apiKey.length > 0,
      configured: Boolean(this.runtime.baseUrl && this.runtime.modelId),
      canPersistSecret: canPersistSecret(),
      allowScreen: this.runtime.allowScreen,
      persistKey: this.persistKey,
      ...(this.message ? { message: this.message } : {}),
    };
  }

  getRuntime(): RuntimeModelConfig {
    return { ...this.runtime };
  }

  /** Resolve an unsaved trusted settings form without persisting or granting screen access. */
  resolveForConnectionTest(input: unknown): RuntimeModelConfig {
    const data = parseInput(input);
    return {
      baseUrl: data.baseUrl,
      modelId: data.modelId,
      // A credential entered for another endpoint must never follow a changed URL.
      apiKey: data.apiKey === undefined ? (data.baseUrl === this.runtime.baseUrl ? this.runtime.apiKey : '') : data.apiKey,
      allowScreen: false,
    };
  }

  async save(input: unknown): Promise<PublicModelConfig> {
    const data = parseInput(input);
    return this.serialize(async () => {
      if (data.persistKey && !canPersistSecret()) {
        throw new Error('系统安全存储不可用，无法保存密钥。请关闭“记住密钥”后重试。');
      }
      const changedEndpoint = data.baseUrl !== this.runtime.baseUrl;
      const discardedSecret = changedEndpoint && data.apiKey === undefined && this.runtime.apiKey.length > 0;
      const next: RuntimeModelConfig = {
        baseUrl: data.baseUrl,
        modelId: data.modelId,
        apiKey: data.apiKey === undefined ? (changedEndpoint ? '' : this.runtime.apiKey) : data.apiKey,
        allowScreen: data.allowScreen,
      };
      const disk: DiskModelConfig = { baseUrl: next.baseUrl, modelId: next.modelId };
      if (data.persistKey && next.apiKey) {
        try {
          disk.encryptedApiKey = safeStorage.encryptString(next.apiKey).toString('base64');
        } catch {
          throw new Error('密钥加密失败，配置未保存。请关闭“记住密钥”后重试。');
        }
      }
      await this.writeAtomic(disk);
      this.runtime = next;
      this.persistKey = Boolean(disk.encryptedApiKey);
      const messages: string[] = [];
      if (discardedSecret) {
        messages.push('模型服务地址已变更，旧服务密钥不会沿用；远程服务请重新输入密钥。');
      }
      this.message = messages.length ? messages.join(' ') : undefined;
      return this.getPublic();
    });
  }

  async clearSecret(): Promise<PublicModelConfig> {
    return this.serialize(async () => {
      await this.writeAtomic({ baseUrl: this.runtime.baseUrl, modelId: this.runtime.modelId });
      this.runtime.apiKey = '';
      this.persistKey = false;
      this.message = undefined;
      return this.getPublic();
    });
  }

  private async writeAtomic(data: DiskModelConfig): Promise<void> {
    const directory = path.dirname(this.filePath);
    const temporary = path.join(directory, `.model-config-${randomUUID()}.tmp`);
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporary, `${JSON.stringify(data)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, this.filePath);
    } catch {
      throw new Error('无法保存本应用的模型配置，请检查本地数据目录是否可写。');
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }
}
