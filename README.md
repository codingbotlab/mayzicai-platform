# MayzicAI — isolated workspace

Brand: MayzicAI
Tagline: Intelligence. Innovation. Independence.

## Goal
Build a family of native apps under one brand, with a shared admin console and a transparent usage-meter/billing foundation.

## Safety boundary
This workspace is new and isolated at D:\META_D\02_PRODUCTS\MAYZICAI. Existing projects and websites are not to be modified without explicit permission.

## Initial structure
- dashboard/ — first admin-console prototype
- meter/ — usage metering and billing design
- docs/ — architecture, decisions, and test notes

## Meter requirements
Track usage by product, user/account, service, unit, timestamp, and request ID. Keep an auditable event log. Separate usage measurement from price calculation. Enforce server-side limits, idempotency, and transparent user-facing pricing before charging real money.

## Build stages
1. Establish isolated workspace and requirements.
2. Prototype the dashboard UI with clearly labelled demo data.
3. Define meter event schema and test cases.
4. Choose backend after budget and hosting requirements are confirmed.
5. Implement authentication, server-side metering, and billing only after design review.
6. Test on a real device/environment before claiming success.

## Status
Workspace scaffold created. Dashboard is a UI prototype only; no real authentication, cloud connection, payment processing, or production billing is configured.
