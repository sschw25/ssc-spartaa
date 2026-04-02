'use client'

import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'] as const

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const isGongmuwonPage = pathname.includes('gongmuwon')

  // 현재 경로에서 캠퍼스 식별
  const campusOnPath = CAMPUSES.find((c) => pathname.startsWith(`/${c}`))
  const isSubPage = campusOnPath && pathname !== `/${campusOnPath}`
  const basePath = campusOnPath ? `/${campusOnPath}` : ''

  const navLinks = [
    { label: '홈', href: '#hero' },
    { label: '이달의 프로그램', href: campusOnPath ? `/${campusOnPath}/programs` : '#monthly-program' },
    { label: '프로그램', href: '#programs' },
    { label: '합격후기', href: '#testimonials' },
    { label: '내부시설', href: campusOnPath ? `/${campusOnPath}/interior` : '#interior-facilities' },
    { label: '캠퍼스', href: '#campus' },
    { label: '상담신청', href: '#cta' },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLink = (href: string) => {
    setOpen(false)
    if (href.startsWith('/')) {
      router.push(href)
    } else if (isSubPage) {
      router.push(`${basePath}${href}`)
    } else {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/80 backdrop-blur-xl border-b border-black/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.02)]'
            : 'bg-transparent'
        }`}
      >
        <nav className="max-w-[64rem] mx-auto px-4 sm:px-6 flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <button
            onClick={() => handleLink('#hero')}
            className={`flex items-center font-semibold text-lg md:text-xl tracking-tight transition-colors duration-300 ${
              scrolled ? 'text-[#1D1D1F]' : 'text-[#1D1D1F]'
            }`}
          >
            {isGongmuwonPage ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span>SSC<span className="text-[#86868B] font-medium ml-[0.5px]">스파르타</span></span>
                <span className="text-[#86868B] font-light text-sm sm:text-base">X</span>
                <span className="text-[#0071E3] font-bold">커넥츠프랩</span>
              </div>
            ) : (
              <>SSC<span className="text-[#86868B] font-medium ml-[1px]">스파르타</span></>
            )}
          </button>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <li key={link.href}>
                <button
                  onClick={() => handleLink(link.href)}
                  className={`text-[13px] font-medium tracking-tight transition-colors ${
                    scrolled
                      ? 'text-[#86868B] hover:text-[#1D1D1F]'
                      : 'text-[#434345] hover:text-black'
                  }`}
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop CTA */}
          <button
            onClick={() => handleLink('#cta')}
            className="hidden md:inline-flex items-center px-4 py-2 rounded-full bg-[#1D1D1F] text-white text-[13px] font-medium hover:scale-105 hover:bg-black transition-all hover:shadow-[0_4px_14px_rgba(0,0,0,0.15)]"
          >
            무료 상담
          </button>

          {/* Mobile hamburger */}
          <button
            className={`md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors text-[#1D1D1F]`}
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>
        </nav>
      </header>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="flex-1 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside className="w-[280px] h-full bg-[#F5F5F7] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 bg-white">
              <span className="font-semibold text-lg text-[#1D1D1F]">
                {isGongmuwonPage ? (
                  <div className="flex items-center gap-1.5">
                    <span>SSC<span className="text-[#86868B] font-medium">스파르타</span></span>
                    <span className="text-[#86868B] font-light text-sm">X</span>
                    <span className="text-[#0071E3] font-bold">커넥츠프랩</span>
                  </div>
                ) : (
                  <>SSC<span className="text-[#86868B]">스파르타</span></>
                )}
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
                className="p-2 min-w-[48px] min-h-[48px] flex items-center justify-center"
              >
                <X size={22} className="text-[#86868B]" strokeWidth={1.5} />
              </button>
            </div>
            <ul className="flex flex-col px-4 py-4 gap-1 flex-1 bg-white">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <button
                    onClick={() => handleLink(link.href)}
                    className="w-full text-left px-2 py-4 text-[14px] font-medium text-[#1D1D1F] hover:text-black border-b border-black/[0.03] transition-colors"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="p-6 bg-[#F5F5F7]">
              <button
                onClick={() => handleLink('#cta')}
                className="w-full py-3 rounded-xl bg-[#1D1D1F] text-white text-[14px] font-medium hover:bg-black shadow-[0_4px_14px_rgba(0,0,0,0.1)] transition-all"
              >
                무료 상담 신청하기
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
