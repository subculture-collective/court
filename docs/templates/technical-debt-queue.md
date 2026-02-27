# Technical Debt Queue Template

Use this queue to intake, triage, and prioritize debt discovered during incidents, releases, and retrospectives.

---

## Triage rubric

### Priority

- **P0** — Immediate risk to reliability/security/compliance; blocks release.
- **P1** — High operational risk or recurring incident driver; fix in next sprint.
- **P2** — Important quality/performance debt; schedule intentionally.
- **P3** — Nice-to-have cleanup/refactor/documentation debt.

### Effort bands

- **XS:** < 0.5 day
- **S:** 0.5-2 days
- **M:** 3-5 days
- **L:** 1-2 weeks
- **XL:** > 2 weeks

---

## Queue format

| ID | Title | Source | Priority | Effort | Risk if deferred | Owner | Target milestone | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEBT-000 | Example debt item | Retro YYYY-MM-DD | P2 | M | Medium | Team | Sprint N | Open |

---

## First draft queue from mock incident

| ID | Title | Source | Priority | Effort | Risk if deferred | Owner | Target milestone | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEBT-001 | Add SSE reconnect-storm synthetic check in staging smoke flow | Retro: SSE reconnect storm (2026-02-27) | P1 | S | Stream regressions may reoccur undetected | QA/Backend | Next sprint | Open |
| DEBT-002 | Add dedicated stream health probe history panel for operator dashboard | Retro: SSE reconnect storm (2026-02-27) | P2 | M | Slower diagnosis during live incidents | Ops tooling | Next sprint | Open |
| DEBT-003 | Harden reconnect backoff policy and document tunable defaults | Retro: SSE reconnect storm (2026-02-27) | P1 | M | Viewer churn during transient network issues | Backend | Next sprint | Open |
| DEBT-004 | Add operator canned emergency-recap script to runbook appendix | Retro: SSE reconnect storm (2026-02-27) | P3 | XS | Inconsistent incident comms quality | Ops | Sprint +1 | Open |
