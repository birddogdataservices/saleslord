export const dynamic = 'force-dynamic'

import { getTranslations } from 'next-intl/server'

export default async function AccessDeniedPage() {
  const t = await getTranslations('AccessDenied')
  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: 'var(--sl-sidebar)' }}
    >
      <div
        className="rounded-[12px] p-8 w-[340px] flex flex-col gap-4"
        style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
      >
        <h1 className="text-[16px] font-semibold text-[var(--sl-text)]">{t('title')}</h1>
        <p className="text-[12px] text-[var(--sl-text2)] leading-relaxed">
          {t('body')}
        </p>
        <a
          href="/login"
          className="text-[12px] text-[var(--sl-blue-t)] hover:underline"
        >
          {t('backToSignIn')}
        </a>
      </div>
    </div>
  )
}
