-- Migration: Add LLM algorithm types to the constraint

-- Drop the old constraint
ALTER TABLE account_strategy_settings 
DROP CONSTRAINT IF EXISTS account_strategy_settings_algorithm_type_check;

-- Add the new constraint with all 6 options
ALTER TABLE account_strategy_settings 
ADD CONSTRAINT account_strategy_settings_algorithm_type_check 
CHECK (algorithm_type IN (
  'ml_model', 
  'rule_based_simple', 
  'rule_based_advanced',
  'gemini_analyst',
  'llama_technical',
  'consensus_combined'
));

-- Update the update_account_strategy_settings function to allow the new types
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