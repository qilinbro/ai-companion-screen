// Controlled, in-memory provider fixtures. No external model, credentials,
// listening server, or real screen data are used by this test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentRuntime, readChatCompletion } = require('../dist-electron/agent-runtime.js');

const CONFIG = { baseUrl: 'http://127.0.0.1:11434/v1', modelId: 'fixture-model', apiKey: '', allowScreen: true };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxl8AAAAASUVORK5CYII=';
const captureResult = (requestId) => ({ requestId, dataUrl: `data:image/png;base64,${PNG}`, mimeType: 'image/png', width: 1, height: 1, displayLabel: 'fixture display', capturedAt: '2026-10-20T10:00:00.000Z' });
const event = (delta, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\r\n\r\n`;
function streamResponse(source, fragment = true) {
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({ start(controller) {
    if (fragment) for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.subarray(offset, offset + 3));
    else controller.enqueue(bytes);
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
}
const answer = (text = '这是实际返回的文字。') => streamResponse(event({ content: text.slice(0, 4) }) + event({ content: text.slice(4) }) + event({}, 'stop') + 'data: [DONE]\r\n\r\n');
const tools = (name = 'capture_screen', args = '{}') => streamResponse(event({ tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: name.slice(0, 4), arguments: args.slice(0, 1) } }] }) + event({ tool_calls: [{ index: 0, function: { name: name.slice(4), arguments: args.slice(1) } }] }) + event({}, 'tool_calls') + 'data: [DONE]\r\n\r\n');
function harness(overrides = {}) {
  const events = [];
  const requests = [];
  let captures = 0;
  let configuration = { ...CONFIG };
  const options = {
    getConfig: () => configuration,
    capture: async (id) => { captures += 1; return captureResult(id); },
    cancelCapture: () => undefined,
    emit: (value) => events.push(value),
    fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return answer(); },
    ...overrides,
  };
  const runtime = new AgentRuntime(options);
  return { runtime, events, requests, captures: () => captures, configure: (value) => { configuration = value; }, async run(prompt, id = 'request_fixture', conversationId) {
    runtime.start({ requestId: id, prompt, ...(conversationId ? { conversationId } : {}) });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const terminal = events.find((value) => value.requestId === id && (value.type === 'done' || value.type === 'error'));
      if (terminal) return terminal;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('Fixture did not terminate');
  } };
}

test('SSE reconstructs split UTF-8, CRLF, multiline frames and fragmented function calls', async () => {
  const parts = [];
  const response = streamResponse(': comment\r\n\r\ndata: {"choices": [\r\ndata: {"index":0,"delta":{"content":"你好，世界。"},"finish_reason":null}]}\r\n\r\n' + event({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'capture_', arguments: '{' } }] }) + event({ tool_calls: [{ index: 0, function: { name: 'screen', arguments: '}' } }] }) + event({}, 'tool_calls') + 'data: [DONE]\r\n\r\n');
  const result = await readChatCompletion(response, new AbortController().signal, (text) => parts.push(text));
  assert.equal(parts.join(''), '你好，世界。');
  assert.equal(result.calls[0].function.name, 'capture_screen');
  assert.equal(result.calls[0].function.arguments, '{}');
});

test('text-only response streams without any screen read', async () => {
  const h = harness();
  assert.equal((await h.run('写一句问候')).finishReason, 'completed');
  assert.equal(h.captures(), 0);
  assert.equal(h.events.filter((e) => e.type === 'delta').map((e) => e.delta).join(''), '这是实际返回的文字。');
  assert.ok(h.requests[0].tools.length === 1 && h.requests[0].tools[0].function.name === 'capture_screen');
});

test('model chooses capture; real injected handler result is passed as metadata plus image input', async () => {
  const requests = [];
  let count = 0;
  const h = harness({ fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return count++ === 0 ? tools() : answer('根据刚刚的图片回答。'); } });
  assert.equal((await h.run('当前页面是什么意思')).finishReason, 'completed');
  assert.equal(h.captures(), 1);
  assert.equal(h.events.filter((e) => e.type === 'capture').length, 1);
  const afterCapture = h.events.slice(h.events.findIndex((e) => e.type === 'capture') + 1);
  assert.equal(afterCapture.find((e) => e.type === 'status').status, 'viewing');
  assert.equal(afterCapture.find((e) => e.type === 'delta')?.type, 'delta');
  const tool = requests[1].messages.find((m) => m.role === 'tool');
  assert.equal(JSON.parse(tool.content).width, 1);
  assert.ok(!tool.content.includes(PNG));
  assert.equal(requests[1].messages.at(-1).content[1].image_url.url, `data:image/png;base64,${PNG}`);
});

for (const [label, permission, prompt, name, args, expected] of [
  ['no screen consent', false, '看当前页面', 'capture_screen', '{}', 'screen_not_allowed'],
  ['explicit screen denial', true, '不用截图，帮我写一句问候', 'capture_screen', '{}', 'screen_not_allowed'],
  ['screen not needed', true, '不需要截图，只解释 EADDRINUSE', 'capture_screen', '{}', 'screen_not_allowed'],
  ['direct do-not-capture', true, '别截图，只解释这个报错', 'capture_screen', '{}', 'screen_not_allowed'],
  ['do-not-perform-capture', true, '不要做截图，解释 EADDRINUSE', 'capture_screen', '{}', 'screen_not_allowed'],
  ['deferred desktop capture denied', true, '先别截取桌面，先告诉我错误的意思', 'capture_screen', '{}', 'screen_not_allowed'],
  ['polite screen denial', true, '不需要你帮我查看当前屏幕，只回答文字', 'capture_screen', '{}', 'screen_not_allowed'],
  ['English screen denial', true, 'Please do not capture my desktop. Explain EADDRINUSE.', 'capture_screen', '{}', 'screen_not_allowed'],
  ['unsupported tool', true, '看看当前页面', 'run_shell', '{}', 'unsupported_tool'],
  ['unexpected tool arguments', true, '看看当前页面', 'capture_screen', '{"command":"anything"}', 'invalid_arguments'],
]) test(`${label} returns a restricted tool error without capture or image upload`, async () => {
  const requests = [];
  let count = 0;
  const h = harness({ getConfig: () => ({ ...CONFIG, allowScreen: permission }), fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return count++ === 0 ? tools(name, args) : answer('没有截图。'); } });
  await h.run(prompt);
  assert.equal(h.captures(), 0);
  assert.equal(JSON.parse(requests[1].messages.find((m) => m.role === 'tool').content).error, expected);
  assert.ok(!JSON.stringify(requests).includes('image_url'));
  assert.ok(!h.events.some((e) => e.type === 'status' && e.status === 'viewing'));
});

test('cancellation suppresses late chunks and allows a new request', async () => {
  let sequence = 0;
  const h = harness({ fetch: async () => {
    if (sequence++ > 0) return answer('新任务。');
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(event({ content: '尚未完成' })));
      setTimeout(() => { try { controller.enqueue(new TextEncoder().encode(event({ content: '迟到数据' }) + event({}, 'stop'))); controller.close(); } catch {} }, 30);
    } }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  h.runtime.start({ requestId: 'old', prompt: '旧任务', conversationId: 'same' });
  await new Promise((resolve) => setTimeout(resolve, 4));
  h.runtime.cancel('old');
  assert.equal((await h.run('新任务', 'new', 'same')).finishReason, 'completed');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.events.filter((e) => e.requestId === 'old' && e.type === 'done').length, 1);
  assert.equal(h.events.find((e) => e.requestId === 'old' && e.type === 'done').finishReason, 'cancelled');
  assert.ok(!h.events.some((e) => e.type === 'delta' && e.delta.includes('迟到')));
});

test('a remote endpoint without project credentials is rejected before fetch', async () => {
  let fetched = false;
  const h = harness({ getConfig: () => ({ ...CONFIG, baseUrl: 'https://example.test/v1' }), fetch: async () => { fetched = true; return answer(); } });
  assert.equal((await h.run('你好')).code, 'not_configured');
  assert.equal(fetched, false);
});

test('provider errors never expose server body or credentials', async () => {
  const h = harness({ fetch: async () => new Response('SECRET_PROVIDER_BODY', { status: 401 }) });
  const result = await h.run('你好');
  assert.equal(result.code, 'provider_error');
  assert.ok(!JSON.stringify(h.events).includes('SECRET_PROVIDER_BODY'));
});

test('truncated SSE fails rather than claiming a completed answer', async () => {
  const h = harness({ fetch: async () => streamResponse(event({ content: '半句' })) });
  assert.equal((await h.run('你好')).code, 'incomplete_response');
  assert.equal(h.events.filter((e) => e.type === 'done').length, 0);
});

test('three provider rounds cap repeated model tool calls', async () => {
  let count = 0;
  const h = harness({ fetch: async () => { count += 1; return tools(); } });
  assert.equal((await h.run('继续查看')).code, 'tool_limit');
  assert.equal(count, 3);
  assert.equal(h.captures(), 2);
});

test('deadline aborts a stalled stream with exactly one terminal event', async () => {
  const h = harness({ timeoutMs: 10, fetch: async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/event-stream' } }) });
  assert.equal((await h.run('你好')).code, 'timeout');
  assert.equal(h.events.filter((e) => e.type === 'done' || e.type === 'error').length, 1);
});

test('multi-turn context is text only, bounded, and cleared across provider/model changes', async () => {
  const h = harness();
  for (let index = 0; index < 8; index += 1) await h.run(`问题${index}`, `turn_${index}`, 'conversation');
  const history = h.requests.at(-1).messages;
  assert.ok(history.length <= 14);
  assert.ok(history.every((message) => typeof message.content === 'string'));
  assert.ok(history.some((message) => message.role === 'assistant'));
  h.configure({ ...CONFIG, modelId: 'different-model' });
  await h.run('新的模型', 'different', 'conversation');
  assert.equal(h.requests.at(-1).messages.length, 2);
});

test('a completed screen turn never replays image or tool messages in the next turn', async () => {
  const requests = [];
  let sequence = 0;
  const h = harness({ fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return sequence++ === 0 ? tools() : answer('完成这轮回答。'); } });
  await h.run('看看当前页面', 'screen_turn', 'same_conversation');
  await h.run('继续解释刚才的文字', 'text_turn', 'same_conversation');
  assert.equal(h.captures(), 1);
  assert.ok(!JSON.stringify(requests.at(-1).messages).includes(PNG));
  assert.ok(requests.at(-1).messages.every((message) => typeof message.content === 'string' && message.role !== 'tool' && !message.tool_calls));
});

test('stopping during capture cancels the screenshot and commits no assistant history', async () => {
  let cancelledCapture = '';
  let screenshotStarted = false;
  let sequence = 0;
  const requests = [];
  const h = harness({
    fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return sequence++ === 0 ? tools() : answer('新的回答。'); },
    capture: async () => { screenshotStarted = true; return new Promise(() => undefined); },
    cancelCapture: (id) => { cancelledCapture = id; },
  });
  h.runtime.start({ requestId: 'stopped_screen', prompt: '看当前页面', conversationId: 'same_conversation' });
  for (let attempt = 0; attempt < 50 && !screenshotStarted; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(screenshotStarted);
  h.runtime.cancel('stopped_screen');
  await h.run('新问题', 'after_stop', 'same_conversation');
  assert.ok(cancelledCapture.startsWith('stopped_screen'));
  assert.equal(requests.at(-1).messages.length, 2);
});

test('JSON-compatible fallback returns actual provider text', async () => {
  const h = harness({ fetch: async () => new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'JSON 回答' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await h.run('你好')).finishReason, 'completed');
  assert.equal(h.events.filter((e) => e.type === 'delta').map((e) => e.delta).join(''), 'JSON 回答');
});
