# MayzicAI Meter — local-first

Private meter events and its database must remain on the development PC under `meter/data/`. Git tracks only meter source code and documentation, never the local ledger, raw usage logs, credentials, or customer records. The local persistence backend is not implemented yet; the dashboard currently uses demo-only in-memory values.
