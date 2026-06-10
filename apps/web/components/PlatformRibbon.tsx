'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MODULES, type ModuleSlug } from '@/lib/modules'

// Tabs are filtered server-side: the root layout passes the modules the
// current user can access (see lib/module-access.ts). Route enforcement
// lives in proxy.ts — hiding a tab here is display-only.
export function PlatformRibbon({ modules }: { modules: ModuleSlug[] }) {
  const pathname = usePathname()

  const activeSlug: ModuleSlug =
    MODULES.find(m => m.pathPrefixes.some(p => pathname.startsWith(p)))?.slug
    ?? 'prospectlord'

  const visible = MODULES.filter(m => modules.includes(m.slug))

  return (
    <div className="h-9 shrink-0 bg-[#18181A] border-b border-[var(--sl-border)] flex items-center px-3 gap-1">
      {visible.map(m => (
        <RibbonTab key={m.slug} href={m.href} active={activeSlug === m.slug} label={m.label} />
      ))}
    </div>
  )
}

function RibbonTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-white/10 text-white font-medium'
          : 'text-[var(--sl-text3)] hover:text-[var(--sl-text2)] hover:bg-white/5'
      }`}
    >
      {label}
    </Link>
  )
}
