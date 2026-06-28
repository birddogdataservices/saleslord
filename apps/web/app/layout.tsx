import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { Toaster } from '@/components/ui/sonner'
import { PlatformRibbon } from '@/components/PlatformRibbon'
import { getAccessibleModules } from '@/lib/module-access'
import './globals.css'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SalesLord',
  description: 'Sales prospecting intelligence for enterprise AEs',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [modules, locale] = await Promise.all([getAccessibleModules(), getLocale()])
  return (
    <html lang={locale} className={`${geistMono.variable} h-full`}>
      <body className="h-full overflow-hidden flex flex-col">
        {/* Chrome i18n provider sits at the root so it covers the whole platform.
            Untranslated apps (CELord, TerritoryLord) simply render their hardcoded
            English — the provider forces nothing. */}
        <NextIntlClientProvider>
          <PlatformRibbon modules={modules} />
          <div className="flex-1 min-h-0 overflow-hidden">
            {children}
          </div>
          <Toaster position="bottom-right" richColors />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
