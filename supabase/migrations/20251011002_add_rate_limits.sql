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

