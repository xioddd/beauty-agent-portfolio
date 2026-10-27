import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let child, mock, base, upstreamRequest;
const request = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

before(async () => {
  mock = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    upstreamRequest = { url: req.url, body: JSON.parse(raw), authorized: req.headers.authorization === 'Bearer test-only-token' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: conversation.message.delta\ndata: {"type":"answer","content":"测试回答"}\n\n');
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port),
    COZE_PAT: 'test-only-token', COZE_BOT_ID: 'test-bot',
    COZE_API_BASE: `http://127.0.0.1:${mock.address().port}`,
    ALLOWED_ORIGINS: 'https://xioddd.github.io', CHAT_LIMIT_PER_HOUR: '1',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('API did not start');
});
after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  if (mock) await new Promise(resolve => mock.close(resolve));
});

test('health is public and does not disclose the token', async () => {
  const response = await fetch(base + '/api/health');
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.cozeConfigured, true);
  assert.ok(data.knowledgeBaseAssets > 0);
  assert.ok(!JSON.stringify(data).includes('test-only-token'));
});
test('Pages origin supports preflight; unrelated browser origins are rejected', async () => {
  const allowed = await fetch(base + '/api/chat/stream', { method: 'OPTIONS', headers: { Origin: 'https://xioddd.github.io' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://xioddd.github.io');
  const denied = await request('/api/image-knowledge/search', {}, { Origin: 'https://unrelated.example' });
  assert.equal(denied.status, 403);
});
test('image search retains source metadata and serves actual image bytes', async () => {
  const response = await request('/api/image-knowledge/search', { query: '红宝石面霜图片' });
  const data = await response.json();
  assert.equal(data.retrieval, 'curated_metadata');
  assert.ok(data.hits.length > 0);
  assert.ok(data.hits.every(hit => hit.product.includes('红宝石面霜') && hit.sourceUrl));
  const image = await fetch(base + data.hits[0].previewUrl);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /^image\//);
  assert.ok((await image.arrayBuffer()).byteLength > 1000);
  const missing = await fetch(base + '/api/image-knowledge/files/unknown');
  assert.equal(missing.status, 404);
});
test('invalid JSON, scalar JSON and oversized bodies are rejected', async () => {
  for (const body of ['{invalid', 'null', '[]']) {
    const response = await fetch(base + '/api/image-knowledge/search', { method: 'POST', body });
    assert.equal(response.status, 400);
  }
  assert.equal((await request('/api/image-knowledge/search', { query: 'x'.repeat(66000) })).status, 413);
});
test('rule demo returns editable content, while casual chat returns no cards', async () => {
  const content = await (await request('/api/brief/generate', { prompt: '生成小红书标题与正文' })).json();
  assert.equal(content.engine, 'local_demo_rules');
  assert.ok(content.cards.some(card => card.id === 'copy' && card.body));
  const chat = await (await request('/api/brief/generate', { prompt: '你好，今天怎么样' })).json();
  assert.equal(chat.scenario, 'chat');
  assert.deepEqual(chat.cards, []);
});
test('Coze proxy streams responses, forwards conversation IDs and caps demo usage', async () => {
  const response = await request('/api/chat/stream', { prompt: '测试', conversationId: 'test-conversation', userId: 'test-user' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.match(await response.text(), /测试回答/);
  assert.equal(upstreamRequest.authorized, true);
  assert.equal(upstreamRequest.body.bot_id, 'test-bot');
  assert.equal(upstreamRequest.body.user_id, 'test-user');
  assert.match(upstreamRequest.url, /conversation_id=test-conversation/);
  assert.equal((await request('/api/chat/stream', { prompt: '超过限额' })).status, 429);
});
