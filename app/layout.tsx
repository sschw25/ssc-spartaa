import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { SiteChrome } from '@/components/ssc/site-chrome'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.sscsparta.com'),
  title: 'SSC스파르타 | 철저한 관리가 합격을 만든다',
  description:
    '원주·춘천·충주에서 노량진 프로그램 그대로. 공무원·경찰·소방·임용·독학재수·전문자격 관리학습관과 공무원 면접반, SSC스파르타',
  keywords: [
    '공무원 학원',
    '강원도 공무원',
    '원주 공무원',
    '원주 경찰학원',
    '춘천 경찰학원',
    '충주 경찰학원',
    '원주 소방학원',
    '춘천 소방학원',
    '충주 소방학원',
    '원주 면접학원',
    '춘천 면접학원',
    '충주 면접학원',
    '공무원 면접학원',
    '커넥츠프랩',
    '공단기',
    'SSC스파르타',
  ],
  openGraph: {
    title: 'SSC스파르타 | 철저한 관리가 합격을 만든다',
    description: '원주·춘천·충주에서 노량진 프로그램 그대로. 공무원·경찰·소방·임용·독학재수·전문자격 관리학습관과 공무원 면접반, SSC스파르타',
    url: 'https://www.sscsparta.com',
    locale: 'ko_KR',
    type: 'website',
  },
  verification: {
    google: '1JM3BiBpnBYLfbbjOvBjEsA1Z6xx9etEGmH7OHLWr1M',
    other: {
      'naver-site-verification': 'c9df103484da5b5ab152abdbb0e288844898c79b',
    },
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased text-[#1D1D1F] overflow-x-hidden`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ConfirmProvider>
            <SiteChrome>{children}</SiteChrome>
          </ConfirmProvider>
        </ThemeProvider>
        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  )
}
