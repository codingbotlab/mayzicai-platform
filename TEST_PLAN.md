# Local verification checklist

- [x] Isolated MayzicAI workspace exists.
- [x] Dashboard HTML file exists.
- [x] Dashboard contains a usage simulation control, cost estimate, revenue placeholder, and demo-mode warning.
- [ ] Browser interaction manually verified.
- [ ] Automated browser test (if Playwright/browser available).
- [ ] Dedicated Supabase project created and status healthy.
- [ ] Migration applied to the dedicated project.
- [ ] SQL smoke tests: insert event, reject duplicate request_id, reject non-positive quantity.
- [ ] Authentication, tenant isolation, and RLS policies designed and tested.
- [ ] Meter ingestion endpoint implemented server-side.
- [ ] Git remote configured, push completed, and commit URL verified.

## Important
No production billing or real payment collection until pricing, identity model, authorization, and server-side event ingestion are implemented and tested.
