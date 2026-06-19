'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { Navbar } from './navbar'

// 마케팅 네비를 숨기는 앱 화면들(관리자/출결/학생포털/리포트).
// navbar.tsx 의 숨김 조건과 동일하게 유지한다.
const APP_ROUTES = ['/admin', '/attend', '/student', '/report']

// 마케팅 페이지에만 고정 네비 높이만큼의 상단 여백을 준다.
// 앱 화면(풀스크린 키오스크/출결 등)에는 여백을 두지 않아 상단 빈 띠를 없앤다.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAppRoute = APP_ROUTES.some((p) => pathname?.startsWith(p))

  return (
    <>
      <Navbar />
      <div className={isAppRoute ? '' : 'pt-16 md:pt-20'}>{children}</div>
    </>
  )
}
