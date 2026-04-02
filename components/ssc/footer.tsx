'use client'

import { useState } from 'react'
import { Instagram, ExternalLink, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { CAMPUS_CONFIG } from '@/lib/campus-config'

const quickLinks = [
  { label: '홈', href: '#hero' },
  { label: '프로그램', href: '#programs' },
  { label: '합격후기', href: '#testimonials' },
  { label: '캠퍼스', href: '#campus' },
  { label: '상담신청', href: '#cta' },
]

const campusAddresses = Object.values(CAMPUS_CONFIG).map((c) => ({
  name: c.name,
  addr: c.addrShort,
  phone: c.phone,
}))

export function Footer() {
  const [campusOpen, setCampusOpen] = useState(false)
  const pathname = usePathname()
  const isGongmuwonPage = pathname.includes('gongmuwon')

  const scrollTo = (href: string) => {
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer className="bg-background-subtle border-t border-border-color">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand col */}
          <div>
            <div className="font-bold text-xl text-navy dark:text-accent-blue mb-2">
              {isGongmuwonPage ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>SSC<span className="text-accent-blue dark:text-accent-amber font-medium">스파르타</span></span>
                  <span className="text-text-secondary font-light text-sm">X</span>
                  <span className="text-[#0071E3] font-bold">커넥츠프랩</span>
                </div>
              ) : (
                <>SSC<span className="text-accent-blue dark:text-accent-amber">스파르타</span></>
              )}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              당신의 합격 파트너
            </p>
            <p className="text-xs text-text-secondary mt-4 leading-relaxed">
              대표전화{' '}
              <a href={`tel:${CAMPUS_CONFIG.wonju.phone}`} className="hover:text-accent-blue transition-colors">
                {CAMPUS_CONFIG.wonju.phone}(원주)
              </a>
            </p>
          </div>

          {/* Campus addresses — accordion on mobile */}
          <div>
            <button
              className="w-full flex items-center justify-between md:cursor-default"
              onClick={() => setCampusOpen((v) => !v)}
            >
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-0 md:mb-4">
                캠퍼스
              </p>
              <ChevronDown
                size={16}
                className={`text-text-secondary md:hidden transition-transform ${campusOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <div className={`overflow-hidden transition-all duration-300 md:max-h-none ${campusOpen ? 'max-h-64 mt-3' : 'max-h-0 md:max-h-none'}`}>
              <ul className="flex flex-col gap-3 md:mt-0">
                {campusAddresses.map((c) => (
                  <li key={c.name}>
                    <p className="text-sm font-semibold text-text-primary">{c.name}</p>
                    <p className="text-xs text-text-secondary">{c.addr}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Quick links + SNS */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
              빠른 링크
            </p>
            <ul className="flex flex-col gap-2 mb-6">
              {quickLinks.map((l) => (
                <li key={l.href}>
                  <button
                    onClick={() => scrollTo(l.href)}
                    className="text-sm text-text-secondary hover:text-navy dark:hover:text-accent-blue transition-colors"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>

            {/* SNS */}
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
              SNS
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-8 h-8 rounded-lg border border-border-color flex items-center justify-center text-text-secondary hover:text-accent-blue hover:border-accent-blue/40 transition-colors"
              >
                <Instagram size={15} strokeWidth={1.5} />
              </a>
              <a
                href="https://blog.naver.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Naver Blog"
                className="w-8 h-8 rounded-lg border border-border-color flex items-center justify-center text-text-secondary hover:text-accent-blue hover:border-accent-blue/40 transition-colors text-xs font-bold"
              >
                N
              </a>
              <a
                href="https://pf.kakao.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="KakaoTalk Channel"
                className="w-8 h-8 rounded-lg border border-border-color flex items-center justify-center text-text-secondary hover:text-accent-amber hover:border-accent-amber/40 transition-colors"
              >
                <ExternalLink size={13} strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border-color pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            © 2025 SSC스파르타 All rights reserved.
          </p>
          <p className="text-xs text-text-secondary">
            사업자등록번호 등 정보는 상담 시 안내드립니다.
          </p>
        </div>
      </div>
    </footer>
  )
}
