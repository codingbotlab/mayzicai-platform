# MayzicAI Global-First Architecture

**Decision status:** Architecture proposal for implementation; not a claim that the complete system exists.
**Vision:** Multi-product AI ecosystem, designed for global use.
**First language release:** English and Hindi.
**Clients:** Responsive web and Android native app planned together.
**Core rule:** Isolated MayzicAI workspace only. No changes to other projects or existing Supabase projects without explicit approval.

## 1. Product family

- **MayzicAI Studio / Control Center:** product launchpad, account and privacy settings, usage overview.
- **MayzicAI Agent:** plans tasks, calls explicitly enabled tools, asks before consequential external actions, records an audit trail.
- **MayzicAI Search:** web and provider-backed image/video/news search; results attribution and provider policies must be respected.
- **MayzicAI Chat:** conversations, history controls, model/provider selection where supported.
- **MayzicAI Developer:** documented APIs, SDKs, usage metering and developer keys (future; secrets must be hashed/managed securely).
- **MayzicAI Usage:** local development ledger initially; production metering must be server-authoritative and account-isolated.

## 2. Logical architecture

```text
Responsive Web (accessible UI)       Android Native App
               |                            |
               +---- shared API contracts--+
                              |
                 API / Identity Boundary
                 (future; auth required)
                              |
             +----------------+----------------+
             |                |                |
         Agent Orchestrator  Search Adapters   Chat/Model Adapters
             |                |                |
       Permissioned Tools   External Search   Model Providers
             |
       Audit / Task Events
                              |
                    Usage Metering Service
                              |
               Private Local Dev Ledger first
                              |
              Dedicated shared backend later
              (only after explicit approval)
```

This is a target logical design, not a currently deployed distributed system. The current prototype runs only on loopback and has no authentication or external provider integration.

## 3. Internationalization (i18n)

- Use stable message IDs, not hardcoded UI copy, e.g. `nav.home`, `agent.plan.submit`.
- Store English as the source locale and Hindi as the first translated locale.
- Use Unicode UTF-8 throughout; do not assume Latin-only input or fixed text widths.
- Format dates, times, numbers, and currencies with locale-aware APIs; store timestamps in UTC and store currency codes with monetary values.
- Prefer BCP 47 language tags such as `en` and `hi`; allow user choice and a browser/device-language fallback.
- Keep language selection independent of content language and AI response language.
- Prepare for right-to-left layout (Arabic) with logical CSS properties; do not claim RTL support until tested.
- Search, speech, OCR, translation and model capabilities must be declared per provider/language and verified; translated UI does not guarantee model quality.
- Never machine-translate legal, billing, privacy or safety-critical text without human review.
- Test English/Hindi switching, persistence, Unicode, keyboard access, small screens, long strings and mixed-script input.

## 4. Web + Android strategy

- Web: responsive, semantic and accessible interface; keyboard operation, visible focus and useful error states.
- Android: native Kotlin/Jetpack Compose is the default candidate; decide final stack after a device/build feasibility check.
- Define versioned API contracts and shared product behavior first; do not duplicate business rules separately in each client.
- Native app stores only minimal session state; secrets and authoritative entitlements must remain server-side in a future authenticated backend.
- Support slow networks, retries, idempotency, offline-friendly drafts where appropriate, and user-controlled notifications.
- Do not require a desktop connection for the intended independent Android app.

## 5. Privacy, security and safety

- Classify data: public, account, sensitive, secret. Keep local development ledger/logs out of Git.
- No API keys or credentials in web assets, Android APKs, public repo, or logs.
- Add authentication, authorization, per-user isolation, rate limiting, request size limits, audit events and deletion/export controls before real users.
- Agent actions must use an allow-listed tool registry, scoped permissions, explicit confirmation for consequential actions, timeouts, and traceable results.
- Treat webpage/search/document content as untrusted input; never allow it to override system policy or trigger tools by itself.
- Apply data minimization, retention controls, encryption in transit, secure credential storage, dependency updates and incident response.
- Local loopback prototype is not safe for internet exposure; do not port-forward it.

## 6. Usage and monetization

- Prototype meter stores local JSONL events and is for development only.
- Define units and pricing, currency/rounding rules, idempotency, quota behavior and correction/audit policy before billing.
- Production usage must be authorized and recorded on a trusted server, not accepted as client-reported truth.
- Keep the private local ledger separate from any shared application database.
- No real payments until auth, authorization, pricing, metering, reconciliation, refund and security tests pass.

## 7. Data/backend decision

No Supabase project is created or modified by this proposal. The existing SQL draft is not applied. If a shared backend becomes necessary, request approval for a dedicated MayzicAI project and review auth, tenant isolation, RLS, backups, data region, migrations and rollback before any real data is stored.

## 8. Delivery phases and gates

### Phase 0 — Foundation (current)
- [x] Isolated workspace and public brand landing page.
- [x] Local-only Studio prototype with usage event and task-plan endpoints.
- [ ] Reviewed architecture and decisions.
- [ ] UI i18n foundation and English/Hindi message catalogs.
- [ ] Unit/integration test baseline and secret scan.

### Phase 1 — Web MVP
- Build reusable accessible UI, locale switch, settings and product shell.
- Keep agent as planner until tool permissions and provider connectors exist.
- Build search provider adapter only after terms, attribution, quotas and error handling are reviewed.
- Gate: language, security, responsive UI, API and persistence tests pass.

### Phase 2 — Android MVP
- Native Android app with English/Hindi, secure session handling and API contracts.
- Verify on target Android versions/devices; do not call it independent until it works without a PC connection.
- Gate: install/build, lifecycle, network error, permission, privacy and accessibility tests pass.

### Phase 3 — Shared services
- Only after approval: dedicated backend, authentication, account isolation, policy enforcement, rate limiting and server-authoritative metering.
- Gate: security review, RLS/authorization tests, migration rollback, backup/restore and audit checks.

### Phase 4 — AI products and monetization
- Add model/search adapters, agent tools, usage quotas and billing only after each connector is independently tested.
- Add more locales based on actual quality review and user demand.
- Gate: quality evaluations, cost controls, abuse handling, localization review and billing reconciliation.

## 9. Definition of done

A feature is not complete because a page renders. Completion requires a written acceptance test, reproducible local run, passing automated tests, relevant manual browser/device check, privacy review, failure-path handling, docs update, and a reviewed Git diff. Push only after explicit review; do not push as part of this architecture step.
