import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPatchStager, readWorkspaceContext } from './dev-workspace.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mayzicai-workspace-stage-'));
const workspaceRoot = path.join(temp, 'workspace');
const dataDir = path.join(temp, 'private-data');
const sourcePath = path.join(workspaceRoot, 'studio', 'auto-wheel.mjs');
const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

try {
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '<main>Original</main>\n<footer>Keep</footer>\n', 'utf8');
  const context = readWorkspaceContext({ workspaceRoot, paths: ['studio/auto-wheel.mjs'] });
  assert.equal(context.files.length, 1);
  assert.equal(context.files[0].content, '<main>Original</main>\n<footer>Keep</footer>\n');
  assert.equal(context.files[0].sha256, sha('<main>Original</main>\n<footer>Keep</footer>\n'));

  assert.throws(() => readWorkspaceContext({ workspaceRoot, paths: ['../secret.txt'] }), /allowlist|parent traversal/i);
  assert.throws(() => readWorkspaceContext({ workspaceRoot, paths: ['studio/auto-wheel.mjs', 'studio/auto-wheel.mjs'] }), /Duplicate path/i);
  assert.throws(() => readWorkspaceContext({ workspaceRoot, paths: ['studio/index.html', 'studio/server.mjs', 'studio/test.mjs', 'studio/i18n.mjs', 'studio/auto-wheel.mjs'] }), /between 1 and 4/i);

  const stager = createPatchStager({ workspaceRoot, dataDir, clock: () => 1_800_000_000_000 });
  const diff = '--- a/studio/auto-wheel.mjs\n+++ b/studio/auto-wheel.mjs\n@@ -1,2 +1,2 @@\n-<main>Original</main>\n+<main>Reviewed candidate</main>\n <footer>Keep</footer>\n';
  const manifest = stager.stage({ task: 'Change one heading', selectedFiles: context.files.map(({path,sha256}) => ({path,sha256})), diff });
  assert.equal(manifest.status, 'awaiting-human-review');
  assert.equal(manifest.applied, false);
  assert.equal(manifest.testsExecuted, false);
  assert.equal(manifest.targets[0].path, 'studio/auto-wheel.mjs');
  assert.equal(manifest.targets[0].expectedSourceSha256, context.files[0].sha256);
  assert.equal(stager.get(manifest.id).diff, diff);
  assert.equal(stager.list().length, 1);
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), '<main>Original</main>\n<footer>Keep</footer>\n', 'staging must not modify workspace source');

  assert.throws(() => stager.stage({ task: 'Traversal', selectedFiles: context.files.map(({path,sha256}) => ({path,sha256})), diff: diff.replaceAll('studio/auto-wheel.mjs', '../secret.txt') }), /parent traversal|allowlist/i);
  stager.recordVerification(manifest.id, { status: 'passed', gates: [{ name: 'unit tests', ok: true }], finishedAt: new Date(1_800_000_000_000).toISOString() });
  assert.equal(stager.get(manifest.id).manifest.status, 'verified-awaiting-review');
  fs.writeFileSync(sourcePath, '<main>Changed after read</main>\n', 'utf8');
  assert.throws(() => stager.stage({ task: 'Stale source', selectedFiles: context.files.map(({path,sha256}) => ({path,sha256})), diff }), /changed after context/i);
  assert.throws(() => stager.get('../../manifest.json'), /Invalid patch id/i);

  console.log('PASS: workspace allowlist, bounded context, SHA-256 freshness check, unified-diff validation, private staging, integrity verification, and no source modification.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
