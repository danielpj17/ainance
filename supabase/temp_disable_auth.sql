-- TEMPORARY: Disable authentication for testing watchlist
-- Run this in your Supabase SQL Editor to allow unauthenticated access
-- WARNING: This removes security - only use for testing!

-- Disable RLS on watchlist tables temporarily
ALTER TABLE user_watchlists DISABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_symbols DISABLE ROW LEVEL SECURITY;

-- OR if you prefer to keep RLS enabled but allow public access:
-- (Comment out the above and uncomment below)

/*
-- Allow anonymous/public read access to watchlists
DROP POLICY IF EXISTS "Allow public read access to watchlists" ON user_watchlists;
CREATE POLICY "Allow public read access to watchlists"
  ON user_watchlists
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Allow anonymous/public access to watchlist symbols
DROP POLICY IF EXISTS "Allow public read access to watchlist_symbols" ON watchlist_symbols;
CREATE POLICY "Allow public read access to watchlist_symbols"
  ON watchlist_symbols
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
*/

-- Note: To re-enable security later, run:
-- ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE watchlist_symbols ENABLE ROW LEVEL SECURITY;

