// Local UI integration fixture. Never used by the application or portable build.
import http from 'node:http';
const stats = { requests: 0, toolRequested: false, imageReceived: false, pngValid: false };
const server = http.createServer(async (request, response) => {
  if (request.url === '/stats') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(stats)); return; }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404); response.end(); return; }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) { length += chunk.length; if (length > 32 * 1024 * 1024) { response.writeHead(413); response.end(); return; } chunks.push(chunk); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { response.writeHead(400); response.end(); return; }
  stats.requests += 1;
  const image = body.messages?.flatMap((message) => Array.isArray(message.content) ? message.content : []).find((part) => part.type === 'image_url');
  if (image) {
    stats.imageReceived = true;
    const bytes = Buffer.from(image.image_url.url.replace(/^data:image\/png;base64,/, ''), 'base64');
    stats.pngValid = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  const frame = (delta, finish_reason = null) => { if (!response.destroyed) response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\n\n`); };
  if (!image) {
    stats.toolRequested = true;
    setTimeout(() => frame({ tool_calls: [{ index: 0, id: 'fixture-call', type: 'function', function: { name: 'capture_screen', arguments: '{}' } }] }), 3500);
    setTimeout(() => { frame({}, 'tool_calls'); response.end('data: [DONE]\n\n'); }, 3800);
  } else {
    const parts = ['本地集成测试：', '已收到本次画面。\n\n', '**连接与工具调用流程正常。**\n\n', '这段文字由受控测试服务返回，', '没有调用真实模型，也不代表画面分析结果。'];
    parts.forEach((content, index) => setTimeout(() => frame({ content }), 700 + index * 450));
    setTimeout(() => { frame({}, 'stop'); response.end('data: [DONE]\n\n'); }, 3800);
  }
});
server.listen(18783, '127.0.0.1', () => process.stdout.write('Local UI fixture ready on 127.0.0.1:18783\n'));
process.on('SIGINT', () => server.close(() => process.exit(0)));
