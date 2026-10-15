import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAutoWheel } from './auto-wheel.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mayzicai-auto-wheel-'));
const stateFile = path.join(temp, 'auto-wheel.json');
const readState = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
let first;
let second;
try {
  first = createAutoWheel({ stateFile });
  const started = first.start();
  assert.equal(started.enabled, true);
  assert.equal(started.workerState, 'running');
  const secondStart = createAutoWheel({ stateFile });
  second = secondStart;
  const blocked = second.start();
  assert.equal(blocked.enabled, true, 'saved enabled intent should remain true');
  assert.equal(blocked.workerState, 'owned-by-another-process', 'a second instance must not create another worker');
  assert.equal(blocked.workerActive, false);

  const before = readState().cyclesCompleted;
  second.tickNow();
  assert.equal(readState().cyclesCompleted, before, 'a non-owner cannot execute duplicate ticks');
  first.tickNow();
  const committed = readState();
  assert.equal(committed.cyclesCompleted, before + 1, 'each tick must be durably committed immediately');
  assert.equal(committed.lastStep.cycle, committed.cyclesCompleted);
  assert.equal(committed.lastStep.action, 'proposal-only');
  assert.equal(committed.lastStep.status, 'auto-approved-planning-only');
  assert.equal(committed.lastStep.approvalMode, 'automatic-planning-only');

  first.shutdown(); // graceful restart preserves enabled intent and releases the process lock
  assert.equal(readState().enabled, true);
  const resumed = second.resumeIfEnabled();
  assert.equal(resumed.enabled, true);
  assert.equal(resumed.workerState, 'running');
  assert.equal(resumed.cyclesCompleted, committed.cyclesCompleted, 'resume must continue from the latest committed cycle');
  second.tickNow();
  assert.equal(readState().cyclesCompleted, committed.cyclesCompleted + 1);
  second.stop();
  assert.equal(readState().enabled, false);
  assert.equal(fs.existsSync(stateFile + '.lock'), false, 'stop must release the lock');
  console.log('PASS: atomic per-cycle checkpoints, single-worker lock, duplicate-tick protection, restart resume, stop, and lock cleanup.');
} finally {
  try { first?.shutdown(); } catch {}
  try { second?.shutdown(); } catch {}
  fs.rmSync(temp, { recursive: true, force: true });
}
