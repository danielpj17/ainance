// Demo Mode Configuration
// Single user shared across all devices/sessions

export const DEMO_MODE = true // Set to false to enable real authentication

export const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@ainance.app',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const DEMO_SESSION = {
  access_token: 'demo-access-token',
  refresh_token: 'demo-refresh-token',
  expires_in: 999999999,
  expires_at: Date.now() + 999999999000,
  token_type: 'bearer',
  user: DEMO_USER,
}

// Get demo user ID for database operations
export function getDemoUserId(): string {
  return DEMO_USER.id
}

// Check if demo mode is enabled
export function isDemoMode(): boolean {
  return DEMO_MODE
}

// Get demo user object
export function getDemoUser() {
  return {
    id: DEMO_USER.id,
    email: DEMO_USER.email,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: DEMO_USER.created_at,
    updated_at: DEMO_USER.updated_at,
    app_metadata: {},
    user_metadata: {},
  }
}

// Get demo session object
export function getDemoSession() {
  return {
    access_token: DEMO_SESSION.access_token,
    refresh_token: DEMO_SESSION.refresh_token,
    expires_in: DEMO_SESSION.expires_in,
    expires_at: DEMO_SESSION.expires_at,
    token_type: DEMO_SESSION.token_type as 'bearer',
    user: getDemoUser(),
  }
}

