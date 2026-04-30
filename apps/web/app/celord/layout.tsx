// CELord route group layout.
// Auth is handled by proxy.ts which covers all routes including /celord/*.
// No sidebar for CELord — full-width content.
export default function CelordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {children}
    </div>
  )
}
