'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function PlatformRibbon() {
  const pathname = usePathname()
  const isCelord = pathname.startsWith('/celord')

  return (
    <div className="h-9 shrink-0 bg-[#18181A] border-b border-[var(--sl-border)] flex items-center px-3 gap-1">
      <RibbonTab href="/" active={!isCelord} label="ProspectLord" />
      <RibbonTab href="/celord/prospects" active={isCelord} label="CELord" />
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
