import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDevAgentEngine, DEV_AGENT_CLOUD_DAILY_LIMIT, DEV_AGENT_CLOUD_COOLDOWN_MS } from './dev-agent-engine.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mayzicai-dev-agent-'));
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const baseEnv = {
  MAYZICAI_DEV_AGENT_ENABLED: 'true',
  MAYZICAI_OLLAMA_URL: 'http://127.0.0.1:11434/api/chat',
  MAYZICAI_OLLAMA_MODEL: 'fake-coder:1b',
  MAYZICAI_ALLOW_CLOUD_FALLBACK: 'false',
  MAYZICAI_OPENAI_API_KEY: ''
};

try {
  // The engine is disabled unless explicitly opted into by the local server environment.
  const disabled = createDevAgentEngine({ stateFile: path.join(temp, 'disabled.json'), env: { ...baseEnv, MAYZICAI_DEV_AGENT_ENABLED: 'false' } });
  let result = await disabled.runCycle({ task: 'Add a small unit test' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'dev_agent_disabled');
  assert.equal((await disabled.runCycle({ task: '' })).code, 'dev_agent_disabled');

  // Local-first routing: a successful Ollama response must not call the cloud.
  let localCalls = 0;
  const local = createDevAgentEngine({
    stateFile: path.join(temp, 'local.json'),
    env: baseEnv,
    fetchImpl: async (url, options) => {
      localCalls++;
      assert.equal(String(url), baseEnv.MAYZICAI_OLLAMA_URL);
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'fake-coder:1b');
      assert.equal(body.stream, false);
      assert.ok(body.messages.some(m => m.content.includes('You cannot execute tools')));
      return jsonResponse({ message: { content: 'Goal: Add a focused test.\nTests: Run node test.' } });
    }
  });
  result = await local.runCycle({ task: 'Review the Hindi locale test' });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'ollama');
  assert.equal(result.fileChangesApplied, false);
  assert.equal(result.testsExecuted, false);
  assert.equal(localCalls, 1);
  assert.equal(local.status().cloudCallsLast24Hours, 0);

  // An unsafe non-loopback local endpoint is rejected; no model/network request is sent to it.
  const unsafe = createDevAgentEngine({
    stateFile: path.join(temp, 'unsafe.json'),
    env: { ...baseEnv, MAYZICAI_OLLAMA_URL: 'http://example.com/api/chat' },
    fetchImpl: async () => { throw new Error('fetch must not run for unsafe local URL'); }
  });
  result = await unsafe.runCycle({ task: 'Review privacy boundary' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'provider_unavailable');

  // Cloud fallback is only used when both a dedicated key and explicit opt-in exist.
  let cloudCalls = 0;
  let currentTime = 1_800_000_000_000;
  const hybrid = createDevAgentEngine({
    stateFile: path.join(temp, 'hybrid.json'),
    env: { ...baseEnv, MAYZICAI_ALLOW_CLOUD_FALLBACK: 'true', MAYZICAI_OPENAI_API_KEY: 'test-only-key' },
    clock: () => currentTime,
    fetchImpl: async (url, options) => {
      if (String(url) === baseEnv.MAYZICAI_OLLAMA_URL) throw new Error('mock local model offline');
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.authorization, 'Bearer test-only-key');
      cloudCalls++;
      return jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Goal: Add one safe improvement.\nTests: Verify it locally.' }] }] });
    }
  });
  result = await hybrid.runCycle({ task: 'Plan better error handling' });
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'openai-responses');
  assert.equal(cloudCalls, 1);
  assert.equal(hybrid.status().cloudCallsLast24Hours, 1);

  // The durable daily budget guard must reject the 11th cloud request.
  for (let i = 1; i < DEV_AGENT_CLOUD_DAILY_LIMIT; i++) {
    currentTime += DEV_AGENT_CLOUD_COOLDOWN_MS + 1;
    result = await hybrid.runCycle({ task: 'Review task ' + i });
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(cloudCalls, DEV_AGENT_CLOUD_DAILY_LIMIT);
  currentTime += DEV_AGENT_CLOUD_COOLDOWN_MS + 1;
  result = await hybrid.runCycle({ task: 'This must be blocked by the daily cloud limit' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'provider_unavailable');
  assert.match(result.detail, /daily-call limit/i);
  assert.equal(cloudCalls, DEV_AGENT_CLOUD_DAILY_LIMIT);
  assert.equal(hybrid.status().cloudCallsLast24Hours, DEV_AGENT_CLOUD_DAILY_LIMIT);

  // Persisted limits survive a new engine instance.
  const reloaded = createDevAgentEngine({
    stateFile: path.join(temp, 'hybrid.json'),
    env: { ...baseEnv, MAYZICAI_ALLOW_CLOUD_FALLBACK: 'true', MAYZICAI_OPENAI_API_KEY: 'test-only-key' },
    clock: () => currentTime,
    fetchImpl: async () => { throw new Error('no request should be sent after budget is exhausted'); }
  });
  assert.equal(reloaded.status().cloudCallsLast24Hours, DEV_AGENT_CLOUD_DAILY_LIMIT);
  assert.equal((await reloaded.runCycle({ task: 'Budget should persist' })).ok, false);

  console.log('PASS: explicit enable gate, local-first routing, safe loopback URL allowlist, cloud opt-in/key isolation, response parsing, proposal-only boundaries, daily cloud budget, cooldown, and persisted call ledger.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
