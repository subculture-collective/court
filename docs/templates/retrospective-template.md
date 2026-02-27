# Incident Retrospective Template

Use this template for post-incident learning after staging or production events.

---

## 1) Metadata

- **Incident title:**
- **Date/time (UTC):**
- **Environment:** staging | production
- **Severity:** Sev-1 | Sev-2 | Sev-3
- **Incident commander:**
- **Scribe:**
- **Status:** Draft | Final

## 2) Executive summary

- What happened (2-3 sentences)?
- Who/what was impacted?
- How was service restored?

## 3) Timeline (UTC)

| Time | Event | Owner |
| --- | --- | --- |
| 00:00 | Detection signal observed | |
| 00:00 | Initial mitigation started | |
| 00:00 | Root cause identified | |
| 00:00 | Recovery validated | |

## 4) Customer/operator impact

- **User-visible impact:**
- **Duration of impact:**
- **Scope:**
- **Fallbacks used:**

## 5) Detection and response quality

- Which dashboard panel(s) detected it first?
- Which alert(s) fired?
- What worked well in response?
- What slowed recovery?

## 6) Root cause analysis

- **Primary cause:**
- **Contributing factors:**
- **Why this escaped prevention:**

## 7) Corrective and preventive actions (CAPA)

| Action | Owner | Priority (P0-P3) | ETA | Status |
| --- | --- | --- | --- | --- |
| | | | | |

## 8) What we learned

- **Keep doing:**
- **Stop doing:**
- **Start doing:**

## 9) Follow-up links

- PRs:
- Tickets:
- Logs/dashboards:

---

## Mock incident example draft (filled)

### Metadata

- **Incident title:** Staging SSE reconnect storm during verdict phase
- **Date/time (UTC):** 2026-02-27 18:05-18:21
- **Environment:** staging
- **Severity:** Sev-2
- **Incident commander:** Ops primary
- **Scribe:** QA on-call
- **Status:** Draft

### Executive summary

During a staged live-round rehearsal, SSE clients repeatedly disconnected and reconnected during `verdict_vote`, causing confusion for late-joining viewers. The API remained healthy, but stream reliability dropped below target. Service was stabilized by restarting the API process and validating stream health and vote endpoints.

### Timeline (UTC)

| Time | Event | Owner |
| --- | --- | --- |
| 18:05 | Alert `stream_connectivity_degraded` fired | Ops primary |
| 18:07 | Stream probe confirmed low connect-success ratio | QA on-call |
| 18:10 | API restart performed | Ops primary |
| 18:13 | Stream success ratio recovered | QA on-call |
| 18:21 | Incident closed after sustained green metrics | Incident commander |

### Customer/operator impact

- **User-visible impact:** Some viewers saw stale transcript state and delayed vote updates.
- **Duration of impact:** ~16 minutes.
- **Scope:** Rehearsal viewers in staging.
- **Fallbacks used:** Manual emergency recap + catch-up panel kept visible.

### Detection and response quality

- First detection came from panel `stream_and_api_health` and alert `stream_connectivity_degraded`.
- Response was fast, but playbook lacked an explicit reconnect-storm checklist at the time.

### Root cause analysis

- **Primary cause:** SSE transport instability under rapid reconnect cycles.
- **Contributing factors:** Reconnect backoff tuning was too aggressive for transient network flaps.
- **Why this escaped prevention:** No synthetic reconnect-storm scenario had been rehearsed before.

### CAPA

| Action | Owner | Priority (P0-P3) | ETA (effort band) | Status |
| --- | --- | --- | --- | --- |
| Add reconnect-storm synthetic scenario | QA | P1 | M | Open |
| Tune SSE reconnect backoff profile | Backend | P1 | M | Open |
| Add operator comms macro for emergency recap | Ops | P2 | S | Open |

### What we learned

- **Keep doing:** Pair dashboard panel checks with runbook-linked alerts.
- **Stop doing:** Assuming healthy `/api/health` implies healthy SSE stream quality.
- **Start doing:** Monthly tabletop drills for stream-specific failure modes.
