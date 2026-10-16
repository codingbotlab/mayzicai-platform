import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAutoWheel } from './auto-wheel.mjs';
import { createDevAgentEngine } from './dev-agent-engine.mjs';
import { createPatchStager, readWorkspaceContext, DEV_WORKSPACE_ALLOWLIST } from './dev-workspace.mjs';
import { verifyStagedPatch } from './sandbox-verifier.mjs';
import { applyVerifiedPatch } from './patch-applier.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(ROOT, '..');
const DATA_DIR = process.env.MAYZICAI_DATA_DIR ? path.resolve(process.env.MAYZICAI_DATA_DIR) : path.join(WORKSPACE, 'meter', 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.jsonl');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.jsonl');
const HOST = '127.0.0.1';
const PORT = Number(process.env.MAYZICAI_PORT || 8787);
fs.mkdirSync(DATA_DIR, { recursive: true });
const autoWheel = createAutoWheel({ stateFile: path.join(DATA_DIR, 'auto-wheel.json') });
const devAgent = createDevAgentEngine({ stateFile: path.join(DATA_DIR, 'dev-agent-state.json') });
const patchStager = createPatchStager({ workspaceRoot: WORKSPACE, dataDir: DATA_DIR });

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}
function appendJsonl(file, item) { fs.appendFileSync(file, JSON.stringify(item) + '\n', { encoding: 'utf8', mode: 0o600 }); }
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Request body too large (16 KB limit).');
  }
  return raw ? JSON.parse(raw) : {};
}
const app = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'MayzicAI Studio', mode: 'local-only', aiConfigured: Boolean(process.env.MAYZICAI_OPENAI_API_KEY), autoWheelEnabled: autoWheel.status().enabled, host: HOST, time: new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/api/auto-wheel') return send(res, 200, { ok: true, ...autoWheel.status() });
    if (req.method === 'GET' && url.pathname === '/api/dev-agent') return send(res, 200, { ok: true, ...devAgent.status() });
    if (req.method === 'GET' && url.pathname === '/api/dev-agent/workspace') return send(res, 200, { ok: true, maxFiles: 4, allowlistedFiles: DEV_WORKSPACE_ALLOWLIST, maxFileBytes: 20000, maxContextBytes: 36000 });
    if (req.method === 'GET' && url.pathname === '/api/dev-agent/patches') return send(res, 200, { ok: true, patches: patchStager.list() });
    const patchVerifyMatch = url.pathname.match(/^\/api\/dev-agent\/patches\/([0-9a-f-]{36})\/verify$/i);
    if (req.method === 'POST' && patchVerifyMatch) {
      const origin = req.headers.origin;
      if (origin) {
        let parsedOrigin;
        try { parsedOrigin = new URL(origin); } catch { return send(res, 403, { error: 'Origin not allowed.' }); }
        if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== HOST || parsedOrigin.port !== String(PORT)) return send(res, 403, { error: 'Origin not allowed.' });
      }
      let report;
      try { report = await verifyStagedPatch({ workspaceRoot: WORKSPACE, patchStager, patchId: patchVerifyMatch[1] }); }
      catch (error) { return send(res, 409, { ok: false, error: error instanceof Error ? error.message : 'Patch verification could not start.' }); }
      let appliedManifest = null;
      if (report.status === 'passed' && process.env.MAYZICAI_AUTO_APPLY_VERIFIED_PATCHES === 'true') {
        try { appliedManifest = applyVerifiedPatch({ workspaceRoot: WORKSPACE, patchStager, patchId: patchVerifyMatch[1] }); }
        catch (error) { return send(res, 409, { ok: false, report, applied: false, error: error instanceof Error ? error.message : 'Verified patch was not applied.' }); }
      }
      return send(res, report.status === 'passed' ? 200 : 422, {
        ok: report.status === 'passed', report, applied: Boolean(appliedManifest), manifest: appliedManifest,
        notice: appliedManifest ? 'Patch passed isolated verification and was applied to the local working tree. No commit, push, or deployment was performed.' : 'Verification ran in a disposable snapshot. The live working tree was not changed.'
      });
    }
    const patchIdMatch = url.pathname.match(/^\/api\/dev-agent\/patches\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && patchIdMatch) {
      try { return send(res, 200, { ok: true, ...patchStager.get(patchIdMatch[1]) }); }
      catch { return send(res, 404, { error: 'Staged patch not found or integrity check failed.' }); }
    }
    if (req.method === 'POST' && ['/api/dev-agent/prepare-patch', '/api/dev-agent/auto-cycle'].includes(url.pathname)) {
      const origin = req.headers.origin;
      if (origin) {
        let parsedOrigin;
        try { parsedOrigin = new URL(origin); } catch { return send(res, 403, { error: 'Origin not allowed.' }); }
        if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== HOST || parsedOrigin.port !== String(PORT)) return send(res, 403, { error: 'Origin not allowed.' });
      }
      const input = await body(req);
      const task = typeof input.task === 'string' ? input.task.trim().slice(0, 4000) : '';
      if (!task) return send(res, 400, { error: 'A development task is required.' });
      let context;
      try { context = readWorkspaceContext({ workspaceRoot: WORKSPACE, paths: input.paths }); }
      catch (error) { return send(res, 400, { error: error.message || 'Workspace context rejected.' }); }
      const taskWithContext = [
        'Prepare a small proposed code change for this task: ' + task,
        'Return only a unified diff. Do not use markdown fences. Do not claim that you applied the patch or ran tests.',
        'Only modify these existing allowlisted source files. Do not add/delete/rename files.',
        ...context.files.map(file => '--- SOURCE FILE ' + file.path + ' (sha256=' + file.sha256 + ') ---\n' + file.content + '\n--- END SOURCE FILE ---')
      ].join('\n\n');
      const result = await devAgent.runCycle({ task: taskWithContext });
      if (!result.ok) return send(res, result.code === 'dev_agent_disabled' ? 403 : 503, result);
      const proposedDiff = result.answer.trimEnd() + '\n';
      try {
        const staged = patchStager.stage({ task, selectedFiles: context.files.map(({path,sha256}) => ({path,sha256})), diff: proposedDiff });
        if (url.pathname === '/api/dev-agent/auto-cycle') {
          let report;
          try { report = await verifyStagedPatch({ workspaceRoot: WORKSPACE, patchStager, patchId: staged.id }); }
          catch (error) { return send(res, 409, { ok: false, staged: true, manifest: staged, error: error instanceof Error ? error.message : 'Isolated verification could not start.' }); }
          let appliedManifest = null;
          if (report.status === 'passed' && process.env.MAYZICAI_AUTO_APPLY_VERIFIED_PATCHES === 'true') {
            try { appliedManifest = applyVerifiedPatch({ workspaceRoot: WORKSPACE, patchStager, patchId: staged.id }); }
            catch (error) { return send(res, 409, { ok: false, staged: true, report, applied: false, manifest: staged, error: error instanceof Error ? error.message : 'Verified patch was not applied.' }); }
          }
          return send(res, report.status === 'passed' && (process.env.MAYZICAI_AUTO_APPLY_VERIFIED_PATCHES !== 'true' || Boolean(appliedManifest)) ? 200 : 422, {
            ok: report.status === 'passed', provider: result.provider, model: result.model, report,
            staged: true, applied: Boolean(appliedManifest), manifest: appliedManifest || staged,
            notice: appliedManifest ? 'AI patch was staged, isolated verification passed, and the patch was applied locally. No commit, push, or deployment was performed.' : 'AI patch was staged and verified, but not applied. Check the verification report and auto-apply setting.'
          });
        }
        return send(res, 201, { ok: true, provider: result.provider, model: result.model, manifest: staged, diff: proposedDiff, notice: 'Patch staged for review only. No source files were changed and no tests were executed.' });
      } catch (error) {
        return send(res, 422, { error: error.message || 'Model output was not a valid safe patch. No files were changed.', provider: result.provider, model: result.model, rejectedOutputPreview: result.answer.slice(0, 1200) });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/dev-agent/cycle') {
      // Browser requests must originate from this local Studio instance.
      const origin = req.headers.origin;
      if (origin) {
        let parsedOrigin;
        try { parsedOrigin = new URL(origin); } catch { return send(res, 403, { error: 'Origin not allowed.' }); }
        if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== HOST || parsedOrigin.port !== String(PORT)) return send(res, 403, { error: 'Origin not allowed.' });
      }
      const input = await body(req);
      const result = await devAgent.runCycle({ task: input.task });
      const status = result.ok ? 200 : result.code === 'task_required' ? 400 : result.code === 'cycle_in_flight' ? 409 : result.code === 'dev_agent_disabled' ? 403 : 503;
      return send(res, status, result);
    }
    if (req.method === 'POST' && (url.pathname === '/api/auto-wheel/start' || url.pathname === '/api/auto-wheel/stop')) {
      const origin = req.headers.origin;
      if (origin) {
        let parsedOrigin;
        try { parsedOrigin = new URL(origin); } catch { return send(res, 403, { error: 'Origin not allowed.' }); }
        if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== HOST || parsedOrigin.port !== String(PORT)) return send(res, 403, { error: 'Origin not allowed.' });
      }
      const status = url.pathname.endsWith('/start') ? autoWheel.start() : autoWheel.stop();
      return send(res, 200, { ok: true, ...status });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      // Browser requests must be same-origin. Requests without Origin are allowed for local CLI tests.
      const origin = req.headers.origin;
      if (origin) {
        let parsedOrigin;
        try { parsedOrigin = new URL(origin); } catch { return send(res, 403, { error: 'Origin not allowed.' }); }
        if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== HOST || parsedOrigin.port !== String(PORT)) {
          return send(res, 403, { error: 'Origin not allowed.' });
        }
      }
      // Use a dedicated MayzicAI key only; never borrow OPENAI_API_KEY from unrelated projects.
      const apiKey = process.env.MAYZICAI_OPENAI_API_KEY;
      if (!apiKey) return send(res, 503, { error: 'AI provider is not configured. Set MAYZICAI_OPENAI_API_KEY in the local server environment and restart Studio.' });
      const input = await body(req);
      const messages = Array.isArray(input.messages) ? input.messages.slice(-12) : [];
      const safeMessages = messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.trim().slice(0, 4000) })).filter(m => m.content.length > 0);
      if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== 'user') {
        return send(res, 400, { error: 'Send a non-empty user message to chat.' });
      }
      const model = String(process.env.MAYZICAI_OPENAI_MODEL || 'gpt-5.6-terra').trim().slice(0, 100);
      // A mock endpoint can be injected only under NODE_ENV=test for automated tests.
      // Normal local and production runs always call the official OpenAI endpoint.
      const upstreamUrl = process.env.NODE_ENV === 'test' && process.env.MAYZICAI_TEST_OPENAI_URL
        ? process.env.MAYZICAI_TEST_OPENAI_URL
        : 'https://api.openai.com/v1/responses';
      let upstream;
      try {
        upstream = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            instructions: 'You are MayzicAI, a helpful AI assistant. Reply in the same language as the user unless they ask otherwise. Never claim to perform external actions unless a connected tool actually did them.',
            input: safeMessages,
            max_output_tokens: 900
          }),
          signal: AbortSignal.timeout(45000)
        });
      } catch (error) {
        const timeout = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return send(res, timeout ? 504 : 502, { error: timeout ? 'AI provider timed out. Please try again.' : 'Could not reach the AI provider. Check the internet connection and try again.' });
      }
      let result;
      try { result = await upstream.json(); } catch { result = {}; }
      if (!upstream.ok) {
        const statusMessage = upstream.status === 401 || upstream.status === 403
          ? 'AI provider rejected the API key or project permissions.'
          : upstream.status === 429
            ? 'AI provider rate limit or spending limit reached.'
            : 'AI provider request failed (HTTP ' + upstream.status + ').';
        return send(res, upstream.status === 429 ? 429 : 502, { error: statusMessage });
      }
      const answer = (Array.isArray(result.output) ? result.output : []).flatMap(item => Array.isArray(item.content) ? item.content : [])
        .filter(item => item.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('\n').trim();
      if (!answer) return send(res, 502, { error: 'AI provider returned no text response. Please try again.' });
      return send(res, 200, { ok: true, model, answer });
    }
    if (req.method === 'GET' && url.pathname === '/api/usage') {
      const events = readJsonl(USAGE_FILE);
      const total = events.reduce((sum, e) => sum + e.quantity, 0);
      const cost = events.reduce((sum, e) => sum + e.estimatedCostMinor, 0);
      return send(res, 200, { count: events.length, totalUnits: total, estimatedCostMinor: cost, currency: 'INR', recent: events.slice(-30).reverse() });
    }
    if (req.method === 'POST' && url.pathname === '/api/usage') {
      const input = await body(req);
      const requestId = String(input.requestId || crypto.randomUUID()).slice(0, 100);
      const events = readJsonl(USAGE_FILE);
      if (events.some(e => e.requestId === requestId)) return send(res, 200, { ok: true, duplicate: true, requestId });
      const quantity = Number(input.quantity);
      const estimatedCostMinor = Number(input.estimatedCostMinor ?? 0);
      const productCode = String(input.productCode || 'mayzicai-studio').slice(0, 80);
      const serviceCode = String(input.serviceCode || 'manual-test').slice(0, 80);
      const unit = String(input.unit || 'unit').slice(0, 32);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) return send(res, 400, { error: 'quantity must be a finite number greater than 0.' });
      if (!Number.isSafeInteger(estimatedCostMinor) || estimatedCostMinor < 0) return send(res, 400, { error: 'estimatedCostMinor must be a non-negative integer.' });
      const event = { requestId, productCode, serviceCode, unit, quantity, estimatedCostMinor, currency: 'INR', createdAt: new Date().toISOString() };
      appendJsonl(USAGE_FILE, event);
      return send(res, 201, { ok: true, event });
    }
    if (req.method === 'GET' && url.pathname === '/api/tasks') return send(res, 200, { tasks: readJsonl(TASKS_FILE).slice(-100).reverse() });
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const input = await body(req);
      const title = String(input.title || '').trim().slice(0, 240);
      if (!title) return send(res, 400, { error: 'Task title is required.' });
      const task = { id: crypto.randomUUID(), title, status: 'planned', createdAt: new Date().toISOString(), note: 'Planner only: no external action was executed.' };
      appendJsonl(TASKS_FILE, task);
      return send(res, 201, { ok: true, task });
    }
    if (req.method === 'GET' && /^\/locales\/(en|hi)\.json$/.test(url.pathname)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(fs.readFileSync(path.join(ROOT, 'locales', url.pathname.split('/').pop())));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return res.end(fs.readFileSync(path.join(ROOT, 'index.html')));
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    return send(res, err instanceof SyntaxError ? 400 : 500, { error: err.message || 'Internal error' });
  }
});
app.listen(PORT, HOST, () => {
  console.log(`MayzicAI Studio: http://${HOST}:${PORT} (local only)`);
  autoWheel.resumeIfEnabled();
});
let shuttingDown = false;
function shutdownStudio() {
  if (shuttingDown) return;
  shuttingDown = true;
  autoWheel.shutdown();
  app.close(() => process.exit(0));
}
process.once('SIGINT', shutdownStudio);
process.once('SIGTERM', shutdownStudio);
