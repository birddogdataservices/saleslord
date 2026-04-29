'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  prospectId: string
  isArchived: boolean
  prospectName: string
}

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
      className="text-[11px] px-3 py-[5px] rounded-[6px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text3)' }}
    >
      {loading ? '…' : isArchived ? 'Restore' : 'Archive'}
    </button>
  )
}
