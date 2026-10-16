import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEV_WORKSPACE_ALLOWLIST, readWorkspaceContext } from './dev-workspace.mjs';

const NODE = process.execPath;
const GATE_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 300_000;

// Explicit snapshot list. Test files are trusted gate inputs, not model-editable patch targets.
const SANDBOX_FILES = Object.freeze([
  ...DEV_WORKSPACE_ALLOWLIST,
  'studio/index.html',
  'studio/dev-agent-engine.test.mjs',
  'studio/dev-workspace.test.mjs'
]);
const TRUSTED_TESTS = Object.freeze([
  { name: 'Dev Agent unit tests (permission-restricted)', script: 'studio/dev-agent-engine.test.mjs' },
  { name: 'Workspace and patch-staging security tests (permission-restricted)', script: 'studio/dev-workspace.test.mjs' }
]);

function sha256(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function writeJson(file, value) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}
function runProcess(command, args, { cwd, env, timeout = GATE_TIMEOUT_MS, maxBuffer = MAX_OUTPUT_BYTES } = {}) {
  const started = Date.now();
  const run = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer, windowsHide: true });
  const output = [run.stdout, run.stderr].filter(Boolean).join('\n').slice(-12_000);
  return {
    ok: !run.error && run.status === 0,
    exitCode: run.status,
    signal: run.signal || null,
    timedOut: run.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - started,
    output,
    error: run.error ? String(run.error.message).slice(0, 500) : null
  };
}

const OFFLINE_GUARD = `import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
const blocked = () => { throw new Error('Network access is disabled in MayzicAI patch verification.'); };
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
net.connect = blocked;
net.createConnection = blocked;
tls.connect = blocked;
dgram.createSocket = blocked;
globalThis.fetch = blocked;
globalThis.WebSocket = class { constructor() { blocked(); } };
`;

export async function verifyStagedPatch({ workspaceRoot, patchStager, patchId, clock = () => Date.now() } = {}) {
  if (!workspaceRoot || !patchStager || !patchId) throw new TypeError('workspaceRoot, patchStager, and patchId are required.');
  const { manifest, diff } = patchStager.get(patchId);
  if (manifest.applied) throw new Error('This patch is marked applied; re-stage from current source before verification.');
  if (!Array.isArray(manifest.targets) || manifest.targets.length < 1 || manifest.targets.length > 4) throw new Error('Patch manifest has invalid targets.');
  const paths = manifest.targets.map(target => target.path);
  const current = readWorkspaceContext({ workspaceRoot, paths });
  for (const target of manifest.targets) {
    const file = current.files.find(item => item.path === target.path);
    if (!file || file.sha256 !== target.expectedSourceSha256) throw new Error('Source changed since patch creation: ' + target.path + '. Generate a fresh proposal.');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mayzicai-patch-verify-'));
  const tempDir = path.join(tempRoot, 'workspace');
  const tempData = path.join(tempRoot, 'private-data');
  const tmpDir = path.join(tempRoot, 'tmp');
  const report = {
    patchId,
    startedAt: new Date(clock()).toISOString(),
    status: 'running',
    applied: false,
    liveSourceChanged: false,
    gitOperationsPerformed: false,
    gates: [],
    notes: [
      'The patch is applied only to a disposable snapshot; the live workspace is not modified.',
      'Candidate code runs in separate Node processes with filesystem permissions restricted to this temporary workspace, child-process permission disabled, and common network APIs blocked.',
      'This process-level guard is defense-in-depth, not a replacement for a dedicated OS sandbox against deliberately malicious native-code exploits.'
    ]
  };

  function addGate(name, result) {
    report.gates.push({ name, ...result });
    return result.ok;
  }
  function ensureCopy(relative) {
    const rootReal = fs.realpathSync(workspaceRoot);
    const source = path.resolve(rootReal, ...relative.split('/'));
    const realSource = fs.realpathSync(source);
    const sourceRel = path.relative(rootReal, realSource);
    if (sourceRel === '..' || sourceRel.startsWith('..' + path.sep) || path.isAbsolute(sourceRel)) throw new Error('Sandbox source symlink escaped the workspace.');
    if (!fs.statSync(realSource).isFile()) throw new Error('Sandbox snapshot only accepts regular files.');
    const target = path.resolve(tempDir, ...relative.split('/'));
    const rel = path.relative(tempDir, target);
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Sandbox copy path escaped the temp workspace.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(realSource, target);
  }

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(tempData, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    for (const relative of SANDBOX_FILES) ensureCopy(relative);
    const patchPath = path.join(tempRoot, 'proposed.patch');
    fs.writeFileSync(patchPath, diff, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    try {
      let result = runProcess('git', ['apply', '--check', '--whitespace=error-all', patchPath], { cwd: tempDir });
      if (!addGate('unified-diff preflight', result)) {
        report.status = 'failed';
        return report;
      }
      result = runProcess('git', ['apply', '--whitespace=error-all', patchPath], { cwd: tempDir });
      if (!addGate('apply patch to disposable snapshot', result)) {
        report.status = 'failed';
        return report;
      }
    } finally {
      try { fs.rmSync(patchPath, { force: true }); } catch {}
    }

    // Syntax checks parse source without evaluating it.
    const touchedMjs = [...new Set(manifest.targets.map(target => target.path).filter(file => file.endsWith('.mjs')))];
    for (const relative of touchedMjs) {
      const result = runProcess(NODE, ['--check', path.join(tempDir, ...relative.split('/'))], {
        cwd: tempDir,
        env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'test' },
        timeout: 15_000
      });
      if (!addGate('syntax: ' + relative, result)) {
        report.status = 'failed';
        return report;
      }
    }

    // Validate the locale catalogs regardless of which source file changed.
    const localeCheck = `for (const name of ['en.json','hi.json']) JSON.parse(require('node:fs').readFileSync(require('node:path').join('studio','locales',name),'utf8')); process.stdout.write('Locale JSON valid\\n');`;
    const localeResult = runProcess(NODE, ['-e', localeCheck], {
      cwd: tempDir,
      env: { ...process.env, NODE_OPTIONS: '', NODE_ENV: 'test' },
      timeout: 15_000
    });
    if (!addGate('English/Hindi locale JSON', localeResult)) {
      report.status = 'failed';
      return report;
    }

    const guardPath = path.join(tempDir, '.mayzicai-offline-guard.mjs');
    fs.writeFileSync(guardPath, OFFLINE_GUARD, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    try {
      const restrictedEnv = {
        SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || '',
        WINDIR: process.env.WINDIR || '',
        PATH: process.env.PATH || process.env.Path || '',
        PATHEXT: process.env.PATHEXT || '',
        TEMP: tmpDir,
        TMP: tmpDir,
        TMPDIR: tmpDir,
        NODE_ENV: 'test',
        MAYZICAI_DATA_DIR: tempData,
        MAYZICAI_OPENAI_API_KEY: '',
        MAYZICAI_ALLOW_CLOUD_FALLBACK: 'false',
        OPENAI_API_KEY: '',
        NODE_OPTIONS: ''
      };
      for (const test of TRUSTED_TESTS) {
        const args = [
          '--permission',
          '--allow-fs-read=' + tempRoot,
          '--allow-fs-write=' + tempRoot,
          '--allow-fs-write=' + tempData,
          '--allow-fs-write=' + tmpDir,
          '--allow-fs-write=' + tempDir,
          '--import=' + pathToFileURL(guardPath).href,
          path.join(tempDir, ...test.script.split('/'))
        ];
        const result = runProcess(NODE, args, { cwd: tempDir, env: restrictedEnv, timeout: GATE_TIMEOUT_MS });
        if (!addGate(test.name, result)) {
          report.status = 'failed';
          return report;
        }
      }
    } finally {
      try { fs.rmSync(guardPath, { force: true }); } catch {}
    }

    report.status = 'passed';
    return report;
  } catch (error) {
    report.status = 'error';
    report.error = error instanceof Error ? error.message.slice(0, 1200) : 'Patch verification failed.';
    return report;
  } finally {
    report.finishedAt = new Date(clock()).toISOString();
    try { patchStager.recordVerification(patchId, report); }
    catch (error) { report.recordError = error instanceof Error ? error.message : 'Could not record verification result.'; }
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  }
}
