# Architecture Decisions

## ADR-0001 — Isolated workspace
**Status:** Accepted. All implementation work is limited to `D:\META_D\02_PRODUCTS\MAYZICAI`. Other projects, websites and Supabase projects remain untouched without explicit approval.

## ADR-0002 — Local-first development data
**Status:** Accepted. Private usage ledger, logs and local runtime data remain on the development PC and are excluded from the public Git repository. Local prototype data is not production billing truth.

## ADR-0003 — Global-first product direction
**Status:** Accepted. MayzicAI is planned as a multi-product AI ecosystem. First UI locales are English and Hindi; architecture should allow additional locales through message catalogs and locale-aware formatting.

## ADR-0004 — Web and Android together at product-design level
**Status:** Accepted. Web and native Android are planned together with shared, versioned API contracts and consistent product behavior. Implementation may be phased according to test results and toolchain readiness. The Android app must not depend on a PC connection for its intended independent operation.

## ADR-0005 — Local tests before publication
**Status:** Accepted. Run local checks, inspect exact diffs, scan staged changes for secrets/private data, and only then ask for or proceed with review-approved commit/push. No automatic push in this task.

## ADR-0006 — Shared backend needs separate approval
**Status:** Accepted. No new Supabase project is created and no existing project or migration is touched as part of the architecture plan. A dedicated backend requires explicit approval and a reviewed security design.
