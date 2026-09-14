'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ACTION_BUTTON_CLASS, ACTION_STYLE } from '@/lib/action-styles'

type Props = {
  prospectId: string
  isArchived: boolean
  prospectName: string
}

// A free utility action, so it takes the neutral topbar style. Archiving is
// reversible — the same button becomes Restore — so it is not styled as a
// destructive action.
export default function ArchiveButton({ prospectId, isArchived, prospectName }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    const res = await fetch(`/api/prospects/${prospectId}/archive`, { method: 'PATCH' })
    setLoading(false)

    if (!res.ok) {
      toast.error('Failed to update. Please try again.')
      return
    }

    const { archived } = await res.json()
    toast.success(archived ? `${prospectName} archived.` : `${prospectName} restored.`)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={ACTION_BUTTON_CLASS}
      style={ACTION_STYLE.utility}
    >
      {loading ? '…' : isArchived ? 'Restore' : 'Archive'}
    </button>
  )
}
