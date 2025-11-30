/**
 * API Client with automatic authentication
 * 
 * This wrapper automatically includes the user's access token in API requests
 */

import { createClient } from '@/utils/supabase/client'

/**
 * Make an authenticated API request
 * Automatically includes the user's access token if they're logged in
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient()
  
  // Get the current session
  const { data: { session } } = await supabase.auth.getSession()
  
  // Merge headers with Authorization if we have a session
  const headers: HeadersInit = {
    ...options.headers,
  }
  
  if (session?.access_token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`
  }
  
  return fetch(url, {
    ...options,
    headers,
  })
}

/**
 * Make an authenticated GET request and parse JSON response
 */
export async function authGet<T = any>(url: string): Promise<T> {
  const response = await authFetch(url)
  return response.json()
}

/**
 * Make an authenticated POST request with JSON body
 */
export async function authPost<T = any>(url: string, body: any): Promise<T> {
  const response = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return response.json()
}

