'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

const EXAMPLE_CSV = `org_name,domain,status,note
Acme Corp,acme.com,active_customer,Closed 2024-Q1
Globex Inc,globex.com,failed_enterprise_conversion,Lost to Talend
Initech LLC,,prospect,
Umbrella Corporation,umbrella.com,do_not_contact,`

type ImportResult = {
  ok: boolean
  imported: number
  matched: number
  created: number
  errors: string[]
}

export default function CrmImportPage() {
  const [csvText, setCsvText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsvText((ev.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setLoading(true)
    setResult(null)
    setApiError(null)
    try {
      const res = await fetch('/api/celord/import/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csvText,
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? 'Import failed')
      } else {
        setResult(data)
      }
    } catch {
      setApiError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <Link
          href="/celord/prospects"
          className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block"
        >
          ← Back to prospects
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">CRM import</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Bulk-set customer status from a CSV export. Matches by domain, then name similarity.
        </p>
      </div>

      <div className="flex-1 px-6 py-6 max-w-3xl space-y-6">
        {/* Format reference */}
        <section className="rounded border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Expected format</h2>
          <pre className="text-xs text-gray-600 leading-relaxed overflow-x-auto">{EXAMPLE_CSV}</pre>
          <p className="text-xs text-gray-400 mt-2">
            Columns: <code>org_name</code> (required) · <code>domain</code> (optional, improves matching) ·{' '}
            <code>status</code> (required) · <code>note</code> (optional)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Valid statuses: <code>active_customer</code> · <code>former_customer</code> ·{' '}
            <code>failed_enterprise_conversion</code> · <code>prospect</code> ·{' '}
            <code>do_not_contact</code> · <code>unknown</code>
          </p>
        </section>

        {/* File upload */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Upload CSV file
          </button>
          <span className="text-sm text-gray-400">or paste below</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Text area */}
        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder={`Paste CSV here…\n\n${EXAMPLE_CSV}`}
          rows={12}
          className="w-full font-mono text-xs border border-gray-300 rounded p-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-y"
        />

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={loading || !csvText.trim()}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Importing…' : 'Import'}
        </button>

        {/* API error */}
        {apiError && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded border px-4 py-4 space-y-3 ${result.errors.length === 0 ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center gap-6 text-sm font-medium">
              <span className="text-gray-700">
                {result.imported} row{result.imported !== 1 ? 's' : ''} processed
              </span>
              <span className="text-green-700">{result.matched} matched</span>
              <span className="text-blue-700">{result.created} created</span>
              {result.errors.length > 0 && (
                <span className="text-amber-700">{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {result.errors.length > 0 && (
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {result.errors.length === 0 && (
              <p className="text-xs text-green-700">All rows imported successfully.</p>
            )}
            <Link
              href="/celord/prospects"
              className="inline-block text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
            >
              View prospects →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
