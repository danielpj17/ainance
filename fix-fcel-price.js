// Simple script to fix FCEL buy price
// Run with: node fix-fcel-price.js

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

// You'll need to get your auth token from the browser
// Open browser console and run: localStorage.getItem('sb-<your-project-ref>-auth-token')
// Then set it here or pass as environment variable
const AUTH_TOKEN = process.env.AUTH_TOKEN

if (!AUTH_TOKEN) {
  console.error('Missing AUTH_TOKEN. Get it from browser localStorage:')
  console.error('localStorage.getItem("sb-<your-project-ref>-auth-token")')
  process.exit(1)
}

async function fixFCELPrice() {
  try {
    const response = await fetch(`${SUPABASE_URL.replace('/rest/v1', '')}/api/trade-logs/fix-prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        symbol: 'FCEL'
      })
    })

    const result = await response.json()
    console.log('Fix result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

fixFCELPrice()

