# MayzicAI Platform

**Tagline:** Intelligence. Innovation. Independence.

MayzicAI is an isolated workspace for building a family of AI-powered native apps, developer tools, and shared platform services.

## Project status

- **Brand landing page:** Published with GitHub Pages.
- **Admin dashboard:** Static UI prototype; displayed metrics are simulated demo data.
- **Usage meter:** Requirements and schema draft exist; local persistence and ingestion backend are not implemented.
- **Authentication, billing, and payments:** Not implemented.
- **Supabase:** Not connected; no migration has been applied to any Supabase project.

Do not interpret prototypes, schema drafts, or planned features as production-ready services.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Public MayzicAI landing page |
| `dashboard/` | Admin-console UI prototype |
| `meter/` | Local-first usage meter documentation and future implementation |
| `meter/data/` | Private local meter data; never commit |
| `meter/logs/` | Private local logs; never commit |
| `supabase/migrations/` | Reviewed SQL drafts; not automatically applied |
| `docs/` | Architecture, decisions, and engineering workflow |
| `PRIVACY.md` | Data boundaries and publishing rules |
| `TEST_PLAN.md` | Verification status and acceptance checks |

## Non-negotiable boundaries

1. Work only in `D:\META_D\02_PRODUCTS\MAYZICAI` unless explicitly authorized otherwise.
2. Do not modify other projects, websites, or existing Supabase projects without explicit permission.
3. Keep the usage ledger, local database, logs, customer records, and payment details on the development PC.
4. The GitHub repository is public. Publish only reviewed source, tests, and documentation that contain no secrets or private data.
5. Test locally before committing or pushing. Never claim a test passed unless it was actually run.
6. Never collect real payments until identity, authorization, server-side metering, pricing, and billing tests are complete.

## Development workflow

1. Read `docs/GIT_WORKFLOW.md` and `TEST_PLAN.md` before making changes.
2. Check `git status` and the current branch before editing.
3. Make a focused change and review `git diff`.
4. Run relevant local checks and update test documentation with actual results.
5. Scan staged changes for secrets and private data.
6. Commit with a clear conventional commit message, then push only reviewed changes.

## Quick Git commands

```powershell
git status --short --branch
git diff --check
git diff
git log -5 --oneline --decorate
```

See [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) for the full process.

## Public links

- Live landing page: https://codingbotlab.github.io/mayzicai-platform/
- Public source repository: https://github.com/codingbotlab/mayzicai-platform

## License and brand

No license or trademark clearance is implied by this scaffold. Add a license only after deciding how the public source may be reused. Check name and domain availability separately before making legal or commercial claims.
