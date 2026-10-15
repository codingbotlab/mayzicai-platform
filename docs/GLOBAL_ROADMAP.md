# MayzicAI Global-First Roadmap

## Product decision
- Vision: global multi-product AI ecosystem.
- First locales: English (en) and Hindi (hi); architecture ready for additional locales.
- Clients: responsive web and native Android planned together, sharing versioned API contracts.
- Execution policy: local tests first, review the diff, then commit/push only reviewed changes.
- Scope: `D:\META_D\02_PRODUCTS\MAYZICAI` only; no existing project or Supabase project modifications.

## Current verified base
- MayzicAI public landing page was previously deployed and verified.
- Local Studio prototype includes Control Center, local JSONL usage meter, task planner, search launchpad and local API guide.
- Previous local automated tests passed for health, usage event recording, duplicate IDs, invalid quantity, negative cost, task planning and dashboard HTTP 200.
- No authentication, real AI providers, autonomous actions, production billing or cloud integration exist yet.

## Delivery roadmap

### 0. Architecture & governance
- [x] Capture the global-first direction.
- [ ] Review `docs/GLOBAL_ARCHITECTURE.md` and `docs/DECISIONS.md`.
- [ ] Check staged/unstaged diffs and private-data boundaries.
- [ ] No push until review is complete.

### 1. Global-ready web foundation
- Add locale catalog files for English and Hindi.
- Add language selector with deterministic fallback and locale persistence.
- Use message IDs, UTF-8 and locale-aware formatting.
- Add responsive/accessibility checks and automated locale tests.
- Keep all external integrations disabled until individually designed and tested.

### 2. Native Android foundation
- Choose native stack after build/toolchain/device check.
- Implement app shell, language selection, secure session design and shared API contract.
- Test install, lifecycle, network failures, accessibility and no-PC-dependency requirement.

### 3. Identity and shared platform services
- Design authentication, user/account isolation, API versioning, authorization, rate limiting and audit logging.
- Only create a dedicated shared backend after explicit approval.
- Never modify existing Supabase projects without approval.

### 4. Product integrations
- Search adapters, model adapters, agent tool registry, explicit action approvals and audit history.
- Provider-specific capability and language-quality checks.
- Server-authoritative metering and quotas before billing.

### 5. Global release readiness
- Security/privacy review, dependency review, localization review, backup/restore, error monitoring, cost controls and support process.
- Add further locales only after quality checks.
- Payments remain disabled until authorization, metering, pricing, reconciliation and refund tests pass.

## Acceptance gates
- English and Hindi strings are complete for each shipped screen.
- Language switch works and no user-visible raw message IDs appear.
- Unicode, long text, locale date/number formatting and keyboard/mobile layouts pass.
- API contract tests and relevant client tests pass.
- Secrets and local meter data are absent from staged changes.
- All claims in docs match what was actually built and tested.
