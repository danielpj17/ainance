export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/utils/supabase/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[ACCOUNT-STRATEGY GET] User detected:', { userId, isDemo })

    // Get account_id from query params
    const { searchParams } = new URL(req.url)
    const account_id = searchParams.get('account_id')

    if (!account_id) {
      return NextResponse.json({
        success: false,
        error: 'account_id parameter is required'
      }, { status: 400 })
    }

    // Get strategy settings for this account
    const { data, error } = await supabase.rpc('get_account_strategy_settings', {
      account_uuid: account_id,
      user_uuid: userId
    })

    if (error) {
      console.error('[ACCOUNT-STRATEGY GET] Error fetching settings:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to fetch strategy settings'
      }, { status: 500 })
    }

    // If no settings exist, return defaults
    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          strategy: 'cash',
          account_type: 'cash',
          confidence_threshold: 0.65,
          sell_confidence_threshold: 0.50,
          max_exposure: 90
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: data[0]
    })

  } catch (error: any) {
    console.error('[ACCOUNT-STRATEGY GET] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get user ID from request
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[ACCOUNT-STRATEGY POST] User detected:', { userId, isDemo })

    const body = await req.json()
    const { 
      account_id,
      strategy,
      account_type,
      confidence_threshold,
      sell_confidence_threshold,
      max_exposure
    } = body

    if (!account_id) {
      return NextResponse.json({
        success: false,
        error: 'account_id is required'
      }, { status: 400 })
    }

    // Validate parameters
    if (strategy && !['cash', '25k_plus'].includes(strategy)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid strategy. Must be cash or 25k_plus'
      }, { status: 400 })
    }

    if (account_type && !['cash', 'margin'].includes(account_type)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid account_type. Must be cash or margin'
      }, { status: 400 })
    }

    if (confidence_threshold !== undefined && (confidence_threshold < 0 || confidence_threshold > 1)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid confidence_threshold. Must be between 0 and 1'
      }, { status: 400 })
    }

    if (sell_confidence_threshold !== undefined && (sell_confidence_threshold < 0 || sell_confidence_threshold > 1)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid sell_confidence_threshold. Must be between 0 and 1'
      }, { status: 400 })
    }

    if (max_exposure !== undefined && (max_exposure < 0 || max_exposure > 100)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid max_exposure. Must be between 0 and 100'
      }, { status: 400 })
    }

    // Update strategy settings
    const { error } = await supabase.rpc('update_account_strategy_settings', {
      account_uuid: account_id,
      user_uuid: userId,
      strategy_param: strategy || null,
      account_type_param: account_type || null,
      confidence_threshold_param: confidence_threshold !== undefined ? confidence_threshold : null,
      sell_confidence_threshold_param: sell_confidence_threshold !== undefined ? sell_confidence_threshold : null,
      max_exposure_param: max_exposure !== undefined ? max_exposure : null
    })

    if (error) {
      console.error('[ACCOUNT-STRATEGY POST] Error updating settings:', error)
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to update strategy settings'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Strategy settings updated successfully'
    })

  } catch (error: any) {
    console.error('[ACCOUNT-STRATEGY POST] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}

