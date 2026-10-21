#!/usr/bin/env node
// Compile a small native Windows GUI with the system .NET Framework compiler.
// No original character files, user profiles or local path marker are embedded.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.join(root, 'outputs', 'release-tools');
const executable = path.join(output, '首次连接原角色.exe');
const source = path.join(root, 'scripts', 'connect-original-character.cs');

if (process.platform !== 'win32') throw new Error('角色连接助手需要在 Windows 上编译。');
for (let directory = root; ; directory = path.dirname(directory)) {
  assertOrdinaryDirectory(directory);
  if (path.dirname(directory) === directory) break;
}
for (const directory of [path.join(root, 'outputs'), output]) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  assertOrdinaryDirectory(directory);
}
if (fs.existsSync(executable)) {
  const stat = fs.lstatSync(executable);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(executable) !== executable) throw new Error('角色连接助手输出不能是链接或目录。');
}
const frameworkRoot = path.join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET');
const candidates = ['Framework64', 'Framework'].map((framework) => path.join(frameworkRoot, framework, 'v4.0.30319', 'csc.exe'));
const compiler = candidates.find((candidate) => fs.existsSync(candidate));
if (!compiler) throw new Error('缺少 Windows .NET Framework 4 编译器。');
const result = spawnSync(compiler, [
  '/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/warnaserror+',
  `/out:${executable}`, '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
  '/reference:System.Web.Extensions.dll', source,
], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) {
  if (result.error) process.stderr.write(`编译器未能启动（${result.error.code ?? 'unknown'}）。\n`);
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error('角色连接助手编译失败。');
}
console.log('[character:connector] 已生成 outputs/release-tools/首次连接原角色.exe；不含原角色素材或本机配置。');

function assertOrdinaryDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error('角色连接助手构建目录不能包含链接。');
}
