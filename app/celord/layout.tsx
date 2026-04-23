// CELord route group layout.
// Auth is handled by proxy.ts which covers all routes including /celord/*.
// No sidebar for CELord — full-width content.
export default function CelordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {children}
    </div>
  )
}
