# MayzicAI Architecture Decision Records

This file records decisions that constrain future implementation. Add a dated entry when a decision changes.

## ADR-001 — Isolated workspace

- **Status:** Accepted
- **Decision:** Keep MayzicAI in `D:\META_D\02_PRODUCTS\MAYZICAI` and do not modify unrelated projects without explicit permission.
- **Reason:** Avoid accidental cross-project changes and keep testing reproducible.

## ADR-002 — Public source, private runtime data

- **Status:** Accepted
- **Decision:** Keep the GitHub repository public, but publish only reviewed source, documentation, tests, and synthetic fixtures. The local meter ledger, database, logs, credentials, customer records, and payment data remain on the development PC.
- **Reason:** Support transparent public development without exposing operational or personal data.
- **Consequence:** Every commit and historical version must be treated as public; staged-content review and secret scanning are required before pushing.

## ADR-003 — Local meter before cloud integration

- **Status:** Accepted
- **Decision:** Implement and test local usage metering first. Supabase, if later approved, is for shared app data and must use a dedicated MayzicAI project. Do not apply migrations to existing Supabase projects.
- **Reason:** Keep private usage records local and avoid accidental changes to unrelated databases.

## ADR-004 — Demo values are not production data

- **Status:** Accepted
- **Decision:** Clearly label prototype values as simulated. Do not represent the dashboard as a functioning billing system until server-side ingestion, authorization, persistence, pricing, and tests exist.
- **Reason:** Prevent misleading usage, cost, and revenue claims.
