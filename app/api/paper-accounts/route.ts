export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getUserIdFromRequest } from '@/utils/supabase/server'
import { createAlpacaClient } from '@/lib/alpaca-client'

interface PaperAccount {
  id: string
  account_name: string
  alpaca_account_number: string | null
  created_at: string
  updated_at: string
}

interface CreateAccountRequest {
  account_name: string
  alpaca_api_key: string
  alpaca_api_secret: string
}

interface UpdateAccountRequest {
  account_name?: string
  alpaca_api_key?: string
  alpaca_api_secret?: string
}

// GET - List all paper trading accounts for the user
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient()
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    console.log('[PAPER-ACCOUNTS] GET - User:', { userId, isDemo })
    
    // Fetch user's paper accounts (including demo user)
    const { data: accounts, error } = await supabase.rpc('get_user_paper_accounts', {
      user_uuid: userId
    })
    
    if (error) {
      console.error('[PAPER-ACCOUNTS] Error fetching accounts:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch paper trading accounts' 
      }, { status: 500 })
    }
    
    console.log('[PAPER-ACCOUNTS] Found', accounts?.length || 0, 'accounts')
    
    return NextResponse.json({ 
      success: true, 
      data: accounts || [] 
    })
  } catch (error: any) {
    console.error('[PAPER-ACCOUNTS] GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// POST - Create a new paper trading account
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient()
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    console.log('[PAPER-ACCOUNTS] POST - User:', { userId, isDemo })
    
    const body: CreateAccountRequest = await req.json()
    const { account_name, alpaca_api_key, alpaca_api_secret } = body
    
    // Validate input
    if (!account_name || !alpaca_api_key || !alpaca_api_secret) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: account_name, alpaca_api_key, alpaca_api_secret' 
      }, { status: 400 })
    }
    
    // Validate API keys by calling Alpaca API
    console.log('[PAPER-ACCOUNTS] Validating API keys with Alpaca...')
    let alpacaAccountNumber: string
    try {
      const alpaca = createAlpacaClient({
        apiKey: alpaca_api_key,
        secretKey: alpaca_api_secret,
        baseUrl: 'https://paper-api.alpaca.markets',
        paper: true
      })
      
      await alpaca.initialize()
      const account = await alpaca.getAccount()
      alpacaAccountNumber = account.account_number
      
      console.log('[PAPER-ACCOUNTS] API keys validated. Account number:', alpacaAccountNumber)
    } catch (error: any) {
      console.error('[PAPER-ACCOUNTS] Invalid API keys:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid Alpaca API keys. Please check your credentials.' 
      }, { status: 400 })
    }
    
    // Create the account in database
    const { data: accountId, error: createError } = await supabase.rpc('create_paper_account', {
      user_uuid: userId,
      p_account_name: account_name,
      p_alpaca_account_number: alpacaAccountNumber,
      p_alpaca_api_key: alpaca_api_key,
      p_alpaca_api_secret: alpaca_api_secret
    })
    
    if (createError) {
      console.error('[PAPER-ACCOUNTS] Error creating account:', createError)
      
      // Check for unique constraint violation
      if (createError.message?.includes('unique_user_account_name')) {
        return NextResponse.json({ 
          success: false, 
          error: 'An account with this name already exists. Please choose a different name.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create paper trading account' 
      }, { status: 500 })
    }
    
    console.log('[PAPER-ACCOUNTS] Account created successfully:', accountId)
    
    // Fetch the created account to return full details
    const { data: newAccount, error: fetchError } = await supabase
      .from('paper_trading_accounts')
      .select('id, account_name, alpaca_account_number, created_at, updated_at')
      .eq('id', accountId)
      .single()
    
    if (fetchError) {
      console.error('[PAPER-ACCOUNTS] Error fetching created account:', fetchError)
    }
    
    return NextResponse.json({ 
      success: true, 
      data: newAccount || { id: accountId, account_name, alpaca_account_number: alpacaAccountNumber }
    })
  } catch (error: any) {
    console.error('[PAPER-ACCOUNTS] POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// PUT - Update an existing paper trading account
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient()
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    console.log('[PAPER-ACCOUNTS] PUT - User:', { userId, isDemo })
    
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('id')
    
    if (!accountId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing account ID parameter' 
      }, { status: 400 })
    }
    
    const body: UpdateAccountRequest = await req.json()
    const { account_name, alpaca_api_key, alpaca_api_secret } = body
    
    // If API keys are provided, validate them and fetch new account number
    let alpacaAccountNumber: string | undefined
    if (alpaca_api_key && alpaca_api_secret) {
      console.log('[PAPER-ACCOUNTS] Validating new API keys with Alpaca...')
      try {
        const alpaca = createAlpacaClient({
          apiKey: alpaca_api_key,
          secretKey: alpaca_api_secret,
          baseUrl: 'https://paper-api.alpaca.markets',
          paper: true
        })
        
        await alpaca.initialize()
        const account = await alpaca.getAccount()
        alpacaAccountNumber = account.account_number
        
        console.log('[PAPER-ACCOUNTS] New API keys validated. Account number:', alpacaAccountNumber)
      } catch (error: any) {
        console.error('[PAPER-ACCOUNTS] Invalid API keys:', error)
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid Alpaca API keys. Please check your credentials.' 
        }, { status: 400 })
      }
    }
    
    // Update the account
    const { error: updateError } = await supabase.rpc('update_paper_account', {
      account_uuid: accountId,
      user_uuid: userId,
      p_account_name: account_name || null,
      p_alpaca_account_number: alpacaAccountNumber || null,
      p_alpaca_api_key: alpaca_api_key || null,
      p_alpaca_api_secret: alpaca_api_secret || null
    })
    
    if (updateError) {
      console.error('[PAPER-ACCOUNTS] Error updating account:', updateError)
      
      // Check for access denied
      if (updateError.message?.includes('access denied')) {
        return NextResponse.json({ 
          success: false, 
          error: 'Account not found or access denied' 
        }, { status: 404 })
      }
      
      // Check for unique constraint violation
      if (updateError.message?.includes('unique_user_account_name')) {
        return NextResponse.json({ 
          success: false, 
          error: 'An account with this name already exists. Please choose a different name.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to update paper trading account' 
      }, { status: 500 })
    }
    
    console.log('[PAPER-ACCOUNTS] Account updated successfully:', accountId)
    
    // Fetch the updated account
    const { data: updatedAccount, error: fetchError } = await supabase
      .from('paper_trading_accounts')
      .select('id, account_name, alpaca_account_number, created_at, updated_at')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()
    
    if (fetchError) {
      console.error('[PAPER-ACCOUNTS] Error fetching updated account:', fetchError)
    }
    
    return NextResponse.json({ 
      success: true, 
      data: updatedAccount
    })
  } catch (error: any) {
    console.error('[PAPER-ACCOUNTS] PUT error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// DELETE - Delete a paper trading account
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient()
    const { userId, isDemo } = await getUserIdFromRequest(req)
    
    console.log('[PAPER-ACCOUNTS] DELETE - User:', { userId, isDemo })
    
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('id')
    
    if (!accountId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing account ID parameter' 
      }, { status: 400 })
    }
    
    // Delete the account (function checks for trades)
    const { data: result, error: deleteError } = await supabase.rpc('delete_paper_account', {
      account_uuid: accountId,
      user_uuid: userId
    })
    
    if (deleteError) {
      console.error('[PAPER-ACCOUNTS] Error deleting account:', deleteError)
      
      // Check for access denied
      if (deleteError.message?.includes('access denied')) {
        return NextResponse.json({ 
          success: false, 
          error: 'Account not found or access denied' 
        }, { status: 404 })
      }
      
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to delete paper trading account' 
      }, { status: 500 })
    }
    
    // Check if deletion was successful (function returns result object)
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success) {
        console.log('[PAPER-ACCOUNTS] Account deleted successfully:', accountId)
        return NextResponse.json({ 
          success: true, 
          message: result.message 
        })
      } else {
        console.log('[PAPER-ACCOUNTS] Cannot delete account with trades:', result.trade_count)
        return NextResponse.json({ 
          success: false, 
          error: result.message,
          trade_count: result.trade_count
        }, { status: 400 })
      }
    }
    
    // Fallback success response
    return NextResponse.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    })
  } catch (error: any) {
    console.error('[PAPER-ACCOUNTS] DELETE error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

