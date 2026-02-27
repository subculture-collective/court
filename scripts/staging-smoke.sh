#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:${API_HOST_PORT:-3001}}"
SMOKE_TOPIC="${SMOKE_TOPIC:-Did the defendant weaponize office glitter in the break room?}"
SMOKE_CASE_TYPE="${SMOKE_CASE_TYPE:-criminal}"
SMOKE_OUTPUT_PATH="${SMOKE_OUTPUT_PATH:-smoke-results.json}"

echo "[smoke] starting checks for ${API_BASE_URL}"

health_response="$(curl -fsS "${API_BASE_URL}/api/health")"
echo "[smoke] /api/health response: ${health_response}"

request_body="$(
    SMOKE_TOPIC="${SMOKE_TOPIC}" SMOKE_CASE_TYPE="${SMOKE_CASE_TYPE}" node -e "const topic = process.env.SMOKE_TOPIC; const caseType = process.env.SMOKE_CASE_TYPE || 'criminal'; process.stdout.write(JSON.stringify({ topic, caseType }));"
)"

session_response="$(
    curl -fsS -X POST "${API_BASE_URL}/api/court/sessions" \
        -H 'Content-Type: application/json' \
        -d "${request_body}"
)"
echo "[smoke] POST /api/court/sessions response: ${session_response}"

session_id="$(
    printf '%s' "${session_response}" | node -e "let input=''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { try { const parsed = JSON.parse(input); const id = parsed?.session?.id; if (!id) process.exit(1); process.stdout.write(id); } catch { process.exit(1); } });"
)"

if [[ -z "${session_id}" ]]; then
    echo "[smoke] failed to parse session id from bootstrap response"
    exit 1
fi

session_lookup="$(curl -fsS "${API_BASE_URL}/api/court/sessions/${session_id}")"
echo "[smoke] GET /api/court/sessions/${session_id} response: ${session_lookup}"

SMOKE_OUTPUT_PATH="${SMOKE_OUTPUT_PATH}" \
SMOKE_TOPIC="${SMOKE_TOPIC}" \
SMOKE_CASE_TYPE="${SMOKE_CASE_TYPE}" \
API_BASE_URL="${API_BASE_URL}" \
SESSION_ID="${session_id}" \
HEALTH_RESPONSE="${health_response}" \
node -e "const fs = require('node:fs'); const outputPath = process.env.SMOKE_OUTPUT_PATH; const payload = { checkedAt: new Date().toISOString(), apiBaseUrl: process.env.API_BASE_URL, topic: process.env.SMOKE_TOPIC, caseType: process.env.SMOKE_CASE_TYPE, sessionId: process.env.SESSION_ID, health: process.env.HEALTH_RESPONSE }; fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));"

echo "[smoke] checks passed (session=${session_id})"
echo "[smoke] result artifact written to ${SMOKE_OUTPUT_PATH}"
