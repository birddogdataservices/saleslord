// Platform module registry — single source of truth for the ribbon, the
// proxy module gate, and the admin module-access UI. Adding a future module
// is one entry here plus its routes; everything else is data-driven.
//
// Pure data — safe to import from client components and proxy.ts.

export type ModuleSlug = 'territorylord' | 'prospectlord' | 'celord'

export type ModuleDef = {
  slug: ModuleSlug
  label: string
  href: string             // ribbon tab target
  pathPrefixes: string[]   // page + API prefixes enforced in proxy.ts (gated modules only)
  gated: boolean           // false = always visible (ProspectLord, the home app)
}

// Array order = ribbon tab order.
export const MODULES: ModuleDef[] = [
  {
    slug: 'territorylord',
    label: 'TerritoryLord',
    href: '/territorylord/runs',
    pathPrefixes: ['/territorylord', '/api/territorylord'],
    gated: true,
  },
  {
    slug: 'prospectlord',
    label: 'ProspectLord',
    href: '/',
    pathPrefixes: [],
    gated: false,
  },
  {
    slug: 'celord',
    label: 'CELord',
    href: '/celord/prospects',
    pathPrefixes: ['/celord', '/api/celord'],
    gated: true,
  },
]

export const GATED_MODULES = MODULES.filter(m => m.gated)

export function isGatedModuleSlug(value: string): boolean {
  return GATED_MODULES.some(m => m.slug === value)
}
