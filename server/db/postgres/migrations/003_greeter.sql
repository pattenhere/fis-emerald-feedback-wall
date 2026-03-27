CREATE TABLE IF NOT EXISTS greeter_questions (
  question_id BIGSERIAL PRIMARY KEY,
  event_slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_slug, position)
);

CREATE TABLE IF NOT EXISTS greeter_answers (
  answer_id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES greeter_questions(question_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, position)
);

CREATE INDEX IF NOT EXISTS idx_greeter_answers_question_position
  ON greeter_answers(question_id, position);

CREATE TABLE IF NOT EXISTS greeter_routes (
  route_id BIGSERIAL PRIMARY KEY,
  event_slug TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  condition_q1 TEXT,
  condition_q2 TEXT,
  condition_q3 TEXT,
  condition_q4 TEXT,
  primary_category TEXT NOT NULL,
  primary_title TEXT NOT NULL,
  primary_products TEXT,
  primary_description TEXT,
  secondary_category TEXT,
  secondary_title TEXT,
  secondary_products TEXT,
  secondary_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_greeter_routes_event_priority
  ON greeter_routes(event_slug, priority, route_id);

CREATE TABLE IF NOT EXISTS greeter_sessions (
  session_id BIGSERIAL PRIMARY KEY,
  event_slug TEXT NOT NULL,
  answer_q1 TEXT,
  answer_q2 TEXT,
  answer_q3 TEXT,
  answer_q4 TEXT,
  route_id BIGINT REFERENCES greeter_routes(route_id),
  feedback_q1 TEXT,
  feedback_q2 TEXT,
  feedback_q3 TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_greeter_sessions_event_completed
  ON greeter_sessions(event_slug, completed_at DESC);
