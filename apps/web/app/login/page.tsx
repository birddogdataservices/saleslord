'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function LoginContent() {
  const searchParams = useSearchParams()
  const error        = searchParams.get('error')

  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [sending, setSending] = useState(false)

  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          ...(process.env.NEXT_PUBLIC_ALLOWED_DOMAIN
            ? { hd: process.env.NEXT_PUBLIC_ALLOWED_DOMAIN }
            : {}),
        },
      },
    })
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || sending) return
    setSending(true)
    await fetch('/api/auth/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setSending(false)
    setSent(true)
  }

  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--sl-sidebar)' }}
    >
      <div
        className="rounded-[12px] p-8 w-[340px] flex flex-col gap-5"
        style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
      >
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--sl-text)]">SalesLord</h1>
          <p className="text-[12px] text-[var(--sl-text2)] mt-1">
            Sign in to access your prospect intelligence.
          </p>
        </div>

        {error && (
          <div
            className="text-[11px] rounded-[6px] px-3 py-2"
            style={{ background: 'var(--sl-coral-bg)', color: 'var(--sl-coral-t)' }}
          >
            {error === 'auth_failed'
              ? 'Authentication failed. Please try again.'
              : 'Access denied. Contact your admin to be added to the allowlist.'}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          className="flex items-center justify-center gap-2 rounded-[8px] py-[10px] px-4 text-[13px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
          style={{ background: 'var(--sl-text)', color: '#F0EDE6', border: 'none' }}
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'var(--sl-border)' }} />
          <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'var(--sl-border)' }} />
        </div>

        {sent ? (
          <div
            className="text-[12px] rounded-[6px] px-3 py-3 text-center"
            style={{ background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }}
          >
            Check your inbox — link sent to {email}
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="rounded-[8px] px-3 py-[9px] text-[13px] outline-none w-full"
              style={{
                background: 'var(--sl-surface2)',
                border: '1px solid var(--sl-border)',
                color: 'var(--sl-text)',
              }}
            />
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="rounded-[8px] py-[10px] px-4 text-[13px] font-medium transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--sl-surface2)', color: 'var(--sl-text)', border: '1px solid var(--sl-border)' }}
            >
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        <p className="text-[10px] text-center text-[var(--sl-text3)]">
          Access is restricted. If you have trouble signing in,<br />contact your SalesLord admin.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.59 2.41v2h2.57c1.5-1.38 2.4-3.42 2.4-5.87z" fill="#4285F4"/>
      <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a5.01 5.01 0 0 1-7.47-2.63H.67v2.06A8 8 0 0 0 8 16z" fill="#34A853"/>
      <path d="M3.25 9.43A4.82 4.82 0 0 1 3 8c0-.5.09-.98.25-1.43V4.51H.67A8 8 0 0 0 0 8c0 1.29.31 2.51.67 3.49l2.58-2.06z" fill="#FBBC05"/>
      <path d="M8 3.18c1.23 0 2.33.42 3.2 1.25l2.4-2.4C12 .72 10.16 0 8 0A8 8 0 0 0 .67 4.51l2.58 2.06A4.77 4.77 0 0 1 8 3.18z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
