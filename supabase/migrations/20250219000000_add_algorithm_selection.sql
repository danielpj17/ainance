-- Migration: Add algorithm selection support to account strategy settings
-- This enables each paper trading account to independently select which trading algorithm to use

-- 1. Add algorithm_type column to account_strategy_settings table
-- First, try to add the column (will skip if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'account_strategy_settings' 
        AND column_name = 'algorithm_type'
    ) THEN
        ALTER TABLE account_strategy_settings 
        ADD COLUMN algorithm_type TEXT DEFAULT 'ml_model';
    END IF;
END $$;

-- Drop existing constraint if it exists
ALTER TABLE account_strategy_settings 
DROP CONSTRAINT IF EXISTS account_strategy_settings_algorithm_type_check;

-- Add constraint
ALTER TABLE account_strategy_settings 
ADD CONSTRAINT account_strategy_settings_algorithm_type_check 
CHECK (algorithm_type IN ('ml_model', 'rule_based_simple', 'rule_based_advanced'));

-- 2. Create index for algorithm type filtering (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_account_strategy_algorithm_type 
ON account_strategy_settings(algorithm_type);

-- 3. Update existing records to use ml_model as default (if any exist without algorithm_type)
UPDATE account_strategy_settings 
SET algorithm_type = 'ml_model' 
WHERE algorithm_type IS NULL;

-- 4. Add comment to document the column
COMMENT ON COLUMN account_strategy_settings.algorithm_type IS 'Trading algorithm type: ml_model (Random Forest), rule_based_simple (basic rules), or rule_based_advanced (enhanced rule scoring)';

-- 5. Drop ALL existing versions of get function using a DO block
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE proname = 'get_account_strategy_settings' 
        AND nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.get_account_strategy_settings(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- Create the get_account_strategy function to include algorithm_type
CREATE OR REPLACE FUNCTION get_account_strategy_settings(
  account_uuid uuid,
  user_uuid uuid
)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  strategy text,
  account_type text,
  confidence_threshold numeric,
  sell_confidence_threshold numeric,
  max_exposure numeric,
  algorithm_type text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  -- Verify user owns this account
  IF NOT EXISTS (
    SELECT 1 FROM paper_trading_accounts pta
    WHERE pta.id = account_uuid AND pta.user_id = user_uuid
  ) THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    ass.id,
    ass.account_id,
    ass.strategy,
    ass.account_type,
    ass.confidence_threshold,
    ass.sell_confidence_threshold,
    ass.max_exposure,
    ass.algorithm_type,
    ass.created_at,
    ass.updated_at
  FROM account_strategy_settings ass
  WHERE ass.account_id = account_uuid AND ass.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Drop ALL existing versions of update function using a DO block
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE proname = 'update_account_strategy_settings' 
        AND nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.update_account_strategy_settings(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- Create function to update account strategy settings including algorithm
CREATE OR REPLACE FUNCTION update_account_strategy_settings(
  account_uuid uuid,
  user_uuid uuid,
  p_strategy text DEFAULT NULL,
  p_account_type text DEFAULT NULL,
  p_confidence_threshold numeric DEFAULT NULL,
  p_sell_confidence_threshold numeric DEFAULT NULL,
  p_max_exposure numeric DEFAULT NULL,
  p_algorithm_type text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Verify user owns this account
  IF NOT EXISTS (
    SELECT 1 FROM paper_trading_accounts pta
    WHERE pta.id = account_uuid AND pta.user_id = user_uuid
  ) THEN
    RAISE EXCEPTION 'Account not found or access denied';
  END IF;
  
  -- Validate algorithm_type if provided
  IF p_algorithm_type IS NOT NULL AND p_algorithm_type NOT IN ('ml_model', 'rule_based_simple', 'rule_based_advanced') THEN
    RAISE EXCEPTION 'Invalid algorithm_type. Must be one of: ml_model, rule_based_simple, rule_based_advanced';
  END IF;
  
  UPDATE account_strategy_settings
  SET
    strategy = COALESCE(p_strategy, strategy),
    account_type = COALESCE(p_account_type, account_type),
    confidence_threshold = COALESCE(p_confidence_threshold, confidence_threshold),
    sell_confidence_threshold = COALESCE(p_sell_confidence_threshold, sell_confidence_threshold),
    max_exposure = COALESCE(p_max_exposure, max_exposure),
    algorithm_type = COALESCE(p_algorithm_type, algorithm_type),
    updated_at = NOW()
  WHERE account_id = account_uuid AND user_id = user_uuid;
  
  -- If no row exists, create one with defaults
  IF NOT FOUND THEN
    INSERT INTO account_strategy_settings (
      account_id,
      user_id,
      strategy,
      account_type,
      confidence_threshold,
      sell_confidence_threshold,
      max_exposure,
      algorithm_type
    ) VALUES (
      account_uuid,
      user_uuid,
      COALESCE(p_strategy, 'cash'),
      COALESCE(p_account_type, 'cash'),
      COALESCE(p_confidence_threshold, 0.65),
      COALESCE(p_sell_confidence_threshold, 0.50),
      COALESCE(p_max_exposure, 90),
      COALESCE(p_algorithm_type, 'ml_model')
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_account_strategy_settings TO authenticated;
GRANT EXECUTE ON FUNCTION get_account_strategy_settings TO service_role;
GRANT EXECUTE ON FUNCTION update_account_strategy_settings TO authenticated;
GRANT EXECUTE ON FUNCTION update_account_strategy_settings TO service_role;

-- Add comment to migration
COMMENT ON TABLE account_strategy_settings IS 'Per-account strategy settings including algorithm selection - enables different trading strategies and algorithms for each account';

