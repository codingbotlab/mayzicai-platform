# MayzicAI Verification Plan

Use this checklist as a truthful record of verification. Mark an item complete only after running the test and recording the result/date where practical.

## Repository and publishing

- [x] Isolated workspace exists at `D:\META_D\02_PRODUCTS\MAYZICAI`.
- [x] Git repository is on `main` and connected to `origin`.
- [x] Public GitHub repository push completed.
- [x] GitHub Pages landing page returned HTTP 200 in the recorded deployment verification.
- [ ] Current working tree and staged changes are clean/reviewed before the next release.
- [ ] Secret/privacy scan run on the exact staged changes before every push.
- [ ] GitHub Actions workflow re-verified after future workflow changes.

## Landing page and dashboard

- [x] Landing page static checks passed in the initial verification.
- [x] Dashboard static checks passed in the initial verification.
- [x] Dashboard has a usage simulation control, cost estimate, revenue placeholder, and demo-mode warning.
- [ ] Browser layout and interaction manually tested on desktop and mobile.
- [ ] Accessibility and keyboard navigation reviewed.
- [ ] Automated browser tests run, if browser automation is available.

## Local usage meter — not implemented yet

- [ ] Local persistence backend implemented under the isolated workspace.
- [ ] Event validation and idempotency tested.
- [ ] Duplicate request IDs rejected or handled idempotently as designed.
- [ ] Invalid/non-positive quantities rejected.
- [ ] Restart test confirms intended local persistence behavior.
- [ ] Private database and logs are excluded from Git and absent from staged files.
- [ ] Dashboard reads real local meter data only after the backend and security boundary are tested.

## Future shared application backend (separate decision)

- [ ] Dedicated MayzicAI Supabase project approved and created, if needed.
- [ ] Migration reviewed and applied only to the dedicated project.
- [ ] Authentication, authorization, tenant isolation, and RLS tests pass.
- [ ] No existing Supabase project is modified without explicit approval.

## Billing and release gate

- [ ] Pricing and rounding rules documented.
- [ ] Server-side usage ingestion and authorization implemented.
- [ ] Rate/usage limits and audit behavior tested.
- [ ] No real payment collection until all applicable security, identity, pricing, and billing checks pass.

## Verification notes

Initial static checks and landing-page HTTP 200 verification were recorded before this checklist was revised. Browser interaction, local meter persistence, production billing, and Supabase integration have not been verified or implemented.
