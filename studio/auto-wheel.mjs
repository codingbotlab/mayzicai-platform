import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const WHEEL_AGENT_COUNT = 500_000;
export const WHEEL_TARGET_YEARS = 5_000;
export const WHEEL_INTERVAL_MS = 1_000;
export const WHEEL_MAX_HISTORY = 60;
export const WHEEL_CHECKPOINT_EVERY = 1;
export const WHEEL_TARGET_SECONDS = Math.round(WHEEL_TARGET_YEARS * 365.2425 * 24 * 60 * 60);

// Auto-approved planning tasks. Approval never authorizes source edits or tool execution.
const WORK_ITEMS = [
  'Inspect one pending implementation task and define an acceptance test.',
  'Propose one isolated reliability improvement for human review.',
  'Identify a regression-test gap and draft a test proposal.',
  'Review a privacy boundary and propose a safer default.',
  'Inspect Hindi/English consistency and propose one localization fix.',
  'Compare developer documentation with the implemented API.',
  'Review the release checklist and propose the next verification step.',
  'Break one product requirement into a small, reviewable change.',
  'Identify one accessibility improvement and its verification test.',
  'Review error handling and propose one recoverability improvement.',
  'Check whether a change would affect an unrelated project; flag scope risks.',
  'Propose one maintainability improvement without editing source files.'
];

function defaultState(now) {
  return {
    version: 1,
    enabled: false,
    targetYears: WHEEL_TARGET_YEARS,
    targetSeconds: WHEEL_TARGET_SECONDS,
    logicalAgentCount: WHEEL_AGENT_COUNT,
    maxConcurrentWorkers: 1,
    intervalMs: WHEEL_INTERVAL_MS,
    cyclesCompleted: 0,
    nextAgentIndex: 0,
    startedAt: null,
    lastStep: null,
    recentSteps: [],
    lastCheckpointAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    mode: 'proposal-only'
  };
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
}

export function createAutoWheel({ stateFile, clock = () => Date.now() } = {}) {
  if (!stateFile) throw new TypeError('stateFile is required');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const lockFile = stateFile + '.lock';
  const lockToken = crypto.randomUUID();
  let ownsLock = false;
  let lockOwnerPid = null;
  let timer = null;
  let state;

  function normalizeState(parsed) {
    const fallback = defaultState(clock());
    return {
      ...fallback,
      ...parsed,
      version: 1,
      targetYears: WHEEL_TARGET_YEARS,
      targetSeconds: WHEEL_TARGET_SECONDS,
      logicalAgentCount: WHEEL_AGENT_COUNT,
      maxConcurrentWorkers: 1,
      intervalMs: WHEEL_INTERVAL_MS,
      mode: 'proposal-only',
      cyclesCompleted: Number.isSafeInteger(parsed.cyclesCompleted) && parsed.cyclesCompleted >= 0 ? parsed.cyclesCompleted : 0,
      nextAgentIndex: Number.isSafeInteger(parsed.nextAgentIndex) ? ((parsed.nextAgentIndex % WHEEL_AGENT_COUNT) + WHEEL_AGENT_COUNT) % WHEEL_AGENT_COUNT : 0,
      recentSteps: Array.isArray(parsed.recentSteps) ? parsed.recentSteps.filter(item => item && Number.isSafeInteger(item.cycle)).map(item => ({ ...item, status: 'auto-approved-planning-only', approvedAt: item.approvedAt || item.createdAt, approvalMode: 'automatic-planning-only' })).slice(-WHEEL_MAX_HISTORY) : [],
      lastStep: parsed.lastStep && Number.isSafeInteger(parsed.lastStep.cycle) ? { ...parsed.lastStep, status: 'auto-approved-planning-only', approvedAt: parsed.lastStep.approvedAt || parsed.lastStep.createdAt, approvalMode: 'automatic-planning-only' } : null
    };
  }

  function readDiskState() {
    if (!fs.existsSync(stateFile)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return normalizeState(parsed);
    } catch { return null; }
  }

  state = readDiskState() || defaultState(clock());

  function refreshFromDisk(force = false) {
    if (ownsLock && !force) return;
    const disk = readDiskState();
    if (disk) state = disk;
  }

  function inspectLock() {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      lockOwnerPid = Number.isSafeInteger(lock.pid) ? lock.pid : null;
      return lock;
    } catch {
      lockOwnerPid = null;
      return null;
    }
  }

  function acquireLock() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fd = fs.openSync(lockFile, 'wx', 0o600);
        try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token: lockToken, createdAt: new Date(clock()).toISOString() })); }
        finally { fs.closeSync(fd); }
        ownsLock = true;
        lockOwnerPid = process.pid;
        return true;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const existing = inspectLock();
        if (existing && processIsAlive(existing.pid)) return false;
        // A lock left by a crashed process can be reclaimed. Re-check before retrying.
        try { fs.unlinkSync(lockFile); } catch (unlinkError) { if (unlinkError?.code !== 'ENOENT') return false; }
      }
    }
    return false;
  }

  function releaseLock() {
    if (!ownsLock) return;
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (existing.token === lockToken && existing.pid === process.pid) fs.unlinkSync(lockFile);
    } catch {}
    ownsLock = false;
    lockOwnerPid = null;
  }

  function persist() {
    if (!ownsLock) throw new Error('Wheel persistence requires the exclusive scheduler lock.');
    const nowIso = new Date(clock()).toISOString();
    state.updatedAt = nowIso;
    state.lastCheckpointAt = nowIso;
    const temp = stateFile + '.' + process.pid + '.' + lockToken + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.renameSync(temp, stateFile); }
    catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
  }

  function snapshot() {
    refreshFromDisk();
    if (!ownsLock) inspectLock();
    const workerState = timer ? 'running' : (lockOwnerPid && !ownsLock ? 'owned-by-another-process' : 'stopped');
    return {
      ...state,
      recentSteps: state.recentSteps.slice(-WHEEL_MAX_HISTORY),
      workerActive: Boolean(timer),
      workerState,
      workerLockOwnerPid: lockOwnerPid,
      targetHorizonNote: 'A 5,000-year planning horizon is metadata, not a guarantee of uninterrupted machine uptime.',
      executionBoundary: 'Each tick creates one proposal only. It does not edit files, run commands, make network actions, or push code.',
      memoryBoundary: '500,000 logical agent IDs; only one proposal worker runs per tick; only the latest 60 proposals stay in history.'
    };
  }

  function tickNow() {
    if (!state.enabled || !ownsLock) return snapshot();
    const cycle = state.cyclesCompleted + 1;
    const agentNumber = state.nextAgentIndex + 1;
    const proposal = {
      cycle,
      agentId: 'MWA-' + String(agentNumber).padStart(6, '0'),
      title: WORK_ITEMS[(cycle - 1) % WORK_ITEMS.length],
      createdAt: new Date(clock()).toISOString(),
      status: 'auto-approved-planning-only',
      approvedAt: new Date(clock()).toISOString(),
      approvalMode: 'automatic-planning-only',
      action: 'proposal-only'
    };
    // Commit every cycle atomically before it is exposed to callers. A restart therefore
    // resumes from the last committed cycle rather than replaying an uncheckpointed batch.
    state.cyclesCompleted = cycle;
    state.nextAgentIndex = agentNumber % WHEEL_AGENT_COUNT;
    state.lastStep = proposal;
    state.recentSteps.push(proposal);
    if (state.recentSteps.length > WHEEL_MAX_HISTORY) state.recentSteps.splice(0, state.recentSteps.length - WHEEL_MAX_HISTORY);
    try { persist(); }
    catch (error) {
      // Fail closed if the durable checkpoint cannot be committed.
      state.enabled = false;
      if (timer) clearInterval(timer);
      timer = null;
      try { persist(); } catch {}
      releaseLock();
      throw error;
    }
    return snapshot();
  }

  function start() {
    if (timer) return snapshot();
    if (!acquireLock()) return snapshot();
    refreshFromDisk(true);
    state.enabled = true;
    if (!state.startedAt) state.startedAt = new Date(clock()).toISOString();
    try { persist(); }
    catch (error) { releaseLock(); throw error; }
    timer = setInterval(() => {
      try { tickNow(); }
      catch (error) {
        state.enabled = false;
        if (timer) clearInterval(timer);
        timer = null;
        try { persist(); } catch {}
        releaseLock();
        // Keep failure detail generic; never log secrets or prompts.
        state.lastError = error instanceof Error ? error.message.slice(0, 240) : 'Wheel tick failed';
      }
    }, WHEEL_INTERVAL_MS);
    timer.unref?.();
    return snapshot();
  }

  function stop() {
    const alreadyOwned = ownsLock;
    if (!ownsLock && !acquireLock()) return snapshot();
    if (timer) clearInterval(timer);
    timer = null;
    if (!alreadyOwned) refreshFromDisk(true);
    state.enabled = false;
    persist();
    releaseLock();
    return snapshot();
  }

  function resumeIfEnabled() {
    refreshFromDisk();
    if (state.enabled) return start();
    return snapshot();
  }

  function shutdown() {
    if (timer) clearInterval(timer);
    timer = null;
    // Preserve the enabled flag so the wheel resumes after a graceful Studio restart.
    if (ownsLock) {
      try { persist(); } catch {}
      releaseLock();
    }
  }

  return { status: snapshot, start, stop, tickNow, resumeIfEnabled, shutdown };
}
