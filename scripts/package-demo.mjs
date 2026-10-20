#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(import.meta.url);
const outputRoot = path.resolve(root, 'outputs');
const outputDir = path.resolve(outputRoot, '伴屏-Demo-win32-x64');
const appDir = path.join(outputDir, 'resources', 'app');
const electronDir = path.join(root, 'node_modules', 'electron', 'dist');
const appManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const moduleNames = ['react', 'react-dom', 'scheduler'];
const assetExtensions = new Set(['.js', '.cjs', '.mjs', '.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
const forbiddenMarkers = ['GROK_GEO', 'GrokCharacter', '__study', 'grok-study'];
const textExtensions = new Set(['.js', '.cjs', '.mjs', '.html', '.css', '.svg']);

try {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('此脚本仅封装当前 Windows x64 Electron 运行时，请在 Windows x64 上执行。');
  }
  if (!fs.existsSync(path.join(electronDir, 'electron.exe'))) {
    throw new Error('缺少 node_modules/electron/dist/electron.exe，请先运行 npm install --include=dev。');
  }

  // Validate every input before removing a previous portable build.
  const rendererFiles = collectBuildFiles(path.join(root, 'apps', 'desktop', 'dist'));
  const mainFiles = collectBuildFiles(path.join(root, 'apps', 'desktop', 'dist-electron'));
  if (!rendererFiles.some((file) => file.relative === 'character.html')) {
    throw new Error('缺少 character.html，请先运行 npm run build。');
  }
  if (!mainFiles.some((file) => file.relative === 'main.js')) {
    throw new Error('缺少 dist-electron/main.js，请先运行 npm run build。');
  }
  const modules = moduleNames.map((name) => collectRuntimeModule(name));
  assertSafeOutput();
  if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // Electron's published runtime only; never copy the project or all node_modules.
  copyRuntimeDirectory(electronDir, outputDir);
  fs.rmSync(path.join(outputDir, 'resources', 'default_app.asar'), { force: true });
  fs.mkdirSync(appDir, { recursive: true });
  copyFiles(rendererFiles, path.join(appDir, 'apps', 'desktop', 'dist'));
  copyFiles(mainFiles, path.join(appDir, 'apps', 'desktop', 'dist-electron'));
  for (const module of modules) {
    copyFiles(module.files, path.join(appDir, 'node_modules', module.name));
  }
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'banping-demo',
    productName: '伴屏 Demo',
    version: appManifest.version,
    private: true,
    description: '伴屏 Windows 交互 Demo（可配置兼容 OpenAI API 的服务）',
    main: 'apps/desktop/dist-electron/main.js',
    dependencies: Object.fromEntries(modules.map((module) => [module.name, module.version])),
  }, null, 2) + '\n');
  fs.copyFileSync(path.join(root, 'README-WINDOWS.txt'), path.join(outputDir, 'README-WINDOWS.txt'));
  fs.renameSync(path.join(outputDir, 'electron.exe'), path.join(outputDir, '伴屏 Demo.exe'));

  console.log(`[desktop:package] 已生成便携目录：${outputDir}`);
  console.log('[desktop:package] 双击「伴屏 Demo.exe」运行；分享时请保留整个目录。');
  console.log('[desktop:package] 打包完成不代表已通过 Windows 启动和交互验证。');
} catch (error) {
  console.error(`[desktop:package] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function assertSafeOutput() {
  const expected = path.join(root, 'outputs', '伴屏-Demo-win32-x64');
  if (!path.isAbsolute(outputDir) || outputDir !== expected || path.dirname(outputDir) !== outputRoot) {
    throw new Error('输出目录不在本项目指定的 outputs 子目录，已中止。');
  }
  for (const directory of [outputRoot, outputDir]) {
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory) {
      throw new Error(`输出目录不是本项目内的普通目录，已中止：${directory}`);
    }
  }
  // Recursive deletion must not follow an existing junction or symbolic link.
  if (fs.existsSync(outputDir)) rejectLinks(outputDir);
}

function rejectLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (fs.lstatSync(full).isSymbolicLink()) throw new Error(`输出目录含链接，拒绝清理：${full}`);
    if (entry.isDirectory()) rejectLinks(full);
  }
}

function collectBuildFiles(directory) {
  if (!fs.existsSync(directory)) throw new Error(`缺少构建目录 ${path.relative(root, directory)}，请先运行 npm run build。`);
  const result = [];
  visit(directory);
  return result;

  function visit(current) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`构建目录不允许链接：${current}`);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`构建内容不允许链接：${full}`);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      // Debug source maps are deliberately omitted from the portable demo.
      if (path.extname(entry.name) === '.map') continue;
      if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name).toLowerCase())) {
        throw new Error(`构建目录包含未许可文件：${full}`);
      }
      if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
        const content = fs.readFileSync(full, 'utf8');
        if (forbiddenMarkers.some((marker) => content.includes(marker))) {
          throw new Error(`构建目录包含本地学习占位标记：${full}`);
        }
      }
      result.push({ source: full, relative: path.relative(directory, full) });
    }
  }
}

function collectRuntimeModule(name) {
  const packagePath = require.resolve(`${name}/package.json`);
  const directory = path.dirname(packagePath);
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  // Explicit module and file allowlists exclude dependency source, tests and tools.
  const dependencies = Object.keys(manifest.dependencies ?? {});
  if (dependencies.some((dependency) => !moduleNames.includes(dependency))) {
    throw new Error(`${name} 新增了未审核的运行依赖，请先更新打包白名单。`);
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !(/\.js$/.test(entry.name) || entry.name === 'package.json' || entry.name === 'LICENSE')) continue;
    files.push({ source: path.join(directory, entry.name), relative: entry.name });
  }
  const cjs = path.join(directory, 'cjs');
  for (const entry of fs.readdirSync(cjs, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.production.js')) {
      files.push({ source: path.join(cjs, entry.name), relative: path.join('cjs', entry.name) });
    }
  }
  if (!files.some((file) => file.relative.endsWith('.production.js'))) {
    throw new Error(`${name} 未找到生产运行模块，请检查安装。`);
  }
  return { name, version: manifest.version, files };
}

function copyFiles(files, destination) {
  for (const file of files) {
    const target = path.join(destination, file.relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target);
  }
}

function copyRuntimeDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const input = path.join(source, entry.name);
    const output = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Electron 运行时不允许链接：${input}`);
    if (entry.isDirectory()) copyRuntimeDirectory(input, output);
    else if (entry.isFile()) fs.copyFileSync(input, output);
    else throw new Error(`Electron 运行时包含未知条目：${input}`);
  }
}
