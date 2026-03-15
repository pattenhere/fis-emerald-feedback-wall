CREATE TABLE IF NOT EXISTS categories (
  category_id BIGSERIAL PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS subcategories (
  subcategory_id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(category_id),
  subcategory_name TEXT NOT NULL,
  description TEXT,
  UNIQUE (category_id, subcategory_name)
);

CREATE TABLE IF NOT EXISTS products (
  product_id BIGSERIAL PRIMARY KEY,
  subcategory_id BIGINT NOT NULL REFERENCES subcategories(subcategory_id),
  product_name TEXT NOT NULL,
  description TEXT,
  product_status TEXT NOT NULL DEFAULT 'active',
  legacy_product_code TEXT UNIQUE,
  UNIQUE (subcategory_id, product_name)
);

CREATE TABLE IF NOT EXISTS features (
  feature_id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  feature_name TEXT NOT NULL,
  feature_description TEXT,
  feature_status TEXT,
  module_name TEXT,
  legacy_feature_code TEXT UNIQUE,
  UNIQUE (product_id, feature_name)
);

CREATE TABLE IF NOT EXISTS screens (
  screen_id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  screen_name TEXT NOT NULL,
  screen_category TEXT,
  screen_description TEXT,
  legacy_screen_code TEXT UNIQUE,
  UNIQUE (product_id, screen_name)
);

CREATE TABLE IF NOT EXISTS feature_areas (
  feature_area_id BIGSERIAL PRIMARY KEY,
  feature_area_name TEXT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  UNIQUE (product_id, feature_area_name)
);

CREATE TABLE IF NOT EXISTS feature_requests (
  feature_request_id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  converted_feature_id BIGINT REFERENCES features(feature_id),
  title TEXT NOT NULL,
  description TEXT,
  workflow_context TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL,
  legacy_request_code TEXT UNIQUE,
  app_area TEXT,
  screen_id BIGINT REFERENCES screens(screen_id),
  screen_name TEXT,
  origin TEXT
);

CREATE TABLE IF NOT EXISTS feature_request_votes (
  vote_id BIGSERIAL PRIMARY KEY,
  feature_request_id BIGINT NOT NULL REFERENCES feature_requests(feature_request_id),
  session_id TEXT NOT NULL,
  vote_value INTEGER NOT NULL CHECK (vote_value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  feedback_id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  feature_id BIGINT REFERENCES features(feature_id),
  screen_id BIGINT REFERENCES screens(screen_id),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('issue', 'suggestion', 'missing', 'works-well')),
  feedback_text TEXT,
  role TEXT NOT NULL DEFAULT 'unspecified',
  created_at TIMESTAMPTZ NOT NULL,
  app_area TEXT,
  screen_name TEXT
);

CREATE TABLE IF NOT EXISTS kudos (
  kudos_id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(product_id),
  feature_id BIGINT REFERENCES features(feature_id),
  screen_id BIGINT REFERENCES screens(screen_id),
  quote_text TEXT NOT NULL,
  role TEXT NOT NULL,
  consent_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  app_area TEXT,
  screen_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_features_product ON features(product_id);
CREATE INDEX IF NOT EXISTS idx_screens_product ON screens(product_id);
CREATE INDEX IF NOT EXISTS idx_feature_areas_product ON feature_areas(product_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_product_created ON feature_requests(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request ON feature_request_votes(feature_request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_product_feature_screen_created ON feedback(product_id, feature_id, screen_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kudos_product_feature_screen_created ON kudos(product_id, feature_id, screen_id, created_at);
