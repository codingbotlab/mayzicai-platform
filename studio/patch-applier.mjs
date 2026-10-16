import { spawnSync } from 'node:child_process';
import { readWorkspaceContext } from './dev-workspace.mjs';

export function applyVerifiedPatch({ workspaceRoot, patchStager, patchId, clock = () => Date.now() } = {}) {
  if (!workspaceRoot || !patchStager || !patchId) throw new TypeError('workspaceRoot, patchStager, and patchId are required.');
  const { manifest, verification } = patchStager.get(patchId);
  if (manifest.applied) throw new Error('Patch has already been applied.');
  if (manifest.status !== 'verified-awaiting-review' || verification?.status !== 'passed' ||
      !Array.isArray(verification.gates) || verification.gates.length === 0 || verification.gates.some(gate => gate.ok !== true)) {
    throw new Error('Only patches with a fully passed isolated verification report can be applied.');
  }
  const current = readWorkspaceContext({ workspaceRoot, paths: manifest.targets.map(target => target.path) });
  for (const target of manifest.targets) {
    const file = current.files.find(item => item.path === target.path);
    if (!file || file.sha256 !== target.expectedSourceSha256) throw new Error('Source changed after verification: ' + target.path + '. Re-stage and re-verify the patch.');
  }
  const patchFile = patchStager.patchPath(patchId);
  const preflight = spawnSync('git', ['apply', '--check', '--whitespace=error-all', patchFile], { cwd: workspaceRoot, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  if (preflight.error || preflight.status !== 0) throw new Error('Live apply preflight failed; no patch was applied. ' + String(preflight.stderr || preflight.error?.message || '').slice(0, 500));
  const applied = spawnSync('git', ['apply', '--whitespace=error-all', patchFile], { cwd: workspaceRoot, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  if (applied.error || applied.status !== 0) throw new Error('Patch application failed. Inspect the workspace before retrying. ' + String(applied.stderr || applied.error?.message || '').slice(0, 500));
  return patchStager.recordApplication(patchId, {
    status: 'applied-after-verification',
    applied: true,
    appliedAt: new Date(clock()).toISOString(),
    appliedTargets: manifest.targets.map(target => target.path),
    boundaries: 'Only allowlisted targets were applied after isolated verification passed and source hashes were rechecked. No commit, push, or deployment was performed.'
  });
}
