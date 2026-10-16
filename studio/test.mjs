import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { normalizeLocale, translate, missingTranslations } from './i18n.mjs';
import { createAutoWheel, WHEEL_AGENT_COUNT, WHEEL_TARGET_YEARS, WHEEL_TARGET_SECONDS } from './auto-wheel.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = 8877 + Math.floor(Math.random() * 1000);
const dataDir = path.join(root, '.test-data-' + port);
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], { env: { ...process.env, MAYZICAI_PORT: String(port), MAYZICAI_DATA_DIR: dataDir, MAYZICAI_OPENAI_API_KEY: '', MAYZICAI_DEV_AGENT_ENABLED: 'false', MAYZICAI_ALLOW_CLOUD_FALLBACK: 'false', OPENAI_API_KEY: '', MAYZICAI_TEST_OPENAI_URL: '' }, stdio: 'ignore' });
const base = 'http://127.0.0.1:' + port;
let providerChild = null;
let mockProvider = null;
async function waitReady(targetBase = base) {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(targetBase + '/api/health'); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw Error('Server did not start: ' + targetBase);
}
try {
  fs.mkdirSync(dataDir, { recursive: true });
  await waitReady();
  let r = await fetch(base + '/api/health'); let d = await r.json(); assert.equal(d.ok, true); assert.equal(d.mode, 'local-only'); assert.equal(d.aiConfigured, false);

  const unitWheelFile = path.join(dataDir, 'unit-wheel.json');
  const unitWheel = createAutoWheel({ stateFile: unitWheelFile });
  assert.equal(WHEEL_AGENT_COUNT, 500000);
  assert.equal(WHEEL_TARGET_YEARS, 5000);
  assert.equal(WHEEL_TARGET_SECONDS, 157784760000);
  unitWheel.start();
  for (let i = 0; i < 63; i++) unitWheel.tickNow();
  d = unitWheel.status();
  assert.equal(d.cyclesCompleted, 63);
  assert.equal(d.recentSteps.length, 60, 'proposal history must remain bounded to 60 entries');
  assert.equal(d.lastStep.agentId, 'MWA-000063');
  assert.equal(d.mode, 'proposal-only');
  unitWheel.stop();
  const reloadedWheel = createAutoWheel({ stateFile: unitWheelFile });
  assert.equal(reloadedWheel.status().enabled, false);
  assert.equal(reloadedWheel.status().cyclesCompleted, 63, 'wheel cycle count should persist locally');

  r = await fetch(base + '/api/auto-wheel'); d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.logicalAgentCount, 500000); assert.equal(d.targetYears, 5000); assert.equal(d.enabled, false);
  r = await fetch(base + '/api/dev-agent'); d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.enabled, false); assert.equal(d.executionMode, 'proposal-only'); assert.equal(d.cloudFallbackAllowed, false);
  r = await fetch(base + '/api/dev-agent/workspace'); d = await r.json();
  assert.equal(r.status, 200); assert.ok(d.allowlistedFiles.includes('studio/auto-wheel.mjs')); assert.equal(d.maxFiles, 4);
  r = await fetch(base + '/api/dev-agent/patches'); d = await r.json(); assert.equal(r.status, 200); assert.ok(Array.isArray(d.patches));
  r = await fetch(base + '/api/dev-agent/cycle', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({task:'Review a focused unit test'}) });
  assert.equal(r.status, 403, 'dev agent must be disabled until explicitly opted in');
  r = await fetch(base + '/api/dev-agent/cycle', { method: 'POST', headers: {'content-type':'application/json','origin':'https://evil.example'}, body: JSON.stringify({task:'Review a focused unit test'}) });
  assert.equal(r.status, 403, 'cross-origin dev agent cycle requests must be rejected');
  r = await fetch(base + '/api/auto-wheel/start', { method: 'POST', headers: {'content-type':'application/json','origin':'https://evil.example'}, body: '{}' });
  assert.equal(r.status, 403, 'cross-origin wheel control requests must be rejected');
  r = await fetch(base + '/api/auto-wheel/start', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
  assert.equal(r.status, 200); d = await r.json(); assert.equal(d.enabled, true);
  await new Promise(resolve => setTimeout(resolve, 1200));
  r = await fetch(base + '/api/auto-wheel'); d = await r.json(); assert.ok(d.cyclesCompleted >= 1); assert.ok(d.lastStep); assert.equal(d.lastStep.action, 'proposal-only');
  r = await fetch(base + '/api/auto-wheel/stop', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
  assert.equal(r.status, 200); d = await r.json(); assert.equal(d.enabled, false);

  r = await fetch(base + '/api/chat', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({messages:[{role:'user',content:'hello'}]}) });
  assert.equal(r.status, 503, 'chat should clearly report missing provider configuration without an API key');
  d = await r.json(); assert.match(d.error, /not configured/i);
  r = await fetch(base + '/api/chat', { method: 'POST', headers: {'content-type':'application/json','origin':'https://evil.example'}, body: JSON.stringify({messages:[{role:'user',content:'hello'}]}) });
  assert.equal(r.status, 403, 'cross-origin browser chat requests should be rejected');

  // Exercise the successful provider path against a local mock; no real API key or network call.
  let mockRequest;
  mockProvider = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    mockRequest = { method: req.method, url: req.url, authorization: req.headers.authorization, body: JSON.parse(raw || '{}') };
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/api/chat') {
      const prompt = mockRequest.body.messages?.at(-1)?.content || '';
      const responseText = prompt.includes('Prepare a small proposed code change')
        ? [
            '--- a/studio/auto-wheel.mjs',
            '+++ b/studio/auto-wheel.mjs',
            '@@ -5,3 +5,3 @@',
            "-export const WHEEL_AGENT_COUNT = 500_000;",
            "+export const WHEEL_AGENT_COUNT = 500_000; // staged proposal only",
            ' export const WHEEL_TARGET_YEARS = 5_000;',
            ' export const WHEEL_INTERVAL_MS = 1_000;'
          ].join('\n') + '\n'
        : 'Goal: Add a safe test.\nTests: Run locally.';
      res.end(JSON.stringify({ message: { content: responseText } }));
    }
    else res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Namaste from test mock' }] }] }));
  });
  await new Promise((resolve, reject) => { mockProvider.once('error', reject); mockProvider.listen(0, '127.0.0.1', resolve); });
  const mockPort = mockProvider.address().port;
  const providerAppPort = port + 15000;
  const providerBase = 'http://127.0.0.1:' + providerAppPort;
  providerChild = spawn(process.execPath, [path.join(root, 'server.mjs')], {
    env: { ...process.env, NODE_ENV: 'test', MAYZICAI_PORT: String(providerAppPort), MAYZICAI_DATA_DIR: dataDir, MAYZICAI_OPENAI_API_KEY: 'test-only-key', MAYZICAI_ALLOW_CLOUD_FALLBACK: 'false', MAYZICAI_DEV_AGENT_ENABLED: 'true', MAYZICAI_OLLAMA_URL: 'http://127.0.0.1:' + mockPort + '/api/chat', MAYZICAI_OLLAMA_MODEL: 'mock-coder:1b', OPENAI_API_KEY: '', MAYZICAI_TEST_OPENAI_URL: 'http://127.0.0.1:' + mockPort + '/v1/responses' },
    stdio: 'ignore'
  });
  await waitReady(providerBase);
  const providerHealth = await (await fetch(providerBase + '/api/health')).json();
  assert.equal(providerHealth.aiConfigured, true, 'health should expose configuration status without revealing the key');
  r = await fetch(providerBase + '/api/chat', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({messages:[{role:'user',content:'नमस्ते'}]}) });
  assert.equal(r.status, 200, 'configured provider chat should return a successful response');
  d = await r.json();
  assert.equal(d.answer, 'Namaste from test mock');
  assert.equal(d.model, 'gpt-5.6-terra');
  assert.equal(mockRequest.method, 'POST');
  assert.equal(mockRequest.authorization, 'Bearer test-only-key');
  assert.equal(mockRequest.body.input[0].content, 'नमस्ते');
  assert.equal(mockRequest.body.max_output_tokens, 900);
  r = await fetch(providerBase + '/api/dev-agent/cycle', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({task:'Review Hindi localization coverage'}) });
  assert.equal(r.status, 200, 'configured local Dev Agent should return a proposal');
  const devResult = await r.json();
  assert.equal(devResult.provider, 'ollama'); assert.equal(devResult.fileChangesApplied, false); assert.equal(devResult.testsExecuted, false);
  assert.match(devResult.answer, /safe test/i); assert.equal(mockRequest.url, '/api/chat');

  const workspaceFile = path.join(root, 'auto-wheel.mjs');
  const workspaceBefore = fs.readFileSync(workspaceFile, 'utf8');
  r = await fetch(providerBase + '/api/dev-agent/prepare-patch', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({task:'Propose a small comment change',paths:['studio/auto-wheel.mjs']}) });
  assert.equal(r.status, 201, 'valid model diff should be staged for review');
  const patchResult = await r.json();
  assert.equal(patchResult.manifest.status, 'awaiting-human-review'); assert.equal(patchResult.manifest.applied, false); assert.equal(patchResult.manifest.testsExecuted, false);
  assert.ok(patchResult.diff.includes('@@ -5,3 +5,3 @@'));
  assert.equal(fs.readFileSync(workspaceFile, 'utf8'), workspaceBefore, 'API staging must not edit source files');
  r = await fetch(providerBase + '/api/dev-agent/patches/' + patchResult.manifest.id + '/verify', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
  const verifyPayload = await r.json();
  assert.equal(r.status, 200, 'valid mock patch should pass the fixed isolated verification gate: ' + JSON.stringify(verifyPayload.report?.gates?.filter(g => !g.ok)));
  assert.equal(verifyPayload.report.status, 'passed'); assert.equal(verifyPayload.report.applied, false); assert.equal(verifyPayload.report.liveSourceChanged, false);
  assert.ok(verifyPayload.report.gates.length >= 6); assert.ok(verifyPayload.report.gates.every(g => g.ok), 'every fixed verification gate must pass');
  assert.equal(fs.readFileSync(workspaceFile, 'utf8'), workspaceBefore, 'verification must not edit live source files');
  r = await fetch(providerBase + '/api/dev-agent/patches/' + patchResult.manifest.id);
  assert.equal(r.status, 200); const retrievedPatch = await r.json(); assert.equal(retrievedPatch.diff, patchResult.diff);
  assert.equal(retrievedPatch.manifest.status, 'verified-awaiting-review'); assert.equal(retrievedPatch.manifest.applied, false); assert.equal(retrievedPatch.verification.status, 'passed');
  r = await fetch(providerBase + '/api/dev-agent/prepare-patch', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({task:'Unsafe target',paths:['../README.md']}) });
  assert.equal(r.status, 400, 'workspace traversal paths must be rejected before model invocation');

  const id = 'test-' + crypto.randomUUID();
  r = await fetch(base + '/api/usage', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({requestId:id,quantity:2,estimatedCostMinor:125,serviceCode:'test-suite'}) });
  assert.equal(r.status, 201); d = await r.json(); assert.equal(d.event.quantity, 2);
  r = await fetch(base + '/api/usage', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({requestId:id,quantity:2,estimatedCostMinor:125}) });
  assert.equal((await r.json()).duplicate, true, 'duplicate request id should be idempotent');
  r = await fetch(base + '/api/usage', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({quantity:0}) });
  assert.equal(r.status, 400, 'zero quantity must be rejected');
  r = await fetch(base + '/api/usage', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({quantity:1,estimatedCostMinor:-1}) });
  assert.equal(r.status, 400, 'negative cost must be rejected');
  r = await fetch(base + '/api/tasks', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({title:'test plan'}) });
  assert.equal(r.status, 201); d = await r.json(); assert.equal(d.task.status, 'planned');
  r = await fetch(base + '/'); assert.equal(r.status, 200); const html = await r.text(); assert.match(html, /MayzicAI Studio/); assert.match(html, /language-select/);
  r = await fetch(base + '/locales/en.json'); assert.equal(r.status, 200); const en = await r.json(); assert.equal(en['language.name'], 'English');
  r = await fetch(base + '/locales/hi.json'); assert.equal(r.status, 200); const hi = await r.json(); assert.equal(hi['language.name'], 'हिन्दी');
  assert.deepEqual(missingTranslations(), [], 'Hindi catalog should contain every English message key');
  assert.equal(normalizeLocale('hi-IN'), 'hi'); assert.equal(normalizeLocale('EN_us'), 'en'); assert.equal(normalizeLocale('fr-FR'), 'en');
  assert.equal(translate('nav.overview', 'hi'), '◈ अवलोकन'); assert.equal(translate('not.a.key', 'hi'), 'not.a.key');
  assert.ok(html.includes('id="usage-form"') && html.includes('name="quantity"'), 'usage form and quantity input should exist');
  assert.ok(html.includes('id="task-form"') && html.includes('name="title"'), 'task form and title input should exist');
  assert.ok(html.includes('id="search-form"') && html.includes('id="search-type"'), 'search form and category selector should exist');
  assert.ok(html.includes('id="chat-form"') && html.includes("api('/api/chat'"), 'chat form should call the local provider endpoint');
  assert.ok(html.includes('id="wheel"') && html.includes('id="wheel-start"') && html.includes('500,000 lightweight logical agent IDs'), 'auto development wheel UI should describe bounded virtual agents');
  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.indexOf('</script>', scriptStart);
  assert.ok(scriptStart >= '<script>'.length && scriptEnd > scriptStart, 'inline browser script should exist');
  assert.doesNotThrow(() => new Function(html.slice(scriptStart, scriptEnd)), 'inline browser JavaScript should parse');
  assert.ok(!html.includes("'#search-form label:first-child'") && !html.includes("'#search-form label:nth-child(2)'"), 'translation mappings must not replace labels that contain inputs');
  assert.ok(html.includes("localStorage.setItem('mayzicai-language',lang)"), 'language preference should persist locally');
  console.log('PASS: health, auto-wheel timing/limits/persistence/start/stop and cross-origin guard, usage validation/idempotency, task planning, missing-key behavior, successful mock-provider request/response, JavaScript syntax, and English/Hindi locale/forms.');
} finally {
  child.kill();
  if (providerChild) providerChild.kill();
  if (mockProvider) await new Promise(resolve => mockProvider.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
