import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEV_WORKSPACE_ALLOWLIST = Object.freeze([
  'studio/auto-wheel.mjs',
  'studio/dev-agent-engine.mjs',
  'studio/dev-workspace.mjs',
  'studio/i18n.mjs',
  'studio/locales/en.json',
  'studio/locales/hi.json',
  'studio/server.mjs'
]);
export const DEV_WORKSPACE_MAX_FILES = 4;
export const DEV_WORKSPACE_MAX_FILE_BYTES = 20_000;
export const DEV_WORKSPACE_MAX_CONTEXT_BYTES = 36_000;
export const DEV_WORKSPACE_MAX_PATCH_BYTES = 60_000;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeRelative(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Each path must be a non-empty string.');
  const relative = input.replace(/\\/g, '/').replace(/^\.\//, '');
  if (relative.startsWith('/') || relative.includes('..') || relative.includes(':') || relative.includes('\0')) {
    throw new Error('Absolute paths, parent traversal, and drive paths are not allowed.');
  }
  if (!DEV_WORKSPACE_ALLOWLIST.includes(relative)) throw new Error('Path is outside the Dev Agent allowlist: ' + relative);
  return relative;
}
function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

function validateUnifiedDiff(diff, selectedHashes) {
  const lines = diff.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  let index = 0;
  const targets = [];
  while (index < lines.length) {
    if (!lines[index].startsWith('--- a/')) throw new Error('Unsupported patch metadata or malformed unified-diff file header.');
    const oldPath = lines[index].slice(6);
    index++;
    if (index >= lines.length || !lines[index].startsWith('+++ b/')) throw new Error('Each old file header must be followed by a new file header.');
    const newPath = lines[index].slice(6);
    index++;
    const oldNormalized = normalizeRelative(oldPath);
    const newNormalized = normalizeRelative(newPath);
    if (oldNormalized !== newNormalized) throw new Error('New files, deletions, and renames are not supported in this staging step.');
    if (!selectedHashes.has(oldNormalized)) throw new Error('Patch target was not included in the reviewed source context: ' + oldNormalized);
    if (targets.includes(oldNormalized)) throw new Error('Duplicate patch target: ' + oldNormalized);
    targets.push(oldNormalized);
    let hunkCount = 0;
    while (index < lines.length && lines[index].startsWith('@@ ')) {
      const match = lines[index].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/);
      if (!match) throw new Error('Malformed unified-diff hunk header.');
      const oldExpected = match[2] === undefined ? 1 : Number(match[2]);
      const newExpected = match[4] === undefined ? 1 : Number(match[4]);
      if (oldExpected + newExpected === 0) throw new Error('Empty unified-diff hunks are not supported.');
      index++;
      let oldSeen = 0;
      let newSeen = 0;
      while (oldSeen < oldExpected || newSeen < newExpected) {
        if (index >= lines.length) throw new Error('Truncated unified-diff hunk.');
        const line = lines[index];
        if (line.startsWith(' ')) { oldSeen++; newSeen++; }
        else if (line.startsWith('-')) oldSeen++;
        else if (line.startsWith('+')) newSeen++;
        else throw new Error('Unsupported metadata or malformed hunk line.');
        if (oldSeen > oldExpected || newSeen > newExpected) throw new Error('Unified-diff hunk line counts do not match its header.');
        index++;
        if (index < lines.length && lines[index] === '\\ No newline at end of file') index++;
      }
      hunkCount++;
    }
    if (hunkCount === 0) throw new Error('Every patch file must contain at least one valid text hunk.');
    if (index < lines.length && !lines[index].startsWith('--- a/')) throw new Error('Unsupported trailing patch metadata or malformed file section.');
  }
  if (targets.length < 1 || targets.length > DEV_WORKSPACE_MAX_FILES) throw new Error('Expected a unified diff with 1-4 file sections.');
  return targets;
}
function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function secureRealFile(root, relative) {
  const rootReal = fs.realpathSync(root);
  const absolute = path.resolve(rootReal, ...relative.split('/'));
  if (!inside(rootReal, absolute)) throw new Error('Resolved path escapes the workspace.');
  const real = fs.realpathSync(absolute);
  if (!inside(rootReal, real)) throw new Error('Symlink paths outside the workspace are not allowed.');
  const st = fs.statSync(real);
  if (!st.isFile()) throw new Error('Only regular source files are allowed.');
  return real;
}

export function readWorkspaceContext({ workspaceRoot, paths }) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > DEV_WORKSPACE_MAX_FILES) {
    throw new Error('Select between 1 and ' + DEV_WORKSPACE_MAX_FILES + ' allowlisted files.');
  }
  const seen = new Set();
  let total = 0;
  const files = paths.map(value => {
    const relative = normalizeRelative(value);
    if (seen.has(relative)) throw new Error('Duplicate path: ' + relative);
    seen.add(relative);
    const absolute = secureRealFile(workspaceRoot, relative);
    const stat = fs.statSync(absolute);
    if (stat.size > DEV_WORKSPACE_MAX_FILE_BYTES) throw new Error('File exceeds the 20 KB context limit: ' + relative);
    const content = fs.readFileSync(absolute, 'utf8');
    total += Buffer.byteLength(content, 'utf8');
    if (total > DEV_WORKSPACE_MAX_CONTEXT_BYTES) throw new Error('Combined workspace context exceeds 36 KB.');
    return { path: relative, sha256: sha256(content), bytes: Buffer.byteLength(content, 'utf8'), content };
  });
  return { files, totalBytes: total };
}

export function createPatchStager({ workspaceRoot, dataDir, clock = () => Date.now() } = {}) {
  if (!workspaceRoot || !dataDir) throw new TypeError('workspaceRoot and dataDir are required.');
  const patchesRoot = path.join(dataDir, 'dev-agent', 'patches');
  fs.mkdirSync(patchesRoot, { recursive: true });

  function stage({ task, selectedFiles, diff }) {
    if (typeof task !== 'string' || !task.trim() || task.length > 4_000) throw new Error('Task must be 1–4,000 characters.');
    if (typeof diff !== 'string' || !diff.trim() || Buffer.byteLength(diff, 'utf8') > DEV_WORKSPACE_MAX_PATCH_BYTES) throw new Error('Patch must be non-empty and at most 60 KB.');
    if (!Array.isArray(selectedFiles) || selectedFiles.length < 1 || selectedFiles.length > DEV_WORKSPACE_MAX_FILES) throw new Error('Patch must reference selected allowlisted files.');
    const current = readWorkspaceContext({ workspaceRoot, paths: selectedFiles.map(f => f.path) });
    const selectedHashes = new Map(current.files.map(f => [f.path, f.sha256]));
    for (const selected of selectedFiles) {
      if (!selected || selectedHashes.get(normalizeRelative(selected.path)) !== selected.sha256) {
        throw new Error('Source file changed after context was read; refresh context before staging.');
      }
    }
    const targets = validateUnifiedDiff(diff, selectedHashes);
    const id = crypto.randomUUID();
    const folder = path.join(patchesRoot, id);
    fs.mkdirSync(folder, { recursive: false });
    const createdAt = new Date(clock()).toISOString();
    const patchName = 'proposal.patch';
    fs.writeFileSync(path.join(folder, patchName), diff, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    const manifest = {
      id, createdAt, status: 'awaiting-human-review', applied: false, testsExecuted: false,
      task: task.trim(), patchFile: patchName, patchSha256: sha256(diff),
      targets: targets.map(relative => ({ path: relative, expectedSourceSha256: selectedHashes.get(relative) })),
      boundaries: 'Staging only. No source files changed. No patch applied. No tests executed. No Git operations performed.'
    };
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return manifest;
  }

  function recordVerification(id, report) {
    const { manifest, diff } = get(id);
    const ok = report && report.status === 'passed' && Array.isArray(report.gates) && report.gates.length > 0 && report.gates.every(gate => gate.ok === true);
    manifest.status = ok ? 'verified-awaiting-review' : report?.status === 'failed' ? 'verification-failed' : 'verification-error';
    manifest.applied = false;
    manifest.testsExecuted = Array.isArray(report?.gates) && report.gates.some(gate => /tests/i.test(gate.name));
    manifest.verifiedAt = report?.finishedAt || new Date().toISOString();
    manifest.verification = {
      ok,
      status: String(report?.status || 'error'),
      gateCount: Array.isArray(report?.gates) ? report.gates.length : 0,
      gates: (Array.isArray(report?.gates) ? report.gates : []).map(gate => ({ name: String(gate.name || 'unnamed').slice(0, 160), ok: gate.ok === true, exitCode: gate.exitCode ?? null, durationMs: Number(gate.durationMs) || 0, timedOut: gate.timedOut === true })),
      error: report?.error ? String(report.error).slice(0, 1200) : null
    };
    writeAtomicJson(path.join(patchesRoot, id, 'manifest.json'), manifest);
    writeAtomicJson(path.join(patchesRoot, id, 'verification.json'), report);
    return { manifest, diff };
  }

  function writeAtomicJson(file, value) {
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, file);
  }

  function patchPath(id) {
    const { manifest } = get(id);
    return path.join(patchesRoot, id, manifest.patchFile);
  }

  function recordApplication(id, application) {
    const { manifest } = get(id);
    if (manifest.applied) throw new Error('Patch has already been applied.');
    if (!application || application.applied !== true || application.status !== 'applied-after-verification') throw new Error('Invalid patch application record.');
    Object.assign(manifest, application);
    writeAtomicJson(path.join(patchesRoot, id, 'manifest.json'), manifest);
    return manifest;
  }

  function list() {
    return fs.readdirSync(patchesRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && idPattern.test(entry.name))
      .map(entry => {
        try { return JSON.parse(fs.readFileSync(path.join(patchesRoot, entry.name, 'manifest.json'), 'utf8')); }
        catch { return null; }
      }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25)
      .map(({ id, createdAt, status, applied, testsExecuted, task, targets, verifiedAt, verification }) => ({ id, createdAt, status, applied, testsExecuted, task, targets, verifiedAt: verifiedAt || null, verification: verification ? { ok: verification.ok === true, gateCount: verification.gateCount } : null }));
  }

  function get(id) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid patch id.');
    const folder = path.join(patchesRoot, id);
    const manifestPath = path.join(folder, 'manifest.json');
    const patchPath = path.join(folder, 'proposal.patch');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const diff = fs.readFileSync(patchPath, 'utf8');
    if (sha256(diff) !== manifest.patchSha256) throw new Error('Staged patch integrity check failed.');
    if (!Array.isArray(manifest.targets) || manifest.targets.length < 1 || manifest.targets.length > DEV_WORKSPACE_MAX_FILES) throw new Error('Staged patch manifest has invalid targets.');
    const validatedTargets = validateUnifiedDiff(diff, new Map(manifest.targets.map(target => [target.path, target.expectedSourceSha256])));
    if (validatedTargets.length !== manifest.targets.length || validatedTargets.some((target, index) => target !== manifest.targets[index].path)) throw new Error('Staged patch targets do not match the validated patch manifest.');
    const verificationPath = path.join(folder, 'verification.json');
    let verification = null;
    if (fs.existsSync(verificationPath)) verification = JSON.parse(fs.readFileSync(verificationPath, 'utf8'));
    return { manifest, diff, verification };
  }

  return { stage, list, get, recordVerification, patchPath, recordApplication };
}
