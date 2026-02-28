# Coding Conventions

This project favors small, behavior-preserving changes that keep runtime flows easy to reason about.

## TypeScript and runtime safety

- Prefer explicit types over `any`.
- Keep nullable handling explicit (`undefined` vs `null`) at boundaries.
- Use small helpers for repeated transaction/query patterns.
- Validate user-facing inputs early and return typed error codes.

## Function design

- Keep functions focused on one responsibility.
- Extract shared setup/teardown logic into helpers when repeated 3+ times.
- Avoid hidden side effects; emit events in clearly named blocks.

## Constants and configuration

- Replace inline timing/token literals with semantic constants.
- Keep environment-driven behavior centralized and documented in `README.md`.
- Reuse shared defaults where possible to avoid drift.

## Naming

- Prefer intent-revealing names (`sessionsResponse` over `data`).
- Name booleans as predicates (`is*`, `has*`, `should*`).
- Keep domain terms consistent with `src/types.ts` and API docs.

## Tests and verification

- Update tests with refactors that intentionally change internal structure.
- Prefer behavior assertions over brittle source-shape checks.
- Run and pass:
  - `npm run lint`
  - `npm test`
