import { createClient } from '@supabase/supabase-js'

// Service-role admin client — BYPASSES RLS.
// ONLY import this in /app/api/* route handlers, never in components or server components.
// Used for: inserting api_usage rows, reading allowed_emails, cron refresh-all.
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — admin client cannot be created')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
