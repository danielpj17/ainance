export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/utils/supabase/server'
import { createClient } from '@/utils/supabase/server'
import { AlgorithmType } from '@/lib/trading-algorithms'

interface StrategySettings {
  account_type: 'cash' | 'margin'
  confidence_threshold: number
  sell_confidence_threshold: number
  max_exposure: number
  algorithm_type: AlgorithmType
  is_short_selling_enabled: boolean
}

/**
 * GET - Fetch strategy settings for a specific paper trading account
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get user ID from request cookies
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('Account Strategy API - GET - User:', { userId, isDemo })
    
    // Get account_id from query params
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('account_id')
    
    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'account_id is required'
      }, { status: 400 })
    }
    
    // Fetch strategy settings using the database function
    console.log(`Fetching strategy settings for account ${accountId}, user ${userId}`)
    
    const { data, error } = await supabase.rpc('get_account_strategy_settings', {
      account_uuid: accountId,
      user_uuid: userId
    })
    
    if (error) {
      console.error('Error fetching account strategy settings:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to fetch strategy settings'
      }, { status: 500 })
    }
    
    console.log('Fetched data from database:', data)
    
    // If no settings exist, return defaults
    if (!data || data.length === 0) {
      console.log('No settings found, returning defaults')
      return NextResponse.json({
        success: true,
        settings: {
          account_type: 'cash',
          confidence_threshold: 0.65,
          sell_confidence_threshold: 0.50,
          max_exposure: 90,
          algorithm_type: 'ml_model',
          is_short_selling_enabled: false
        },
        exists: false
      })
    }
    
    const settings = data[0]
    console.log('Returning settings:', settings)
    
    return NextResponse.json({
      success: true,
      settings: {
        account_type: settings.account_type,
        confidence_threshold: settings.confidence_threshold,
        sell_confidence_threshold: settings.sell_confidence_threshold,
        max_exposure: settings.max_exposure,
        algorithm_type: settings.algorithm_type || 'ml_model',
        is_short_selling_enabled: settings.is_short_selling_enabled ?? false
      },
      exists: true
    })
    
  } catch (error: any) {
    console.error('Account Strategy API - GET error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * PUT - Update strategy settings for a specific paper trading account
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get user ID from request cookies
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('Account Strategy API - PUT - User:', { userId, isDemo })
    
    // Parse request body
    const body = await req.json()
    const { account_id, settings } = body
    
    if (!account_id) {
      return NextResponse.json({
        success: false,
        error: 'account_id is required'
      }, { status: 400 })
    }
    
    if (!settings) {
      return NextResponse.json({
        success: false,
        error: 'settings object is required'
      }, { status: 400 })
    }
    
    // Validate algorithm_type if provided
    const validAlgorithmTypes: AlgorithmType[] = [
      'ml_model', 
      'rule_based_simple', 
      'rule_based_advanced',
      'gemini_analyst',
      'llama_technical',
      'consensus_combined'
    ]
    if (settings.algorithm_type && !validAlgorithmTypes.includes(settings.algorithm_type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid algorithm_type. Must be one of: ${validAlgorithmTypes.join(', ')}`
      }, { status: 400 })
    }
    
    // Validate numeric ranges
    if (settings.confidence_threshold !== undefined) {
      const threshold = parseFloat(settings.confidence_threshold)
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return NextResponse.json({
          success: false,
          error: 'confidence_threshold must be between 0 and 1'
        }, { status: 400 })
      }
    }
    
    if (settings.sell_confidence_threshold !== undefined) {
      const threshold = parseFloat(settings.sell_confidence_threshold)
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return NextResponse.json({
          success: false,
          error: 'sell_confidence_threshold must be between 0 and 1'
        }, { status: 400 })
      }
    }
    
    if (settings.max_exposure !== undefined) {
      const exposure = parseFloat(settings.max_exposure)
      if (isNaN(exposure) || exposure < 0 || exposure > 100) {
        return NextResponse.json({
          success: false,
          error: 'max_exposure must be between 0 and 100'
        }, { status: 400 })
      }
    }
    
    console.log(`Updating strategy settings for account ${account_id}:`, settings)
    
    const rpcParams = {
      account_uuid: account_id,
      user_uuid: userId,
      p_account_type: settings.account_type || null,
      p_confidence_threshold: settings.confidence_threshold !== undefined ? parseFloat(settings.confidence_threshold) : null,
      p_sell_confidence_threshold: settings.sell_confidence_threshold !== undefined ? parseFloat(settings.sell_confidence_threshold) : null,
      p_max_exposure: settings.max_exposure !== undefined ? parseFloat(settings.max_exposure) : null,
      p_algorithm_type: settings.algorithm_type || null,
      p_is_short_selling_enabled: settings.account_type === 'cash'
        ? false
        : settings.is_short_selling_enabled ?? null
    }
    
    console.log('RPC parameters:', rpcParams)
    
    // Update strategy settings using the database function
    const { data: rpcData, error } = await supabase.rpc('update_account_strategy_settings', rpcParams)
    
    if (error) {
      console.error('Error updating account strategy settings:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to update strategy settings'
      }, { status: 500 })
    }
    
    console.log(`✅ Strategy settings updated successfully for account ${account_id}`)
    console.log('RPC result:', rpcData)
    
    // Fetch and return the updated settings
    const { data: updatedData, error: fetchError } = await supabase.rpc('get_account_strategy_settings', {
      account_uuid: account_id,
      user_uuid: userId
    })
    
    if (fetchError || !updatedData || updatedData.length === 0) {
      // Settings were saved but we couldn't fetch them back
      return NextResponse.json({
        success: true,
        message: 'Settings updated successfully',
        settings: settings
      })
    }
    
    const updated = updatedData[0]
    
    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
      settings: {
        account_type: updated.account_type,
        confidence_threshold: updated.confidence_threshold,
        sell_confidence_threshold: updated.sell_confidence_threshold,
        max_exposure: updated.max_exposure,
        algorithm_type: updated.algorithm_type || 'ml_model',
        is_short_selling_enabled: updated.is_short_selling_enabled ?? false
      }
    })
    
  } catch (error: any) {
    console.error('Account Strategy API - PUT error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}
