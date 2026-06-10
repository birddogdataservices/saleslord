// CELord route group layout.
// Auth AND per-user module access are handled by proxy.ts, which covers all
// routes including /celord/* and /api/celord/* (see the module gate there).
// No sidebar for CELord — full-width content.
export default function CelordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {children}
    </div>
  )
}
