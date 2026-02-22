CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS model_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID REFERENCES predictions(id),
  feature_name TEXT,
  feature_value NUMERIC,
  contribution NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
