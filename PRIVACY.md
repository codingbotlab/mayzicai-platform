# MayzicAI data and repository privacy rules

## Local-only meter
- The usage meter's private event ledger and local database stay on Mayank's PC.
- Keep private runtime data under meter/data/ (ignored by Git).
- Keep meter logs under meter/logs/ (ignored by Git).
- Never commit user records, customer usage histories, payment details, access tokens, API keys, passwords, .env files, or database dumps.
- Git may contain source code, tests, documentation, non-secret schema/migrations, and .env.example with placeholder values only.

## Public vs private information
- Treat customer/account data and identifiable usage events as private.
- Only publish data that is intentionally public and reviewed for personal data/secrets.
- Public data should be curated into a separate export or fixture; do not publish raw meter events.
- A private GitHub repository is recommended for early development. If the repository is made public later, review the full commit history and repository contents first. Deleting a file in a later commit does not remove it from earlier history.

## Supabase
- Supabase is for the app's shared application data only if/when needed; the local meter ledger stays on this PC.
- Do not apply migrations to existing Supabase projects.
- Any future Supabase project must be dedicated to MayzicAI, with authentication and row-level security designed before storing real user data.

## Current implementation status
The current dashboard uses demo values in browser memory. It does not yet write to a local database, and the meter backend is not implemented. This document describes the required privacy boundary, not a claim that local persistence already works.
