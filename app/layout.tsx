import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Navbar } from '@/components/ssc/navbar'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SSC스파르타 | 철저한 관리가 합격을 만든다',
  description:
    '원주·춘천·충주에서 노량진 프로그램 그대로. 공무원·임용·독학재수·전문자격 등 성인학습으로 가능한 모든 공부 — SSC스파르타가 합격을 설계합니다.',
  keywords: ['공무원 학원', '강원도 공무원', '원주 공무원', '커넥츠프랩', '공단기', 'SSC스파르타'],
  openGraph: {
    title: 'SSC스파르타 | 철저한 관리가 합격을 만든다',
    description: '원주·춘천·충주에서 노량진 프로그램 그대로. 공무원·임용·독학재수·전문자격 등 성인학습으로 가능한 모든 공부 — SSC스파르타가 합격을 설계합니다.',
    locale: 'ko_KR',
    type: 'website',
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
      <body className={`${inter.variable} font-sans antialiased text-[#1D1D1F] overflow-x-hidden pt-16 md:pt-20`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Navbar />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
