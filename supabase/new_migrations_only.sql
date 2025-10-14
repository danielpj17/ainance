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

-- Create user watchlists table
CREATE TABLE IF NOT EXISTS user_watchlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create watchlist symbols table
CREATE TABLE IF NOT EXISTS watchlist_symbols (
  id BIGSERIAL PRIMARY KEY,
  watchlist_id BIGINT NOT NULL REFERENCES user_watchlists(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(watchlist_id, symbol)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_watchlists_user_id 
  ON user_watchlists(user_id);

CREATE INDEX IF NOT EXISTS idx_user_watchlists_default 
  ON user_watchlists(user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_watchlist_id 
  ON watchlist_symbols(watchlist_id);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbols_symbol 
  ON watchlist_symbols(symbol);

-- Enable Row Level Security
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols ENABLE ROW LEVEL SECURITY;

-- Policies for user_watchlists
CREATE POLICY "Users can view their own watchlists"
  ON user_watchlists
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own watchlists"
  ON user_watchlists
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists"
  ON user_watchlists
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists"
  ON user_watchlists
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for watchlist_symbols
CREATE POLICY "Users can view symbols in their watchlists"
  ON watchlist_symbols
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add symbols to their watchlists"
  ON watchlist_symbols
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update symbols in their watchlists"
  ON watchlist_symbols
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete symbols from their watchlists"
  ON watchlist_symbols
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_watchlists
      WHERE user_watchlists.id = watchlist_symbols.watchlist_id
      AND user_watchlists.user_id = auth.uid()
    )
  );

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_watchlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for watchlists
CREATE TRIGGER trigger_update_watchlist_updated_at
  BEFORE UPDATE ON user_watchlists
  FOR EACH ROW
  EXECUTE FUNCTION update_watchlist_updated_at();

-- Function to ensure only one default watchlist per user
CREATE OR REPLACE FUNCTION ensure_single_default_watchlist()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE user_watchlists
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single default
CREATE TRIGGER trigger_ensure_single_default_watchlist
  AFTER INSERT OR UPDATE ON user_watchlists
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_watchlist();

-- Function to get user's watchlist with symbols
CREATE OR REPLACE FUNCTION get_user_watchlist(watchlist_id_param BIGINT)
RETURNS TABLE (
  id BIGINT,
  name VARCHAR(100),
  description TEXT,
  is_default BOOLEAN,
  symbol VARCHAR(10),
  notes TEXT,
  sort_order INTEGER,
  added_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.name,
    w.description,
    w.is_default,
    ws.symbol,
    ws.notes,
    ws.sort_order,
    ws.added_at
  FROM user_watchlists w
  LEFT JOIN watchlist_symbols ws ON w.id = ws.watchlist_id
  WHERE w.id = watchlist_id_param
    AND w.user_id = auth.uid()
  ORDER BY ws.sort_order, ws.added_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_watchlist(BIGINT) TO authenticated;

COMMENT ON TABLE user_watchlists IS 'User-defined stock watchlists';
COMMENT ON TABLE watchlist_symbols IS 'Symbols in user watchlists';
COMMENT ON FUNCTION get_user_watchlist(BIGINT) IS 'Get a user watchlist with all symbols';

-- Create rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_key 
  ON rate_limits(key);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end 
  ON rate_limits(window_end);

-- Enable Row Level Security (but allow service role full access)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage rate limits
CREATE POLICY "Allow service role to manage rate limits"
  ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to clean up expired rate limits
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_end < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id BIGSERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_endpoint 
  ON performance_metrics(endpoint);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_at 
  ON performance_metrics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_id 
  ON performance_metrics(user_id);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_status_code 
  ON performance_metrics(status_code);

-- Partition by month for better performance
CREATE INDEX IF NOT EXISTS idx_performance_metrics_endpoint_created_at 
  ON performance_metrics(endpoint, created_at DESC);

-- Enable Row Level Security
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to manage metrics
CREATE POLICY "Allow service role to manage performance metrics"
  ON performance_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view their own metrics
CREATE POLICY "Users can view their own performance metrics"
  ON performance_metrics
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to get performance stats
CREATE OR REPLACE FUNCTION get_performance_stats(
  endpoint_param VARCHAR DEFAULT NULL,
  hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  endpoint VARCHAR(255),
  total_requests BIGINT,
  avg_duration_ms NUMERIC,
  p50_duration_ms NUMERIC,
  p95_duration_ms NUMERIC,
  p99_duration_ms NUMERIC,
  error_rate NUMERIC,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pm.endpoint,
    COUNT(*) as total_requests,
    AVG(pm.duration_ms)::NUMERIC(10,2) as avg_duration_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p50_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p95_duration_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY pm.duration_ms)::NUMERIC(10,2) as p99_duration_ms,
    (COUNT(*) FILTER (WHERE pm.status_code >= 400) * 100.0 / COUNT(*))::NUMERIC(10,2) as error_rate,
    (COUNT(*) FILTER (WHERE pm.status_code < 400) * 100.0 / COUNT(*))::NUMERIC(10,2) as success_rate
  FROM performance_metrics pm
  WHERE pm.created_at >= NOW() - (hours_back || ' hours')::INTERVAL
    AND (endpoint_param IS NULL OR pm.endpoint = endpoint_param)
  GROUP BY pm.endpoint
  ORDER BY total_requests DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION get_performance_stats(VARCHAR, INTEGER) TO authenticated;

-- Function to clean up old performance metrics (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_performance_metrics()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM performance_metrics
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_old_performance_metrics() TO service_role;

COMMENT ON TABLE rate_limits IS 'API rate limiting tracking';
COMMENT ON TABLE performance_metrics IS 'API performance monitoring';
COMMENT ON FUNCTION get_performance_stats(VARCHAR, INTEGER) IS 'Get performance statistics for endpoints';

