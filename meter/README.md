# MayzicAI Usage Meter — Local First

## Goal

Build an auditable usage ledger for MayzicAI products, with usage measurement kept separate from price calculation and billing.

## Data boundary

- Private event records, database files, and raw logs stay on the development PC under `meter/data/` and `meter/logs/`.
- These directories are excluded from Git. Do not commit real account identifiers, customer histories, payment data, credentials, or raw event exports.
- Public tests must use synthetic data only.
- Supabase is not the store for the private meter ledger.

## Planned event fields

A usage event should identify the product, service, unit, positive quantity, event time, and unique request ID. Account linkage and metadata must be minimized and access-controlled. Cost estimates must be clearly distinguished from amounts actually charged.

## Implementation status

The local persistence backend and ingestion endpoint are **not implemented**. The dashboard currently uses demo-only in-memory values. The SQL file in `supabase/migrations/` is a design draft and has not been applied to a Supabase project.

## Implementation gates

1. Review event schema and retention requirements.
2. Choose a local database and access boundary.
3. Implement validated, idempotent event ingestion.
4. Add automated tests for duplicates, invalid quantities, persistence, and failure cases.
5. Verify the local data directory is ignored and absent from staged files.
6. Connect the dashboard only after the local API and privacy boundary pass tests.
7. Do not implement real billing until identity, authorization, pricing, limits, and audit controls are reviewed.
