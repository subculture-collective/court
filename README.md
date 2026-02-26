# Improv Court POC (standalone)

This is a **standalone root-level implementation** of the Improv Court proof of concept.
It does **not** depend on `subcult-corp` at runtime.

## What is implemented

- Multi-agent courtroom roles (judge, prosecutor, defense, witnesses, bailiff)
- Phase-based court flow:
  - `case_prompt`
  - `openings`
  - `witness_exam`
  - `closings`
  - `verdict_vote`
  - `sentence_vote`
  - `final_ruling`
- Live SSE stream per session
- Jury verdict and sentence voting endpoints
- Minimal stripped web UI (`public/index.html`)

## Environment

Copy `.env.example` to `.env` and set values as needed.

Key variables:

- `OPENROUTER_API_KEY` (optional for local mock mode; required for real LLM calls)
- `LLM_MODEL`
- `PORT`
- `VERDICT_VOTE_WINDOW_MS`
- `SENTENCE_VOTE_WINDOW_MS`

If `OPENROUTER_API_KEY` is empty, the app falls back to deterministic mock dialogue.

## Run

1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`
3. Open:
   - `http://localhost:3001`

## API

- `GET /api/health`
- `GET /api/court/sessions`
- `GET /api/court/sessions/:id`
- `POST /api/court/sessions`
- `POST /api/court/sessions/:id/vote`
- `POST /api/court/sessions/:id/phase`
- `GET /api/court/sessions/:id/stream` (SSE)

## Notes

- The existing `subcult-corp` directory is used only as a **reference source** and is not imported.
- Core reusable ideas were copied into `src/` as standalone modules.
