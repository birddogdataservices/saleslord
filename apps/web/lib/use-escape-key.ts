'use client'

import { useEffect } from 'react'

// Close-on-Escape for modals.
//
// Two of the four modals had this and two did not, so whether Escape worked
// depended on which dialog you happened to be in. Extracted rather than
// copy-pasted a third time — the two existing copies were already identical.
//
// `active` gates the listener so a closed modal is not holding a global keydown
// handler, and so nested dialogs do not both close on one press.
export function useEscapeKey(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, active])
}
