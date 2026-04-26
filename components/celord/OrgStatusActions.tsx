'use client'

import { useState } from 'react'
import type { CustomerStatus } from '@/core/types'

const STATUS_OPTIONS: { value: CustomerStatus; label: string; cls: string }[] = [
  { value: 'prospect',                     label: 'Prospect',         cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { value: 'active_customer',              label: 'Customer',         cls: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { value: 'former_customer',              label: 'Former customer',  cls: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  { value: 'failed_enterprise_conversion', label: 'Failed conv.',     cls: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { value: 'irrelevant',                   label: 'Irrelevant',       cls: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { value: 'do_not_contact',               label: 'Do not contact',   cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { value: 'unknown',                      label: 'Clear status',     cls: 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-200' },
]

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
