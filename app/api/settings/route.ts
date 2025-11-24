export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/utils/supabase/server'

export interface UserSettings {
  strategy: 'cash' | '25k_plus'
  account_type: 'cash' | 'margin'
  max_trade_size: number
  daily_loss_limit: number
  take_profit: number
  stop_loss: number
  confidence_threshold?: number
}

export interface SettingsResponse {
  success: boolean
  data?: UserSettings
  error?: string
}

// GET - Fetch user settings
export async function GET(req: NextRequest): Promise<NextResponse<SettingsResponse>> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch user settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching user settings:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Return default settings if none exist
    const defaultSettings: UserSettings = {
      strategy: 'cash',
      account_type: 'cash',
      max_trade_size: 5000,
      daily_loss_limit: -2,
      take_profit: 0.5,
      stop_loss: 0.3,
      confidence_threshold: 0.55
    }

    return NextResponse.json({
      success: true,
      data: settings || defaultSettings
    })

  } catch (error) {
    console.error('Error in GET /api/settings:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST/PUT - Update user settings
export async function POST(req: NextRequest): Promise<NextResponse<SettingsResponse>> {
  try {
    const supabase = await createServerClient(req, {})
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { strategy, account_type, max_trade_size, daily_loss_limit, take_profit, stop_loss, confidence_threshold } = body

    // Validate input
    const validationError = validateSettings({
      strategy,
      account_type,
      max_trade_size,
      daily_loss_limit,
      take_profit,
      stop_loss,
      confidence_threshold
    })

    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 })
    }

    // Prepare settings data
    const settingsData: any = {
      user_id: user.id,
      strategy,
      account_type,
      max_trade_size: Number(max_trade_size),
      daily_loss_limit: Number(daily_loss_limit),
      take_profit: Number(take_profit),
      stop_loss: Number(stop_loss),
      updated_at: new Date().toISOString()
    }
    
    // Add confidence_threshold if provided
    if (confidence_threshold !== undefined) {
      settingsData.confidence_threshold = Number(confidence_threshold)
    }

    // Upsert settings (insert or update)
    const { data, error } = await supabase
      .from('user_settings')
      .upsert(settingsData, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      // Surface validation errors to the client so users can correct inputs
      console.error('Error updating user settings:', error)
      const message =
        (error as any)?.message ||
        (error as any)?.hint ||
        (error as any)?.details ||
        'Failed to update settings'
      const status = (error as any)?.code === '23514' ? 400 : 500 // 23514 = check_violation
      return NextResponse.json({ success: false, error: message }, { status })
    }

    console.log('User settings updated:', data)

    return NextResponse.json({
      success: true,
      data: {
        strategy: data.strategy,
        account_type: data.account_type,
        max_trade_size: data.max_trade_size,
        daily_loss_limit: data.daily_loss_limit,
        take_profit: data.take_profit,
        stop_loss: data.stop_loss,
        confidence_threshold: data.confidence_threshold ?? 0.55
      }
    })

  } catch (error) {
    console.error('Error in POST /api/settings:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Validation function
function validateSettings(settings: any): string | null {
  const { strategy, account_type, max_trade_size, daily_loss_limit, take_profit, stop_loss, confidence_threshold } = settings

  // Validate strategy
  if (!strategy || !['cash', '25k_plus'].includes(strategy)) {
    return 'Invalid strategy. Must be "cash" or "25k_plus"'
  }

  // Validate account type
  if (!account_type || !['cash', 'margin'].includes(account_type)) {
    return 'Invalid account type. Must be "cash" or "margin"'
  }

  // Validate numeric values
  if (!max_trade_size || max_trade_size <= 0) {
    return 'Max trade size must be greater than 0'
  }

  if (!daily_loss_limit || daily_loss_limit >= 0) {
    return 'Daily loss limit must be negative'
  }

  if (!take_profit || take_profit <= 0) {
    return 'Take profit must be greater than 0'
  }

  if (!stop_loss || stop_loss <= 0) {
    return 'Stop loss must be greater than 0'
  }

  // Validate $25k+ rules
  if (strategy === '25k_plus' && max_trade_size < 5000) {
    return 'For $25k+ strategy, max trade size must be at least $5,000'
  }

  // Validate confidence threshold if provided
  if (confidence_threshold !== undefined && confidence_threshold !== null) {
    if (confidence_threshold < 0 || confidence_threshold > 1) {
      return 'Confidence threshold must be between 0.0 and 1.0 (0% to 100%)'
    }
  }

  // Warn about margin account with cash strategy (but allow it)
  if (account_type === 'margin' && strategy === 'cash') {
    console.warn('Warning: Margin account selected with cash trading strategy - PDT risks apply')
  }

  return null
}