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

