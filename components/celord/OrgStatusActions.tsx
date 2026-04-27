'use client'

import { useState } from 'react'
import type { CustomerStatus } from '@/core/types'
import { STATUS_OPTIONS } from './statusConfig'

export function OrgStatusActions({
  orgId,
  initial,
}: {
  orgId: string
  initial: CustomerStatus
}) {
  const [current, setCurrent] = useState<CustomerStatus>(initial)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')

  async function pick(status: CustomerStatus) {
    if (status === current || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/celord/orgs/${orgId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note || undefined }),
      })
      if (res.ok) {
        setCurrent(status)
        setNote('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Set status</span>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            disabled={saving}
            onClick={() => pick(opt.value)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${opt.cls} ${
              current === opt.value ? 'ring-2 ring-offset-1 ring-gray-400' : ''
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note (e.g. closed with Competitor X)"
        className="w-full max-w-md text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
    </div>
  )
}
