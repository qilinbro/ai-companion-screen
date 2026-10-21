// Development-only acceptance driver. Runs the actual Windows Electron app,
// including the packaged executable; never imported or shipped by the app.
// The loopback server is a protocol fixture, NOT a real model.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const publicBuild = process.argv.includes('--public');
const localDesktop = !publicBuild;
if (publicBuild && process.argv.includes('--local-desktop')) throw new Error('Choose either --public or --local-desktop.');
const reviewOnly = process.argv.includes('--ui-review');
const keepOpen = process.argv.includes('--keep-open') || reviewOnly;
const tag = `${localDesktop ? packaged ? 'local-desktop' : 'source-local' : packaged ? 'portable' : 'source'}${reviewOnly ? '-ui' : ''}`;
const profile = path.join(root, 'outputs', `v02-${tag}-profile-${Date.now()}`);
const mainPort = packaged ? 19331 : 19321;
const rendererPort = mainPort + 1;
const report = { kind: 'Windows native Electron + controlled loopback protocol (not a real model)', tag, date: new Date().toISOString(), checks: [], displays: [], fixture: { requests: 0, pngCount: 0, imageHashes: [] } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child, main, renderer, background;
const sockets = new Set();
const fixture = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return; }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) { res.writeHead(413).end(); return; } chunks.push(chunk); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end(); return; }
  report.fixture.requests++;
  const prompts = body.messages.filter((m) => m.role === 'user' && typeof m.content === 'string');
  const prompt = prompts.at(-1)?.content ?? '';
  const image = body.messages.flatMap((m) => Array.isArray(m.content) ? m.content : []).find((p) => p.type === 'image_url');
  const denied = body.messages.some((m) => m.role === 'tool' && m.content?.includes('screen_not_allowed'));
  if (image) {
    const bytes = Buffer.from(image.image_url.url.replace(/^data:image\/png;base64,/, ''), 'base64');
    assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    report.fixture.pngCount++;
    report.fixture.imageHashes.push(createHash('sha256').update(bytes).digest('hex'));
  }
  if (prompt.includes('HTTP401')) { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":{"message":"invalid key"}}'); return; }
  if (prompt.includes('BADFORMAT')) { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>invalid fixture response</html>'); return; }
  if (prompt.includes('DISCONNECT')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: {"choices":[{"index":0,"delta":{"content":"中断前文字"}}]}\n\n'); setTimeout(() => res.destroy(), 150); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  const frame = (delta, finish_reason = null) => { if (!res.destroyed) res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`); };
  const end = () => { frame({}, 'stop'); if (!res.destroyed) res.end('data: [DONE]\n\n'); };
  if ((prompt.includes('SCREEN') || body.tool_choice?.function?.name === 'capture_screen') && !image && !denied) {
    frame({ tool_calls: [{ index: 0, id: `fixture-${report.fixture.requests}`, type: 'function', function: { name: 'capture_screen', arguments: '{}' } }] });
    frame({}, 'tool_calls'); res.end('data: [DONE]\n\n'); return;
  }
  if (prompt.includes('STOP') || prompt.includes('SUSPEND') || prompt.includes('CLOSE')) {
    frame({ content: '正在输出受控测试文字。' });
    setTimeout(() => { frame({ content: '迟到文字不应出现-LATE' }); end(); }, 1600); return;
  }
  if (prompt.includes('LONG')) {
    const parts = ['# 阅读与代码\n\n', '这是一段受控排版验证内容，不代表真实模型输出。\n\n', '```typescript\nconst companion = "伴屏";\nconsole.log(companion);\n```\n\n', '1. 主屏继续工作\n2. 副屏查看回复\n\n| 状态 | 行为 |\n| --- | --- |\n| 等待 | 思考 |\n| 读屏 | 观察 |\n\n> 画布位置与主屏采集来源分别管理。\n\n', ...Array.from({ length: 36 }, (_, i) => `## 第 ${i + 1} 段\n\n用于长回复阅读的文字。保留阅读位置，按需回到底部。**强调**与\`行内代码\`。\n\n`)];
    parts.forEach((content, index) => setTimeout(() => frame({ content }), index * 65));
    setTimeout(end, parts.length * 65 + 150); return;
  }
  frame({ content: denied ? '没有获得屏幕授权，我会根据你提供的文字继续帮助。' : image ? '受控服务已收到本次真实主屏 PNG；这不是实际模型的分析结果。' : '普通文字直接回答，未读取屏幕。' });
  end();
});
fixture.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.next = 1; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', (message) => { const value = JSON.parse(String(message.data)); const item = this.pending.get(value.id); if (!item) return; this.pending.delete(value.id); clearTimeout(item.timer); value.error ? item.reject(new Error(value.error.message)) : item.resolve(value.result); });
  }
  async send(method, params = {}) { await this.ready; const id = this.next++; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000); this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression, userGesture = false) { const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture }); if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text); return result.value; }
  close() { this.ws.close(); }
}
async function until(operation, label, ms = 15000) { const limit = Date.now() + ms; let last; while (Date.now() < limit) { try { const value = await operation(); if (value) return value; } catch (error) { last = error; } await sleep(100); } throw new Error(`Timed out: ${label}${last ? ` (${last.message})` : ''}`); }
async function connect(port, predicate = () => true) { const target = await until(async () => { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); return list.find(predicate); }, `debug target ${port}`); const cdp = new CDP(target.webSocketDebuggerUrl); await cdp.ready; return cdp; }
function check(label, detail = true) { report.checks.push({ label, passed: true, detail }); console.log(`[desktop:validate] PASS ${label}`); }
const native = (expression) => main.evaluate(`(() => { const E = process.mainModule.require('electron'); const win = E.BrowserWindow.getAllWindows().find(w => w.getTitle().startsWith('伴屏')); ${expression} })()`);
const ui = (expression, userGesture = false) => renderer.evaluate(expression, userGesture);
const button = async (label) => { const selector = `button[aria-label=${JSON.stringify(label)}]`; await until(() => ui(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); return b && b.getClientRects().length && !b.disabled; })()`), `button ${label}`); return ui(`document.querySelector(${JSON.stringify(selector)}).click()`, true); };
const text = () => ui('document.body.innerText');
async function setDraft(prompt) { await ui(`(() => { const el = [...document.querySelectorAll('textarea')].find(e => e.getClientRects().length); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(prompt)}); el.dispatchEvent(new Event('input', { bubbles:true })); })()`); await sleep(80); }
async function send(prompt) { await ui("window.companion.setMode('canvas')"); await setDraft(prompt); await ui("document.querySelector('.agent-compose').requestSubmit()"); await until(() => ui("!!document.querySelector('[aria-label=\"停止回复\"]') || document.body.innerText.includes(" + JSON.stringify(prompt) + ")"), 'turn start'); }
async function idle() { await until(() => ui("!document.querySelector('[aria-label=\"停止回复\"]')"), 'turn end'); await sleep(100); }
async function config(allowScreen) { return ui(`window.companion.saveModelConfig({ baseUrl:${JSON.stringify(`http://127.0.0.1:${fixture.address().port}/v1`)}, modelId:'controlled-fixture', persistKey:false, allowScreen:${allowScreen} })`); }

try {
  await fs.mkdir(profile, { recursive: true });
  await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const exe = path.join(root, packaged ? localDesktop ? 'outputs/伴屏-win32-x64/伴屏.exe' : 'outputs/伴屏-Demo-win32-x64/伴屏 Demo.exe' : 'node_modules/electron/dist/electron.exe');
  const args = [`--inspect=127.0.0.1:${mainPort}`, `--remote-debugging-port=${rendererPort}`, '--remote-debugging-address=127.0.0.1'];
  if (!packaged) args.push(path.join(root, 'apps/desktop/dist-electron/main.js'));
  child = spawn(exe, args, { cwd: root, env: { ...process.env, VITE_DEV_SERVER_URL: '', COMPANION_LOCAL_CHARACTER: localDesktop ? '1' : '0', COMPANION_USER_DATA_DIR: profile }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = ''; child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(-4000); });
  main = await connect(mainPort);
  renderer = await connect(rendererPort, (t) => t.type === 'page' && t.url.includes('character.html'));
  await until(() => ui('!!window.companion && !!document.querySelector(".pet-button")'), 'application ready');
  const initial = await native("return { bounds:win.getBounds(), packaged:E.app.isPackaged, displays:E.screen.getAllDisplays().map(d=>({ id:d.id,label:d.label,scaleFactor:d.scaleFactor,bounds:d.bounds,workArea:d.workArea })) }; ");
  report.displays = initial.displays; check('native startup', initial);
  if (localDesktop) {
    await until(() => ui("typeof window.GrokCharacter === 'function' && document.querySelector('.character-study path')"), 'original character loaded');
    await until(() => native('return win.isVisible();'), 'native window visible');
    await ui("window.__characterProbe={svg:document.querySelector('.character-study'),path:document.querySelector('.character-study path'),pointerPrevented:false}; document.querySelector('.pet-button').addEventListener('pointerdown', e=>setTimeout(()=>{window.__characterProbe.pointerPrevented=e.defaultPrevented},0),{once:true});");
    await native("globalThis.__bpStyleCalls={setResizable:0,setSkipTaskbar:0,setAlwaysOnTop:0,hide:0,show:0}; for(const method of Object.keys(globalThis.__bpStyleCalls)){ const original=win[method].bind(win); win[method]=(...args)=>{globalThis.__bpStyleCalls[method]++; return original(...args)}; } win.focus();win.webContents.focus();return true;");
    for (let index=0; index<20; index++) {
      const point = await ui("(()=>{const r=document.querySelector('.pet-button').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
      await native(`win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:${point.x},y:${point.y}});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:${point.x},y:${point.y}});return true;`);
      const expected = index%2===0 ? 'mode-input' : 'mode-idle';
      await until(() => ui(`document.querySelector('main').classList.contains('${expected}')`), `pet click ${index+1}`);
      const intact = await ui("document.querySelector('.character-study')===window.__characterProbe.svg && document.querySelector('.character-study path')===window.__characterProbe.path && !!window.__characterProbe.path.getAttribute('d')");
      assert(intact, 'Character was remounted or lost its path while clicking');
    }
    const focus = await ui("({outline:getComputedStyle(document.querySelector('.pet-button')).outlineStyle, pointerPrevented:window.__characterProbe.pointerPrevented,placeholder:!!document.querySelector('.dot-pet')})");
    assert.equal(focus.outline, 'none');assert(focus.pointerPrevented);assert.equal(focus.placeholder,false);
    check('20 native pet clicks retain original SVG and avoid circular focus outline', focus);
    const styleCalls=await native('return globalThis.__bpStyleCalls;');report.characterStyleCalls=styleCalls;assert(Object.values(styleCalls).every(n=>n===0));check('pet clicks avoid repeated window styles and hide/show',styleCalls);
    await native("win.focus();win.webContents.focus();return true;");
    await ui("document.querySelector('.pet-button').focus();window.__keyboardProbe=[];document.addEventListener('keydown',e=>window.__keyboardProbe.push({key:e.key,target:e.target.className}));");
    await until(()=>ui("document.activeElement===document.querySelector('.pet-button')"),'keyboard focus');
    await native("win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});return true;");
    await until(()=>ui("document.querySelector('main').classList.contains('mode-input')"),'keyboard open');
    await native("win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});return true;");
    await until(()=>ui("document.querySelector('main').classList.contains('mode-idle')"),'keyboard collapse');
    assert(await ui("document.activeElement===document.querySelector('.pet-button') && getComputedStyle(document.querySelector('.pet-button')).outlineStyle==='none'"));check('keyboard open and Esc preserve accessible focus without ring');
  }
  if (reviewOnly) {
    await config(false); await send('受控测试 LONG'); await idle();
    await ui("document.querySelector('.agent-messages').scrollTop = 0; document.querySelector('.agent-messages').dispatchEvent(new Event('scroll'));");
    check('controlled long reply prepared for Windows UI review');
  } else {
  const clean = await ui('window.companion.getModelConfig()'); assert.equal(clean.allowScreen, false); assert.equal(clean.configured, false); check('empty profile and permission default');
  const unauthorized = await ui("window.companion.captureScreen({requestId:'unauthorized-test'}).then(()=>false,()=>true)"); assert(unauthorized); check('legacy capture IPC permission enforced');
  await ui("window.companion.setMode('input')"); await button('设置');
  await until(() => ui("!!document.querySelector('.model-settings select')"), 'display setting');
  check('display selector in settings', await ui("[...document.querySelectorAll('.model-settings select option')].map(e=>e.textContent)"));
  await button('关闭设置'); await config(false);
  const connection = await ui(`window.companion.testModelConnection({baseUrl:${JSON.stringify(`http://127.0.0.1:${fixture.address().port}/v1`)},modelId:'controlled-fixture',persistKey:false,allowScreen:false})`);
  assert(connection.ok); assert.equal(connection.checks.vision, 'not_tested'); check('connection check is explicit about untested vision', connection);
  await send('受控测试 TEXT'); await idle(); assert((await text()).includes('普通文字直接回答')); assert.equal(report.fixture.pngCount, 0); check('plain text without capture');
  await send('受控测试 SCREEN denied'); await idle(); assert((await text()).includes('没有获得屏幕授权')); assert.equal(report.fixture.pngCount, 0); check('denied screen request explains without capture');
  await config(true);
  await native("globalThis.__bpValidationBackground = new E.BrowserWindow({ ...E.screen.getPrimaryDisplay().bounds, frame:false, show:true, webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false} }); globalThis.__bpValidationBackground.loadURL('data:text/html,<body style=\"margin:0;background:%23c7a887;color:%231b1916;font:50px sans-serif\">Controlled acceptance screen A</body>'); win.show(); return true;");
  background = true; await sleep(500);
  await send('受控测试 SCREEN image A'); await idle(); assert.equal(report.fixture.pngCount, 1); check('tool request captures real primary PNG');
  await main.evaluate("globalThis.__bpValidationBackground.webContents.executeJavaScript(\"document.body.style.background='#506c89'; document.body.textContent='Controlled acceptance screen B'\")");
  await sleep(200); await send('受控测试 SCREEN image B'); await idle(); assert.equal(report.fixture.pngCount, 2); assert.notEqual(report.fixture.imageHashes[0], report.fixture.imageHashes[1]); check('changed screen obtains new PNG');
  await main.evaluate('globalThis.__bpValidationBackground.close()'); background = false;
  const before = report.fixture.requests;
  const petBounds = await native("return win.getBounds();");
  await ui("window.companion.setMode('idle')"); const pet = await native('return win.getBounds();');
  await ui("window.companion.setMode('canvas')"); const normal = await native('return win.getBounds();');
  await button('全屏展开'); await sleep(350);
  const fullscreen = await native('return { bounds:win.getBounds(), nativeFlag:win.isFullScreen(), display:E.screen.getDisplayMatching(win.getBounds()).bounds };'); assert.deepEqual(fullscreen.bounds, fullscreen.display); assert.equal(await ui('(window.companion.getDisplayState()).then(s=>s.fullscreen)'), true); check('fullscreen covers complete display including taskbar area', fullscreen);
  await button('退出全屏'); await sleep(300); assert.deepEqual(await native('return win.getBounds();'), normal); check('fullscreen button exit restores canvas bounds');
  await button('全屏展开'); await sleep(200); await native("win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); return true;"); await sleep(200); assert.equal(await native('return win.isFullScreen();'), false); assert.deepEqual(await native('return win.getBounds();'), normal); check('native Esc exits fullscreen and restores bounds');
  await ui("window.companion.setMode('idle')"); assert.deepEqual(await native('return win.getBounds();'), pet); check('collapse restores separate pet anchor');
  await ui("window.companion.setMode('canvas')"); assert.equal(report.fixture.requests, before); assert((await text()).includes('受控服务已收到')); check('position changes preserve replies and do not resend');
  await send('受控测试 STOP'); await until(() => ui("document.querySelector('.agent-answer') && document.body.innerText.includes('正在输出受控测试文字')"), 'streamed text');
  await button('停止回复'); const stopped = await text(); await sleep(1900); assert.equal(await text(), stopped); assert(!stopped.includes('迟到文字不应出现-LATE')); check('stop isolates late data');
  assert.equal(await ui("document.querySelector('.character-study, .character-unavailable')?.dataset.animationState"), 'idle'); check('stop immediately restores idle character');
  await send('受控测试 HTTP401'); await idle(); assert((await text()).includes('401')); check('authentication failure ends');
  await send('受控测试 BADFORMAT'); await idle(); assert(await ui("!!document.querySelector('.agent-error')")); check('invalid response ends');
  await send('受控测试 DISCONNECT'); await idle(); check('network interruption ends');
  await send('受控测试 SUSPEND'); await native("E.powerMonitor.emit('suspend'); return true;"); await idle(); await native("E.powerMonitor.emit('resume'); return true;"); check('controlled suspend cancels without replay');
  await send('受控测试 CLOSE'); await native('win.close(); return true;'); await idle(); assert.equal(await native('return win.isVisible();'), false); await ui("window.companion.setMode('canvas')"); check('close cancels and tray-style reopen retains session');
  await send('受控测试 LONG');
  await until(() => ui("document.querySelector('.agent-messages').scrollHeight > document.querySelector('.agent-messages').clientHeight + 200"), 'long content');
  await ui("document.querySelector('.agent-messages').scrollTop = 0; document.querySelector('.agent-messages').dispatchEvent(new Event('scroll'));"); await sleep(500);
  const reading = await ui("document.querySelector('.agent-messages').scrollTop"); assert(reading < 30); await idle(); check('long stream respects reading position', reading);
  assert(await ui("!!document.querySelector('.agent-answer pre code')"));
  const copyButtons = await ui("[...document.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.includes('复制')).length"); assert(copyButtons > 0); check('code blocks and copy controls', copyButtons);
  await native('win.show(); win.focus(); win.webContents.focus(); return true;');
  await button('复制代码'); await sleep(150); assert.equal((await native("return E.clipboard.readText();")).replace(/\r\n/g, '\n') === 'const companion = "伴屏";\nconsole.log(companion);', true, 'Code copy did not write the expected fixture text'); check('code copy writes exact text to native clipboard');
  const invalid = await ui('window.companion.setCanvasDisplay(-987654321).then(()=>false,()=>true)'); assert(invalid); check('unknown display rejected');
  const configFile = JSON.parse(await fs.readFile(path.join(profile, 'model-config.json'), 'utf8')); assert(!('allowScreen' in configFile)); assert(!('apiKey' in configFile)); check('config excludes screen grant and plaintext secret');
  const localStorageLength = await ui('localStorage.length'); assert.equal(localStorageLength, 0); check('conversation and screen not stored in localStorage');
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.code === 'ERR_ASSERTION' ? `Assertion failed; desktop and clipboard values omitted.\n${String(error.stack).split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4).join('\n')}` : error.stack; console.error(report.error);
  process.exitCode = 1;
} finally {
  if (background && main) await main.evaluate('globalThis.__bpValidationBackground?.destroy()').catch(() => {});
  await fs.mkdir(path.join(root, 'outputs/validation'), { recursive: true });
  const destination = path.join(root, 'outputs/validation', `v02-${tag}.json`);
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(`[desktop:validate] report ${destination}`);
  if (main && renderer && keepOpen && report.status === 'passed') {
    // Remove the fixture endpoint and runtime screen grant before manual UI QA.
    if (!reviewOnly) {
      await ui("window.companion.saveModelConfig({baseUrl:'http://127.0.0.1:9/v1',modelId:'manual-desktop-check',persistKey:false,allowScreen:false})").catch(() => {});
      await ui("window.companion.setMode('idle')").catch(() => {});
    }
    console.log('[desktop:validate] UI review ready; quit the app to finish.');
    await new Promise((resolve) => child.once('exit', resolve));
  } else if (main) {
    await main.evaluate("process.mainModule.require('electron').app.quit()").catch(() => {});
  } else child?.kill();
  renderer?.close(); main?.close();
  for (const socket of sockets) socket.destroy();
  fixture.close();
}
