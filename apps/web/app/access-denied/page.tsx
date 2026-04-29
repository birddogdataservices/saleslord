export const dynamic = 'force-dynamic'

export default function AccessDeniedPage() {
  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--sl-sidebar)' }}
    >
      <div
        className="rounded-[12px] p-8 w-[340px] flex flex-col gap-4"
        style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
      >
        <h1 className="text-[16px] font-semibold text-[var(--sl-text)]">Access denied</h1>
        <p className="text-[12px] text-[var(--sl-text2)] leading-relaxed">
          Your account isn't on the SalesLord access list. Contact your admin to be added.
        </p>
        <a
          href="/login"
          className="text-[12px] text-[var(--sl-blue-t)] hover:underline"
        >
          ← Back to sign in
        </a>
      </div>
    </div>
  )
}
