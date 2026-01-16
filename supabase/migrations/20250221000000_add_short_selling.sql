-- Migration: Add short selling flag to account strategy settings

-- 1. Add column for short selling permission
ALTER TABLE account_strategy_settings
ADD COLUMN IF NOT EXISTS is_short_selling_enabled boolean NOT NULL DEFAULT false;

-- 2. Drop existing get_account_strategy_settings to update return type
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

-- 3. Update get_account_strategy_settings to include short selling flag
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
  is_short_selling_enabled boolean,
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
    ass.is_short_selling_enabled,
    ass.created_at,
    ass.updated_at
  FROM account_strategy_settings ass
  WHERE ass.account_id = account_uuid AND ass.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop ALL existing versions of update function
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

-- 5. Recreate update_account_strategy_settings with short selling flag
CREATE OR REPLACE FUNCTION update_account_strategy_settings(
  account_uuid uuid,
  user_uuid uuid,
  p_strategy text DEFAULT NULL,
  p_account_type text DEFAULT NULL,
  p_confidence_threshold numeric DEFAULT NULL,
  p_sell_confidence_threshold numeric DEFAULT NULL,
  p_max_exposure numeric DEFAULT NULL,
  p_algorithm_type text DEFAULT NULL,
  p_is_short_selling_enabled boolean DEFAULT NULL
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
  
  -- Validate algorithm_type if provided (Updated List)
  IF p_algorithm_type IS NOT NULL AND p_algorithm_type NOT IN ('ml_model', 'rule_based_simple', 'rule_based_advanced', 'gemini_analyst', 'llama_technical', 'consensus_combined') THEN
    RAISE EXCEPTION 'Invalid algorithm_type.';
  END IF;
  
  UPDATE account_strategy_settings
  SET
    strategy = COALESCE(p_strategy, strategy),
    account_type = COALESCE(p_account_type, account_type),
    confidence_threshold = COALESCE(p_confidence_threshold, confidence_threshold),
    sell_confidence_threshold = COALESCE(p_sell_confidence_threshold, sell_confidence_threshold),
    max_exposure = COALESCE(p_max_exposure, max_exposure),
    algorithm_type = COALESCE(p_algorithm_type, algorithm_type),
    is_short_selling_enabled = COALESCE(p_is_short_selling_enabled, is_short_selling_enabled),
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
      algorithm_type,
      is_short_selling_enabled
    ) VALUES (
      account_uuid,
      user_uuid,
      COALESCE(p_strategy, 'cash'),
      COALESCE(p_account_type, 'cash'),
      COALESCE(p_confidence_threshold, 0.65),
      COALESCE(p_sell_confidence_threshold, 0.50),
      COALESCE(p_max_exposure, 90),
      COALESCE(p_algorithm_type, 'ml_model'),
      COALESCE(p_is_short_selling_enabled, false)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
