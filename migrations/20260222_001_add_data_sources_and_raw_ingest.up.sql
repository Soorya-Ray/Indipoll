CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  base_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_ingest (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES data_sources(id),
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  raw_payload JSONB NOT NULL,
  format VARCHAR(50) NOT NULL,
  processed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_raw_ingest_source_time ON raw_ingest(source_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_ingest_processed ON raw_ingest(processed);
