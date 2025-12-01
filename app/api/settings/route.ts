export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/utils/supabase/server'

export interface UserSettings {
  strategy: 'cash' | '25k_plus'
  account_type: 'cash' | 'margin'
  confidence_threshold?: number
  max_exposure?: number  // Max total exposure % (default 90)
}

export interface SettingsResponse {
  success: boolean
  data?: UserSettings
  error?: string
}

// GET - Fetch user settings
export async function GET(req: NextRequest): Promise<NextResponse<SettingsResponse>> {
  try {
    const supabase = createServerClient(req, {})
    
    // Get user ID from request (checks Authorization header)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[SETTINGS GET] User detected:', { userId, isDemo })

    // Fetch user settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching user settings:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Return default settings if none exist
    const defaultSettings: UserSettings = {
      strategy: 'cash',
      account_type: 'cash',
      confidence_threshold: 0.55,
      max_exposure: 90
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
    const supabase = createServerClient(req, {})
    
    // Get user ID from request (checks Authorization header)
    const { userId, isDemo } = await getUserIdFromRequest(req)
    console.log('[SETTINGS POST] User detected:', { userId, isDemo })

    const body = await req.json()
    const { strategy, account_type, confidence_threshold, max_exposure } = body

    // Validate input
    const validationError = validateSettings({
      strategy,
      account_type,
      confidence_threshold,
      max_exposure
    })

    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 })
    }

    // Prepare settings data
    const settingsData: any = {
      user_id: userId,
      strategy,
      account_type,
      updated_at: new Date().toISOString()
    }
    
    // Add confidence_threshold if provided
    if (confidence_threshold !== undefined) {
      settingsData.confidence_threshold = Number(confidence_threshold)
    }
    
    // Add max_exposure if provided
    if (max_exposure !== undefined) {
      settingsData.max_exposure = Number(max_exposure)
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
        confidence_threshold: data.confidence_threshold ?? 0.55,
        max_exposure: data.max_exposure ?? 90
      }
    })

  } catch (error) {
    console.error('Error in POST /api/settings:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Validation function
function validateSettings(settings: any): string | null {
  const { strategy, account_type, confidence_threshold, max_exposure } = settings

  // Validate strategy
  if (!strategy || !['cash', '25k_plus'].includes(strategy)) {
    return 'Invalid strategy. Must be "cash" or "25k_plus"'
  }

  // Validate account type
  if (!account_type || !['cash', 'margin'].includes(account_type)) {
    return 'Invalid account type. Must be "cash" or "margin"'
  }

  // Validate confidence threshold if provided
  if (confidence_threshold !== undefined && confidence_threshold !== null) {
    if (confidence_threshold < 0 || confidence_threshold > 1) {
      return 'Confidence threshold must be between 0.0 and 1.0 (0% to 100%)'
    }
  }

  // Validate max_exposure if provided
  if (max_exposure !== undefined && max_exposure !== null) {
    if (max_exposure < 50 || max_exposure > 100) {
      return 'Max exposure must be between 50 and 100 (50% to 100%)'
    }
  }

  // Warn about margin account with cash strategy (but allow it)
  if (account_type === 'margin' && strategy === 'cash') {
    console.warn('Warning: Margin account selected with cash trading strategy - PDT risks apply')
  }

  return null
}