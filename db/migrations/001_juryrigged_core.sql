CREATE TABLE IF NOT EXISTS court_schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS court_sessions (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  participants JSONB NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN (
    'case_prompt',
    'openings',
    'witness_exam',
    'evidence_reveal',
    'closings',
    'verdict_vote',
    'sentence_vote',
    'final_ruling'
  )),
  turn_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_court_sessions_created_at ON court_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_court_sessions_status ON court_sessions (status);

CREATE TABLE IF NOT EXISTS court_turns (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES court_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  role TEXT NOT NULL,
  phase TEXT NOT NULL,
  dialogue TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_court_turns_session ON court_turns (session_id, turn_number);
