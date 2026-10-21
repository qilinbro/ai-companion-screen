#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps/desktop/dist');
const markers = ['GROK_GEO', 'GrokCharacter', '__study', 'grok-study'];
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.svg', '.json', '.map']);
const failures = [];

if (!fs.existsSync(distDir)) {
  failures.push('未找到 apps/desktop/dist，请先执行 npm run desktop:public:build。');
} else {
  for (const file of walk(distDir)) {
    if (!textExtensions.has(path.extname(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const marker of markers) {
      if (text.includes(marker)) {
        failures.push(`${path.relative(root, file)} 含禁止标记 "${marker}"`);
      }
    }
  }
}

try {
  const insideWorkTree = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

  if (insideWorkTree === 'true') {
    const tracked = execFileSync(
      'git',
      ['ls-files', '--', 'vendor/grok-study', 'NOTICE.local.md'],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    if (tracked) {
      failures.push(`git 索引包含本地占位文件：\n${tracked}`);
    }
  } else {
    console.log('[check:no-vendor] 不在 Git 工作区，跳过索引检查。');
  }
} catch {
  console.log('[check:no-vendor] 未检测到 Git 工作区，跳过索引检查。');
}

if (failures.length > 0) {
  console.error('[check:no-vendor] 失败：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check:no-vendor] OK：dist 与 git 索引均不含本地学习占位素材。');

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}
