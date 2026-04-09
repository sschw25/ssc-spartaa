'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight } from 'lucide-react'

const navItems = [
  { 
    label: '공무원', 
    href: '#programs',
    stream: 'gongmuwon',
    campuses: [
      { name: '원주 캠퍼스', href: '/wonju/gongmuwon' },
      { name: '춘천 캠퍼스', href: '/chuncheon/gongmuwon' },
      { name: '충주 캠퍼스', href: '/chungju/gongmuwon' }
    ]
  },
  { 
    label: '임용고시', 
    href: '#programs',
    stream: 'imyong',
    campuses: [
      { name: '원주 캠퍼스', href: '/wonju/imyong' },
      { name: '춘천 캠퍼스', href: '/chuncheon/imyong' },
      { name: '충주 캠퍼스', href: '/chungju/imyong' }
    ]
  },
  { 
    label: '전문자격', 
    href: '#programs',
    stream: 'professional',
    campuses: [
      { name: '원주 캠퍼스', href: '/wonju/professional' },
      { name: '춘천 캠퍼스', href: '/chuncheon/professional' },
      { name: '충주 캠퍼스', href: '/chungju/professional' }
    ]
  },
  { 
    label: '독학재수', 
    href: '#programs',
    stream: 'suneung',
    campuses: [
      { name: '원주 캠퍼스', href: '/wonju/suneung' },
      { name: '춘천 캠퍼스', href: '/chuncheon/suneung' },
      { name: '충주 캠퍼스', href: '/chungju/suneung' }
    ]
  },
]

import { usePathname } from 'next/navigation'

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // 공무원 페이지(gongmuwon)인지 확인하는 로직
  const isGongmuwonPage = pathname?.includes('gongmuwon')

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
          isScrolled 
            ? 'py-3 bg-white/80 backdrop-blur-xl border-b border-black/[0.05] shadow-sm' 
            : 'py-5 bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo - Simplified with clean gothic text and partnership logic */}
          <Link href="/" className="flex items-center gap-1 group">
            <div className="flex items-baseline gap-1">
              <span className="text-base md:text-[17px] font-bold tracking-tighter text-[#1D1D1F]">SSC</span>
              <span className="text-base md:text-[17px] font-bold tracking-tighter text-[#1D1D1F]">
                스파르타
              </span>
              {isGongmuwonPage && (
                <div className="flex items-center gap-1.5 ml-1 animate-in fade-in slide-in-from-left-2 duration-700">
                  <span className="text-[#86868B] text-[10px] md:text-xs font-light opacity-60">X</span>
                  <span className="text-base md:text-[17px] font-bold text-[#0071E3] tracking-tight">커넥츠프랩</span>
                </div>
              )}
            </div>
          </Link>

          {/* Desktop Menu - Removed items as per user request */}
          <div className="hidden md:flex items-center gap-10">
          </div>

          {/* Right CTA */}
          <div className="flex items-center gap-4">
            <Link 
              href="#campuses" 
              className={`hidden md:flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold transition-all duration-500 ${
                isScrolled 
                  ? 'bg-[#1D1D1F] text-white hover:bg-black shadow-lg shadow-black/10' 
                  : 'bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]'
              }`}
            >
              상담 예약
              <ChevronRight size={14} />
            </Link>

            {/* Mobile Menu Toggle */}
            <button 
              className="md:hidden p-2 text-[#1D1D1F]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-[90] bg-white pt-24 px-6 overflow-y-auto"
          >
            <div className="flex flex-col gap-4 pb-12">
              {/* Mobile Menu Items - Removed as per user request */}
              <Link 
                href="#campuses" 
                onClick={() => setMobileMenuOpen(false)}
                className="mt-6 bg-[#1D1D1F] text-white text-center py-5 rounded-2xl font-extrabold text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                캠퍼스 선택 및 상담 예약
                <ChevronRight size={20} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
