import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPatchStager, readWorkspaceContext } from './dev-workspace.mjs';
import { applyVerifiedPatch } from './patch-applier.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mayzicai-patch-apply-'));
const workspaceRoot = path.join(temp, 'workspace');
const dataDir = path.join(temp, 'data');
const sourcePath = path.join(workspaceRoot, 'studio', 'auto-wheel.mjs');
const normalize = value => value.replace(/\r\n/g, '\n');
try {
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'export const label = "before";\nexport const untouched = true;\n', 'utf8');
  const context = readWorkspaceContext({ workspaceRoot, paths: ['studio/auto-wheel.mjs'] });
  const stager = createPatchStager({ workspaceRoot, dataDir });
  const diff = [
    '--- a/studio/auto-wheel.mjs',
    '+++ b/studio/auto-wheel.mjs',
    '@@ -1,2 +1,2 @@',
    '-export const label = "before";',
    '+export const label = "after";',
    ' export const untouched = true;',
    ''
  ].join('\n');
  const manifest = stager.stage({ task: 'Change the label', selectedFiles: context.files.map(({path,sha256}) => ({path,sha256})), diff });
  assert.throws(() => applyVerifiedPatch({ workspaceRoot, patchStager: stager, patchId: manifest.id }), /fully passed isolated verification/i);
  stager.recordVerification(manifest.id, { status: 'passed', gates: [{name:'syntax check',ok:true}], finishedAt: new Date().toISOString() });
  const applied = applyVerifiedPatch({ workspaceRoot, patchStager: stager, patchId: manifest.id });
  assert.equal(applied.applied, true);
  assert.equal(applied.status, 'applied-after-verification');
  assert.equal(normalize(fs.readFileSync(sourcePath, 'utf8')), 'export const label = "after";\nexport const untouched = true;\n');
  assert.throws(() => applyVerifiedPatch({ workspaceRoot, patchStager: stager, patchId: manifest.id }), /already been applied/i);

  const context2 = readWorkspaceContext({ workspaceRoot, paths: ['studio/auto-wheel.mjs'] });
  const diff2 = diff.replace('before', 'after').replace('after', 'third');
  const stale = stager.stage({ task: 'Must reject stale source', selectedFiles: context2.files.map(({path,sha256}) => ({path,sha256})), diff: diff2 });
  stager.recordVerification(stale.id, { status: 'passed', gates: [{name:'syntax check',ok:true}], finishedAt: new Date().toISOString() });
  fs.appendFileSync(sourcePath, '// changed after verification\n');
  assert.throws(() => applyVerifiedPatch({ workspaceRoot, patchStager: stager, patchId: stale.id }), /Source changed after verification/i);
  console.log('PASS: apply requires passed verification, preserves unrelated lines, rejects repeat apply, and blocks stale source hashes.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
