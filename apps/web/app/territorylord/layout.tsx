// TerritoryLord route layout.
// Auth is handled by proxy.ts which covers all routes including /territorylord/*.
// No sidebar — full-width content, matching the CELord layout convention.
export default function TerritoryLordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {children}
    </div>
  )
}
