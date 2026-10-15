# MayzicAI Verification Plan

Update this file only with checks that were actually run. Last local prototype test: 2026-10-15.

## Repository and publishing
- [x] Isolated workspace at `D:\META_D\02_PRODUCTS\MAYZICAI`.
- [x] Public GitHub repository and Pages landing page previously verified.
- [ ] Studio prototype reviewed and explicitly staged before publication.
- [ ] Secret/privacy scan of exact staged changes before every push.
- [ ] GitHub Pages and workflow rechecked after any deploy changes.

## MayzicAI Studio local prototype
- [x] Node syntax checks passed for `studio/server.mjs` and `studio/test.mjs`.
- [x] Automated HTTP test passed: health endpoint, local usage event creation, duplicate request idempotency, zero quantity rejection, negative cost rejection, local task planning, and dashboard HTTP 200.
- [x] Private runtime ledger path is ignored by Git (`meter/data/usage.jsonl`).
- [x] Browser language switching exercised in headless Chrome; Hindi/English DOM language, headings, saved preference and form controls verified on 2026-10-15.
- [x] Product home cards rendered in Chrome; four product tiles, status labels and navigation buttons verified in English and Hindi.
- [x] Chat UI exercised in Chrome with no dedicated key: Hindi nav/title/placeholder, error state and enabled form recovery verified.
- [x] `/api/chat` missing-key response, cross-origin rejection, inline JavaScript parsing and locale JSON parsing tested.
- [x] Auto Wheel verified: 500,000 logical agents, 5,000-year horizon metadata, 1-second live tick, 60-entry bounded history, state persistence, start/stop controls, and cross-origin control rejection.
- [x] Chrome end-to-end test exercised Auto Wheel start → first proposal appears → stop; no source file or command execution triggered.
- [x] Successful mock-provider response verified by HTTP test and Chrome end-to-end test (Hindi input → local backend → mock provider → response rendered in chat); dummy key only, no real AI call.
- [ ] Successful real-provider response still unverified because no dedicated MayzicAI API key is configured.
- [ ] Responsive layout and accessibility/keyboard navigation manually reviewed.
- [ ] Restart persistence manually verified outside automated test.
- [x] HTML inline JavaScript independently syntax-checked.

## Boundaries and limitations
- The server binds to `127.0.0.1` only; do not expose it to a network.
- Usage ledger is a private local JSONL file, not a production billing database.
- Agent module saves plans only; it does not execute external actions.
- Search module launches provider search pages; it does not aggregate/proxy results.
- No authentication, account isolation, or production rate limiting; dedicated AI key is not configured; no payments or production billing.
- No Supabase connection or migration applied; no existing project modified.

## Future release gates
- [ ] Browser and restart tests pass.
- [ ] Review staged files and scan for secrets/private data.
- [ ] Commit and push only reviewed source/tests/docs.
- [ ] If shared backend is later required, obtain approval for a dedicated project, then review authentication, authorization, tenant isolation and RLS before applying migrations.
- [ ] Never collect real payments until identity, authorization, pricing, metering, and billing tests pass.
