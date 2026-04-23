import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { PlatformRibbon } from '@/components/PlatformRibbon'
import './globals.css'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SalesLord',
  description: 'Sales prospecting intelligence for enterprise AEs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full`}>
      <body className="h-full overflow-hidden flex flex-col">
        <PlatformRibbon />
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  )
}
