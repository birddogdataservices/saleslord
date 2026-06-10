// TerritoryLord route layout.
// Auth AND per-user module access are handled by proxy.ts, which covers all
// routes including /territorylord/* and /api/territorylord/* (see the module
// gate there). No sidebar — full-width content, matching the CELord convention.
export default function TerritoryLordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {children}
    </div>
  )
}
