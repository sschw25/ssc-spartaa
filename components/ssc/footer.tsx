'use client'

import React, { useState } from 'react'
import { Instagram, ExternalLink, ChevronDown, Facebook } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { CAMPUS_CONFIG } from '@/lib/campus-config'

const footerLinks = [
  { label: '회사소개', href: '/about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy', bold: true },
  { label: '강사모집', href: '/recruit' },
]

const familySites = [
  { label: '공단기 (원주 파트너)', href: 'https://gong.conects.com/' },
  { label: '경단기', href: 'https://gyung.conects.com/' },
  { label: '소단기', href: 'https://so.conects.com/' },
  { label: '숨마투스', href: 'https://summa.conects.com/' },
]

export function Footer() {
  const [familyOpen, setFamilyOpen] = useState(false)
  const pathname = usePathname()
  const isGongmuwonPage = pathname.includes('gongmuwon')

  return (
    <footer className="bg-white border-t border-black/5 py-14">
      <div className="max-w-[72rem] mx-auto px-4 sm:px-6">
        
        {/* Top Navigation & Family Site */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 pb-8 border-b border-black/[0.03]">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {footerLinks.map((link, i) => (
              <React.Fragment key={link.label}>
                <a 
                  href={link.href} 
                  className={`text-[13px] ${link.bold ? 'font-bold text-[#1D1D1F]' : 'text-[#86868B]'} hover:text-[#0071E3] transition-colors`}
                >
                  {link.label}
                </a>
                {i < footerLinks.length - 1 && (
                  <span className="w-[1px] h-3 bg-black/10 hidden sm:block" />
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="relative w-full md:w-56">
            <button
              onClick={() => setFamilyOpen(!familyOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F5F5F7] border border-black/[0.05] rounded-xl text-[13px] font-medium text-[#1D1D1F] hover:bg-black/[0.03] transition-all"
            >
              <span>패밀리 사이트</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${familyOpen ? 'rotate-180' : ''}`} />
            </button>
            {familyOpen && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white border border-black/[0.08] shadow-2xl rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
                {familySites.map((site) => (
                  <a
                    key={site.label}
                    href={site.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 text-[12px] text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
                  >
                    {site.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Company Info Block */}
        <div className="text-[12px] leading-[1.8] text-[#86868B]">
          <p className="font-bold text-[#434345] mb-2 text-[13px]">(주)에스에스씨 스파르타</p>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(원주) :</span>
              <a href={`tel:${CAMPUS_CONFIG.wonju.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.wonju.phone}</a>
            </div>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(춘천) :</span>
              <a href={`tel:${CAMPUS_CONFIG.chuncheon.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.chuncheon.phone}</a>
            </div>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(충주) :</span>
              <a href={`tel:${CAMPUS_CONFIG.chungju.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.chungju.phone}</a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-[#86868B]/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">이메일주소 :</span>
              <a href="mailto:cs@sscsparta.com" className="hover:text-[#0071E3]">cs@sscsparta.com</a>
            </div>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">주사무소(원주) :</span>
              <span>{CAMPUS_CONFIG.wonju.address}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#86868B]/80">
            <p><span className="font-medium">대표이사 :</span> [대표자 성함]</p>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <p><span className="font-medium">원주 아카데미 평생교육원(제1021호)</span></p>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <p><span className="font-medium">사업자 등록번호 :</span> [사업자 번호]</p>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <p><span className="font-medium">통신판매업신고 :</span> [신고 번호]</p>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <p><span className="font-medium text-[#0071E3]/70 underline cursor-pointer">사업자 정보확인</span></p>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <p><span className="font-medium">호스팅제공자 :</span> Vercel Inc.</p>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 opacity-60">
            <p className="text-[11px] tracking-tight">
              Copyright © 2025 (주)에스에스씨 스파르타 All rights reserved. 
              단기 합격의 꿈, SSC 스파르타가 함께합니다.
            </p>
            
            <div className="flex items-center gap-4">
              <a href="https://blog.naver.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0071E3] transition-colors font-bold text-[13px]">N</a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0071E3] transition-colors"><Instagram size={15} strokeWidth={1.5} /></a>
              <a href="https://pf.kakao.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0071E3] transition-colors"><ExternalLink size={13} strokeWidth={1.5} /></a>
            </div>
          </div>
        </div>

      </div>
    </footer>
  )
}
