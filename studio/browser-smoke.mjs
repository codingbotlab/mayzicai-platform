import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appPort = 52000 + Math.floor(Math.random() * 7000);
const devtoolsPort = 10000 + Math.floor(Math.random() * 10000);
const dataDir = path.join(root, '.browser-data-' + process.pid);
const profileDir = 'C:\\Temp\\mayzicai-e2e-' + process.pid;
const mockText = 'Namaste from browser test';
let receivedRequest = null;
let mock = null;
let app = null;
let chrome = null;
let ws = null;
try {
  mock = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    receivedRequest = { authorization: req.headers.authorization, body: JSON.parse(raw || '{}') };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: mockText }] }] }));
  });
  await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(0, '127.0.0.1', resolve); });
  const mockPort = mock.address().port;
  app = spawn(process.execPath, [path.join(root, 'server.mjs')], {
    env: {
      ...process.env,
      MAYZICAI_PORT: String(appPort),
      MAYZICAI_DATA_DIR: dataDir,
      MAYZICAI_OPENAI_API_KEY: 'browser-test-only-key',
      OPENAI_API_KEY: '',
      NODE_ENV: 'test',
      MAYZICAI_TEST_OPENAI_URL: 'http://127.0.0.1:' + mockPort + '/v1/responses'
    },
    stdio: 'ignore'
  });
  const base = 'http://127.0.0.1:' + appPort;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) { ready = true; break; } } catch {}
    await wait(100);
  }
  assert.ok(ready, 'local app server should start');
  chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + devtoolsPort, '--remote-allow-origins=*',
    '--user-data-dir=' + profileDir, base + '/'
  ], { stdio: 'ignore', windowsHide: true });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:' + devtoolsPort + '/json'); if (r.ok) { targets = await r.json(); break; } } catch {}
    await wait(150);
  }
  assert.ok(targets, 'Chrome DevTools should start');
  const tab = targets.find(t => t.type === 'page' && t.url.includes(base));
  assert.ok(tab, 'MayzicAI browser tab should exist');
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? item.reject(new Error(msg.error.message)) : item.resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id; pending.set(next, { resolve, reject });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser script failed');
    return result.result.value;
  };
  await send('Page.enable');
  const preflight = await evaluate("({url:location.href,title:document.title,language:!!document.querySelector('#language-select'),chatInput:!!document.querySelector('#chat-input'),chatForm:!!document.querySelector('#chat-form')})");
  assert.ok(preflight.language && preflight.chatInput && preflight.chatForm, 'Chat controls missing: ' + JSON.stringify(preflight));
  const result = await evaluate(`(async () => {
    document.querySelector('#language-select').value = 'hi';
    document.querySelector('#language-select').dispatchEvent(new Event('change', { bubbles: true }));
    for (let j = 0; j < 30 && document.documentElement.lang !== 'hi'; j++) await new Promise(resolve => setTimeout(resolve, 50));
    document.querySelector('[data-goto="chat"]').click();
    document.querySelector('#chat-input').value = 'नमस्ते';
    document.querySelector('#chat-form').requestSubmit();
    for (let i = 0; i < 80; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const response = document.querySelector('#chat-log .chat-bubble.assistant div')?.textContent || '';
      if (response === ${JSON.stringify(mockText)} || response.includes('provider') || response.includes('Failed')) break;
    }
    const chat = {
      lang: document.documentElement.lang,
      heading: document.querySelector('#chat h1').textContent,
      bubbles: document.querySelectorAll('#chat-log .chat-bubble').length,
      response: document.querySelector('#chat-log .chat-bubble.assistant div')?.textContent,
      status: document.querySelector('#chat-status').textContent,
      inputEnabled: !document.querySelector('#chat-input').disabled,
      otherFormsPreserved: !!document.querySelector('#usage-form') && !!document.querySelector('#task-form')
    };
    document.querySelector('[data-page="wheel"]').click();
    await new Promise(resolve => setTimeout(resolve, 150));
    document.querySelector('#wheel-start').click();
    await new Promise(resolve => setTimeout(resolve, 1200));
    document.querySelector('#wheel-refresh').click();
    await new Promise(resolve => setTimeout(resolve, 180));
    const wheel = {
      heading: document.querySelector('#wheel h1').textContent,
      statusWhileRunning: document.querySelector('#wheel-enabled').textContent,
      cycles: Number(document.querySelector('#wheel-cycles').textContent.replaceAll(',', '')),
      agents: Number(document.querySelector('#wheel-agents').textContent.replaceAll(',', '')),
      proposalCount: document.querySelectorAll('#wheel-history .item').length,
      guardrail: document.querySelector('#wheel-message').textContent
    };
    document.querySelector('#wheel-stop').click();
    await new Promise(resolve => setTimeout(resolve, 180));
    wheel.statusAfterStop = document.querySelector('#wheel-enabled').textContent;
    return { ...chat, wheel };
  })()`);
  assert.equal(result.lang, 'hi');
  assert.equal(result.heading, 'MayzicAI चैट');
  assert.equal(result.bubbles, 2);
  assert.equal(result.response, mockText);
  assert.match(result.status, /gpt-5\.6-terra/);
  assert.equal(result.inputEnabled, true);
  assert.equal(result.otherFormsPreserved, true);
  assert.equal(result.wheel.heading, 'ऑटो डेवलपमेंट व्हील');
  assert.equal(result.wheel.statusWhileRunning, 'चालू');
  assert.ok(result.wheel.cycles >= 1, 'the 1-second development wheel should create at least one proposal');
  assert.equal(result.wheel.agents, 500000);
  assert.ok(result.wheel.proposalCount >= 1);
  assert.equal(result.wheel.statusAfterStop, 'बंद');
  assert.match(result.wheel.guardrail, /Each tick creates one proposal only/);
  assert.equal(receivedRequest.authorization, 'Bearer browser-test-only-key');
  assert.equal(receivedRequest.body.input[0].content, 'नमस्ते');
  console.log(JSON.stringify({ ...result, mockProviderReceivedHindi: true, usedOnlyDummyTestKey: true }, null, 2));
} finally {
  try { ws?.close(); } catch {}
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { chrome?.kill(); } catch {}
  try { app?.kill(); } catch {}
  if (mock) await new Promise(resolve => mock.close(resolve));
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
