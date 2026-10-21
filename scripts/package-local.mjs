#!/usr/bin/env node
// This deployment is for the current computer only. Original character files
// remain in the existing workspace and are never copied into this application.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const releaseBuild = args.length === 1 && args[0] === '--release';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outputRoot = path.join(root, 'outputs');
const outputName = releaseBuild ? `banping-v${manifest.version}-win32-x64` : '伴屏-win32-x64';
const outputDir = path.join(outputRoot, outputName);
const appDir = path.join(outputDir, 'resources', 'app');
const electronDir = path.join(root, 'node_modules', 'electron', 'dist');
const runtimeModules = ['react', 'react-dom', 'scheduler'];
const rendererExtensions = new Set(['.js', '.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
const mainFileNames = new Set(['main.js', 'preload.js', 'agent-runtime.js', 'model-config.js', 'screen-capture.js', 'screen-tool.js', 'window-layout.js']);
const runtimeFileNames = new Set(['electron.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll']);
const characterFiles = ['geometry-data.js', 'src/math.js', 'src/tables.js', 'src/pose.js', 'src/tricks.js', 'src/fx.js', 'src/eyes.js', 'src/character.js'];

try {
  if (args.length && !releaseBuild) throw new Error('仅支持不带参数或 --release；不接受自定义输出路径。');
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('项目版本必须为固定的三段数字版本。');
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('此脚本只支持当前 Windows x64 电脑。');
  }
  assertOrdinaryDirectory(root);
  assertOrdinaryDirectory(electronDir);
  const characterRoot = path.join(root, 'vendor', 'grok-study', 'replica');
  for (const relative of characterFiles) assertOrdinaryFile(path.join(characterRoot, relative), root);

  const renderer = collectRenderer(path.join(root, 'apps', 'desktop', 'dist-local'));
  const main = collectMain(path.join(root, 'apps', 'desktop', 'dist-electron'));
  const modules = runtimeModules.map(collectRuntimeModule);
  const electron = collectElectronRuntime();
  const instructions = fs.readFileSync(path.join(root, 'scripts', 'README-LOCAL-WINDOWS.txt'), 'utf8');

  // Validate all sources and the exact target before replacing this script's
  // own output. Old demo packages and user profiles are outside this target.
  assertSafeOutput();
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  copyFiles(electron, outputDir);
  copyFiles(renderer, path.join(appDir, 'apps', 'desktop', 'dist-local'));
  copyFiles(main, path.join(appDir, 'apps', 'desktop', 'dist-electron'));
  for (const module of modules) copyFiles(module.files, path.join(appDir, 'node_modules', module.name));
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'banping-demo',
    productName: '伴屏',
    version: manifest.version,
    private: true,
    description: '伴屏 Windows 本机应用（原角色）',
    main: 'apps/desktop/dist-electron/main.js',
    dependencies: Object.fromEntries(modules.map((module) => [module.name, module.version])),
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(appDir, 'local-desktop.json'), JSON.stringify({
    kind: 'banping-local-desktop',
    version: 1,
    workspaceRoot: root,
    characterAssetRoot: fs.realpathSync(characterRoot),
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(outputDir, '使用说明.txt'), instructions.replaceAll('{{WORKSPACE_ROOT}}', root));
  fs.renameSync(path.join(outputDir, 'electron.exe'), path.join(outputDir, '伴屏.exe'));
  auditOutput();
  console.log(`[desktop:package:local] 已生成：${path.join(outputDir, '伴屏.exe')}`);
  console.log('[desktop:package:local] 双击即可启动，不需要 Node.js、终端或再次编译。');
  console.log('[desktop:package:local] 此版本依赖原工作区角色路径，仅用于当前电脑；原素材、配置和密钥未复制进应用。');
} catch (error) {
  console.error(`[desktop:package:local] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function isInside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function assertOrdinaryDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) {
    throw new Error(`目录不是原始普通目录，拒绝使用：${directory}`);
  }
}

function assertOrdinaryFile(file, base) {
  if (!isInside(base, file)) throw new Error(`文件超出允许目录：${file}`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file) {
    throw new Error(`文件不是原始普通文件，拒绝使用：${file}`);
  }
  let directory = path.dirname(file);
  while (isInside(base, directory)) {
    assertOrdinaryDirectory(directory);
    if (directory === base) break;
    directory = path.dirname(directory);
  }
}

function collectRenderer(directory) {
  assertOrdinaryDirectory(directory);
  const files = [];
  visit(directory);
  if (!files.some((file) => file.relative === 'character.html')) throw new Error('缺少 dist-local/character.html，请先完成本机角色构建。');
  return files;

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`界面构建不允许链接：${full}`);
      if (entry.isDirectory()) {
        if (entry.name !== 'assets' || current !== directory) throw new Error(`界面构建包含未许可目录：${full}`);
        assertOrdinaryDirectory(full);
        visit(full);
        continue;
      }
      if (path.extname(entry.name) === '.map') continue;
      if (!entry.isFile() || !rendererExtensions.has(path.extname(entry.name).toLowerCase()) || characterFiles.some((name) => path.basename(name) === entry.name)) {
        throw new Error(`界面构建包含未许可文件：${full}`);
      }
      assertOrdinaryFile(full, directory);
      files.push({ source: full, relative: path.relative(directory, full) });
    }
  }
}

function collectMain(directory) {
  assertOrdinaryDirectory(directory);
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.map')) continue;
    if (!entry.isFile() || !mainFileNames.has(entry.name)) throw new Error(`主进程构建包含未许可文件：${entry.name}`);
    const full = path.join(directory, entry.name);
    assertOrdinaryFile(full, directory);
    files.push({ source: full, relative: entry.name });
  }
  for (const required of mainFileNames) {
    if (!files.some((file) => file.relative === required)) throw new Error(`缺少主进程构建 ${required}，请先编译。`);
  }
  return files;
}

function collectElectronRuntime() {
  const files = [];
  for (const entry of fs.readdirSync(electronDir, { withFileTypes: true })) {
    const full = path.join(electronDir, entry.name);
    if (entry.name === 'resources' && entry.isDirectory()) {
      assertOrdinaryDirectory(full);
      for (const resource of fs.readdirSync(full, { withFileTypes: true })) {
        if (!resource.isFile() || resource.name !== 'default_app.asar') throw new Error('Electron 默认资源目录出现未审核内容。');
        assertOrdinaryFile(path.join(full, resource.name), electronDir);
      }
      continue;
    }
    if (entry.name === 'locales' && entry.isDirectory()) {
      assertOrdinaryDirectory(full);
      for (const locale of fs.readdirSync(full, { withFileTypes: true })) {
        const source = path.join(full, locale.name);
        if (!locale.isFile() || !/^[a-zA-Z0-9-]+\.pak$/.test(locale.name)) throw new Error(`Electron 语言文件未被许可：${source}`);
        assertOrdinaryFile(source, electronDir);
        files.push({ source, relative: path.join('locales', locale.name) });
      }
      continue;
    }
    if (!entry.isFile() || !runtimeFileNames.has(entry.name)) throw new Error(`Electron 运行时包含未许可内容：${full}`);
    assertOrdinaryFile(full, electronDir);
    files.push({ source: full, relative: entry.name });
  }
  if (!files.some((file) => file.relative === 'electron.exe')) throw new Error('Electron 运行时不完整，请先安装开发依赖。');
  return files;
}

function collectRuntimeModule(name) {
  const packagePath = require.resolve(`${name}/package.json`);
  const directory = path.dirname(packagePath);
  assertOrdinaryDirectory(directory);
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (Object.keys(manifest.dependencies ?? {}).some((dependency) => !runtimeModules.includes(dependency))) {
    throw new Error(`${name} 包含未审核运行依赖。`);
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !(/\.js$/.test(entry.name) || entry.name === 'package.json' || entry.name === 'LICENSE')) continue;
    const source = path.join(directory, entry.name);
    assertOrdinaryFile(source, directory);
    files.push({ source, relative: entry.name });
  }
  const cjs = path.join(directory, 'cjs');
  assertOrdinaryDirectory(cjs);
  for (const entry of fs.readdirSync(cjs, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.production.js')) continue;
    const source = path.join(cjs, entry.name);
    assertOrdinaryFile(source, directory);
    files.push({ source, relative: path.join('cjs', entry.name) });
  }
  if (!files.some((file) => file.relative.endsWith('.production.js'))) throw new Error(`${name} 缺少生产模块。`);
  return { name, version: manifest.version, files };
}

function assertSafeOutput() {
  const expectedName = releaseBuild ? `banping-v${manifest.version}-win32-x64` : '伴屏-win32-x64';
  if (!path.isAbsolute(outputDir) || outputDir !== path.join(root, 'outputs', expectedName) || path.dirname(outputDir) !== outputRoot || !isInside(root, outputDir)) {
    throw new Error('输出路径不是本项目指定的本机应用目录。');
  }
  if (fs.existsSync(outputRoot)) assertOrdinaryDirectory(outputRoot);
  if (fs.existsSync(outputDir)) {
    assertOrdinaryDirectory(outputDir);
    rejectLinks(outputDir);
  }
}

function rejectLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (fs.lstatSync(full).isSymbolicLink()) throw new Error(`已有输出含链接，拒绝清理：${full}`);
    if (entry.isDirectory()) rejectLinks(full);
  }
}

function copyFiles(files, destination) {
  for (const file of files) {
    const target = path.join(destination, file.relative);
    if (!isInside(destination, target)) throw new Error('目标文件越界。');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target);
  }
}

function auditOutput() {
  rejectLinks(outputDir);
  for (const name of fs.readdirSync(appDir)) {
    if (!['apps', 'node_modules', 'package.json', 'local-desktop.json'].includes(name)) throw new Error(`应用内出现未许可条目：${name}`);
  }
  const forbiddenDirectories = ['vendor', 'local-study-profile', 'validation', 'tests', 'test-results', '.git', '.codex'];
  visit(outputDir);
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (forbiddenDirectories.includes(entry.name)) throw new Error(`输出包含应排除的目录：${full}`);
        visit(full);
      } else if (characterFiles.some((name) => entry.name === path.basename(name)) || /(?:\.map|\.log)$/i.test(entry.name)) {
        throw new Error(`输出包含角色原文件或开发资料：${full}`);
      }
    }
  }
}
