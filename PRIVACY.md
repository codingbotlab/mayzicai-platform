# MayzicAI Privacy and Publishing Rules

## Data classification

### Public repository may contain
- Reviewed application source code and tests.
- Architecture documents and non-secret schema/migration drafts.
- Sanitized sample fixtures with synthetic data only.
- `.env.example` files containing placeholder values only.

### Must remain private on the development PC
- Meter event ledger and local database files.
- Raw usage logs, identifiable usage histories, customer/account records, and personal data.
- Payment details, credentials, access tokens, API keys, passwords, private certificates, and real `.env` files.
- Database dumps or exports containing real records.

The repository is **public**. Treat every committed file and its Git history as publicly accessible. Deleting a secret in a later commit does not remove it from earlier history; rotate exposed credentials and follow a history-cleanup procedure if a secret is ever committed.

## Local-only usage meter

- The private meter ledger and local database must remain under `meter/data/` on Mayank's PC.
- Private meter logs must remain under `meter/logs/`.
- `.gitignore` must exclude local data, logs, database files, secrets, and generated output.
- Never commit raw meter events. If test fixtures are needed, use synthetic, non-identifying examples.
- Review `git status`, `git diff --cached`, and staged file names before every push.

## Supabase boundary

Supabase is not currently connected to this workspace. If it is needed later, it is for shared application data only unless a new design is explicitly reviewed. The local meter ledger stays on this PC. Do not apply migrations to existing Supabase projects. Any future dedicated project requires reviewed authentication, authorization, tenant isolation, and row-level security before real data is stored.

## Current implementation truth

The dashboard currently displays simulated values in browser memory. It does not persist meter events to a local database. A local meter backend, production authentication, cloud connection, payment processing, and production billing are not implemented. This document defines rules; it is not evidence that those controls have all been technically enforced.
