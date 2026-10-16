# MayzicAI Studio (local prototype)

## Start
From the MayzicAI workspace, run:

```powershell
node .\studio\server.mjs
```

Then open http://127.0.0.1:8787 in a browser. To use another local port, set `$env:MAYZICAI_PORT=8788` before starting.

## Modules
- Control Center: local service health and usage summary.
- Usage Meter: validates and appends usage events to `meter/data/usage.jsonl`.
- Agent Planner: saves task ideas to `meter/data/tasks.jsonl`; does not execute them.
- Auto Development Wheel: cycles across 500,000 lightweight logical agent IDs and emits one review-only proposal per second while enabled; keeps a bounded history and checkpoints locally.
- Smart Search: opens Google search pages for web, images, videos, or news.
- Developer API: documents local endpoints and example request.

## Local API
- `GET /api/health`
- `POST /api/chat` — calls the OpenAI Responses API from the local server.
- `GET /api/auto-wheel` — scheduler status, counters, and bounded proposal history.
- `POST /api/auto-wheel/start` and `POST /api/auto-wheel/stop` — enable or stop the one-second proposal wheel.
- `GET /api/usage`
- `POST /api/usage`
- `GET /api/tasks`
- `POST /api/tasks`

## Optional real AI provider setup
Chat works in demo mode until a provider key is configured. Never place an API key in `index.html`, JavaScript, a committed file, or a chat message.

In PowerShell, from the workspace folder, set the key in the current terminal session and then start Studio:

```powershell
$env:MAYZICAI_OPENAI_API_KEY = "paste-your-own-key-here"
$env:MAYZICAI_OPENAI_MODEL = "gpt-5.6-terra"
node .\studio\server.mjs
```

The key is read by the local server only and is not saved to project files. Keep the terminal session private. To return to unconfigured demo mode, close that terminal and launch Studio from a session without that environment variable. API use may incur charges on the provider account. The local app does not currently provide sign-in, multi-user isolation, or production rate limits, so do not expose it to the internet.

## Auto Development Wheel
Open **Auto Wheel** in Studio and press Start. It rotates through 500,000 logical agent IDs, schedules one lightweight proposal every second, and retains only the latest 60 proposals in memory/state. State is checkpointed to the ignored private file `meter/data/auto-wheel.json` every 30 cycles and when stopped; an enabled wheel resumes when Studio restarts. The 5,000-year value is a planning horizon only, not a promise that a computer or process can remain online for that long.

This is a low-memory proposal scheduler, not 500,000 concurrently running AI models. Its current proposal source is a small local checklist; it does not call an LLM each second, write source files, execute commands, send external actions, or push to Git. Review proposals and implement changes explicitly.

## Internal Dev Agent (hybrid foundation)

- `GET /api/dev-agent` reports provider readiness and budget status without exposing secrets.
- `GET /api/dev-agent/workspace` lists the explicit source-file allowlist and context limits.
- `POST /api/dev-agent/cycle` accepts `{ "task": "..." }` and asks one model for a reviewable engineering proposal.
- `POST /api/dev-agent/prepare-patch` accepts `{ "task": "...", "paths": ["studio/auto-wheel.mjs"] }`, reads only allowlisted source context, asks the model for a unified diff, verifies target paths and source hashes, then stages the inert patch under private runtime data. It never edits live files.
- `POST /api/dev-agent/patches/{id}/verify` validates and applies that diff to a disposable snapshot, syntax-checks touched JavaScript, parses locale JSON, and runs two fixed unit/security suites in permission-restricted Node processes. It does not run model-selected commands, edit live source files, apply to the platform, or publish.
- `GET /api/dev-agent/patches` lists staged artifacts; `GET /api/dev-agent/patches/{id}` retrieves a diff and verification report with integrity checking.
- The verification process uses Node's filesystem/child-process permission guard and blocks common network APIs. Treat this as defense-in-depth rather than a hardened OS/VM sandbox against deliberately malicious native-code exploits. The snapshot and tests are disposable; review every patch yourself.
- The engine tries a loopback-only Ollama endpoint first (`http://127.0.0.1:11434/api/chat`, model defaults to `qwen2.5-coder:3b`). Install Ollama and pull a coder model yourself before enabling real local inference.
- The feature is disabled by default. Set `MAYZICAI_DEV_AGENT_ENABLED=true` in the local server process to opt in.
- Cloud fallback is separately disabled by default. Only enable it with `MAYZICAI_ALLOW_CLOUD_FALLBACK=true` and a dedicated `MAYZICAI_OPENAI_API_KEY`. The engine never falls back to the generic `OPENAI_API_KEY`, limits cloud use to 10 calls per rolling 24 hours with a 60-second cooldown, and stores the budget ledger in ignored local runtime data. Failed cloud requests still count against the budget.
- Example local PowerShell setup (keep the key private; do not paste it into Studio/browser code):

```powershell
$env:MAYZICAI_DEV_AGENT_ENABLED = "true"
$env:MAYZICAI_OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
$env:MAYZICAI_OLLAMA_MODEL = "qwen2.5-coder:3b"
$env:MAYZICAI_ALLOW_CLOUD_FALLBACK = "false"
node .\\studio\\server.mjs
```

For cloud fallback, separately set `$env:MAYZICAI_ALLOW_CLOUD_FALLBACK = "true"` and `$env:MAYZICAI_OPENAI_API_KEY` in that same private terminal session. Model calls cost resources and may incur API charges. Do not connect this to the one-second wheel yet: the wheel is a lightweight scheduler, while actual model runs should be queued, budgeted, and verified independently.

## Test
```powershell
node --check .\studio\server.mjs
node --check .\studio\dev-agent-engine.mjs
node --check .\studio\dev-agent-engine.test.mjs
node --check .\studio\dev-workspace.mjs
node --check .\studio\dev-workspace.test.mjs
node --check .\studio\sandbox-verifier.mjs
node --check .\studio\test.mjs
node --check .\studio\browser-smoke.mjs
node .\studio\dev-agent-engine.test.mjs
node .\studio\dev-workspace.test.mjs
node .\studio\test.mjs
node .\studio\browser-smoke.mjs
```

The automated HTTP tests use a disposable isolated data directory and remove it afterward; they do not write to the normal private runtime ledger.

## Important limitations
This is an early local prototype, not a production service. A server-side OpenAI Responses adapter exists, but the currently verified instance has no dedicated API key configured, so real AI responses remain disabled until you explicitly configure it. The Auto Wheel produces local proposals only; it is not a self-modifying autonomous developer. There is no authentication, account isolation, production rate limiting, cloud connection, autonomous external actions, payments, or production billing. Keep the server bound to loopback; do not port-forward or expose it to the internet. Supabase is intentionally not connected.
