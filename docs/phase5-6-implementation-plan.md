# Phase 5 & 6 Implementation Plan (Roadmap #35)

Date: 2026-02-27

## Objective

Deliver all open roadmap work in **Phase 5 (Release & Operations)** and **Phase 6 (Post-launch Polish)** in dependency order, with production-grade quality gates and operational readiness.

## Dependency order

```text
#29 -> #30 -> #31 -> (#33 + #34) -> #32
```

- `#29` blocks `#30`, `#31`, and `#32`
- `#30` blocks `#31` and `#33`
- `#31` blocks `#34` and `#32`
- `#33` blocks `#32`

## Phase 5 — Release & operations

### #29 Release: Staging deployment workflow + env matrix + smoke checks

#### Deliverables

- GitHub Actions workflow for staging deployment (manual trigger).
- Environment matrix (`mock`, `live`) with credential contract enforcement.
- Post-deploy smoke checks for:
  - `GET /api/health`
  - `POST /api/court/sessions` (bootstrap path)
- Deployment metadata capture (start/end status + revision context).
- Rollback guidance + trial checklist in ops docs.

#### File targets

- `.github/workflows/staging-deploy.yml`
- `scripts/staging-smoke.sh`
- `docs/ops-runbook.md`
- `README.md`
- `package.json`

#### Verification

- Workflow logs contain smoke check output.
- Artifact contains deploy metadata and compose logs.
- Rollback trial checklist completed in docs.

---

### #30 Runtime dashboards and alerts for session health/moderation

#### Deliverables

- Dashboard definitions for core SLIs/SLO proxies:
  - session completion
  - vote latency
  - moderation actions
  - stream/API health
- Alert threshold configurations with runbook links.
- Synthetic alert validation instructions/tests.

#### File targets

- `ops/dashboards/*`
- `ops/alerts/*`
- `docs/ops-runbook.md`
- `README.md`

#### Verification

- Simulated failure conditions trigger expected alert payloads.
- Dashboard queries align with event taxonomy (`docs/event-taxonomy.md`).

---

### #31 Operator runbook: live controls + mistrial + incident response

#### Deliverables

- Expanded runbook covering startup, live operation, and shutdown.
- Incident section with at least 5 common failure scenarios.
- Mistrial fallback, emergency recap, and witness-swap procedures.
- Dashboard/alert panel references embedded into procedures.

#### File targets

- `docs/operator-runbook.md`
- `README.md`

#### Verification

- Tabletop drill notes captured and missing steps patched.

## Phase 6 — Post-launch polish

### #33 Token budget and summary cadence controls

#### Deliverables

- Runtime knobs for per-role token caps and recap cadence controls.
- Safe defaults balancing quality and cost.
- Session-level cost-estimate telemetry.
- New telemetry events:
  - `token_budget_applied`
  - session token estimate event

#### File targets

- `src/court/orchestrator.ts`
- `src/court/witness-caps.ts` (or dedicated budget module)
- `src/types.ts`
- `src/events.ts`
- `dashboard/src/components/Analytics.tsx`
- `docs/api.md`
- `docs/event-taxonomy.md`

#### Verification

- Unit tests for budget enforcement.
- Integration test: phase completion remains intact under stricter caps.

---

### #34 Onboarding/catch-up panel for new viewers

#### Deliverables

- Compact viewer-facing catch-up panel:
  - “case so far” summary
  - current phase/jury step status
- Refresh on phase transitions.
- Toggle without layout breakage.
- Aggregate-only telemetry for toggle visibility usage.

#### File targets

- `public/index.html`
- `public/app.js`
- `docs/operator-runbook.md`

#### Verification

- Component/behavior tests for panel rendering and toggle.
- Integration test for phase-change refresh behavior.

---

### #32 Post-launch retrospective template + technical debt queue

#### Deliverables

- Reusable retrospective template.
- Structured debt intake queue format with triage rubric (P0-P3 + effort).
- First filled example draft from mock incident.

#### File targets

- `docs/templates/retrospective-template.md`
- `docs/templates/technical-debt-queue.md`
- `README.md`

#### Verification

- Trial retrospective run confirms template usability.

## PR slicing strategy

1. PR-A: `#29` staging workflow + smoke + rollback docs
2. PR-B: `#30` dashboards + alerts + alert simulation checks
3. PR-C: `#31` operator runbook expansion + drill checklist
4. PR-D: `#33` token budget/cadence controls + telemetry + tests
5. PR-E: `#34` onboarding/catch-up panel + telemetry + tests
6. PR-F: `#32` retrospective/debt templates + example draft

## Current execution status

- Plan documented ✅
- Implementation started with `#29` ✅
