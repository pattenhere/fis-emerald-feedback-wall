CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request_created
  ON feature_request_votes(feature_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_request_votes_session
  ON feature_request_votes(session_id);
