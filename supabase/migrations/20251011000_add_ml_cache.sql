-- Create ML predictions cache table
CREATE TABLE IF NOT EXISTS ml_predictions_cache (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,
  prediction JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on symbol for fast lookups
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_symbol 
  ON ml_predictions_cache(symbol);

-- Create index on expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_expires 
  ON ml_predictions_cache(expires_at);

-- Create index on composite (symbol, expires_at) for cache checks
CREATE INDEX IF NOT EXISTS idx_ml_predictions_cache_symbol_expires 
  ON ml_predictions_cache(symbol, expires_at);

-- Enable Row Level Security
ALTER TABLE ml_predictions_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read cache
CREATE POLICY "Allow authenticated users to read ML cache"
  ON ml_predictions_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to insert/update cache
CREATE POLICY "Allow service role to manage ML cache"
  ON ml_predictions_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ml_predictions_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row updates
CREATE TRIGGER trigger_update_ml_predictions_cache_updated_at
  BEFORE UPDATE ON ml_predictions_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_ml_predictions_cache_updated_at();

-- Function to clean up expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_ml_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ml_predictions_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_expired_ml_cache() TO authenticated;

COMMENT ON TABLE ml_predictions_cache IS 'Caches ML predictions to reduce load on inference service';
COMMENT ON COLUMN ml_predictions_cache.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN ml_predictions_cache.prediction IS 'Complete prediction object from ML service';
COMMENT ON COLUMN ml_predictions_cache.cached_at IS 'When the prediction was cached';
COMMENT ON COLUMN ml_predictions_cache.expires_at IS 'When the cache entry expires';

