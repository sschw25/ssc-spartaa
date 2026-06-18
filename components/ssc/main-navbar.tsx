'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight, HelpCircle } from 'lucide-react'

export function MainNavbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

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
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 group">
            <div className="flex items-baseline gap-1">
              <span className="text-base md:text-[17px] font-extrabold tracking-tighter text-[#1D1D1F]">SSC</span>
              <span className="text-base md:text-[17px] font-extrabold tracking-tighter text-[#1D1D1F]">
                스파르타
              </span>
            </div>
          </Link>

          {/* Desktop Central Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a 
              href="#programs" 
              onClick={(e) => scrollToSection(e, 'programs')}
              className="text-xs font-bold text-[#434345] hover:text-black transition-colors"
            >
              제공 프로그램
            </a>
            <a 
              href="#campuses" 
              onClick={(e) => scrollToSection(e, 'campuses')}
              className="text-xs font-bold text-[#434345] hover:text-black transition-colors"
            >
              캠퍼스 안내
            </a>
            <Link 
              href="/wonju/gongmuwon" 
              className="text-xs font-bold text-[#0071E3] hover:text-[#005bb5] transition-colors"
            >
              원주 공무원학원
            </Link>
          </div>

          {/* Right Action Area */}
          <div className="flex items-center gap-4">
            {/* Summer School Dropdown */}
            <div className="relative group">
              <button 
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ${
                  isScrolled 
                    ? 'text-[#0071E3] hover:bg-[#0071E3]/10' 
                    : 'text-[#0071E3] hover:bg-white/10'
                }`}
              >
                🔥 썸머스쿨
                <ChevronRight size={14} className="rotate-90 group-hover:-rotate-90 transition-transform duration-300" />
              </button>
              
              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-xl border border-black/5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 overflow-hidden">
                <div className="py-2 flex flex-col">
                  <Link href="/wonju/summer" className="px-5 py-3 text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors">원주 썸머스쿨</Link>
                  <Link href="/chuncheon/summer" className="px-5 py-3 text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors">춘천 썸머스쿨</Link>
                  <Link href="/chungju/summer" className="px-5 py-3 text-[13px] font-bold text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors">충주 썸머스쿨</Link>
                </div>
              </div>
            </div>
            
            {/* Consultation Trigger */}
            <a 
              href="#campuses" 
              onClick={(e) => scrollToSection(e, 'campuses')}
              className={`hidden md:flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold transition-all duration-500 ${
                isScrolled 
                  ? 'bg-[#1D1D1F] text-white hover:bg-black shadow-lg shadow-black/10' 
                  : 'bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]'
              }`}
            >
              상담 예약
              <ChevronRight size={14} />
            </a>

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
            <div className="flex flex-col gap-6 pb-12">
              <div className="flex flex-col gap-2 border-b border-black/[0.05] pb-4">
                <a 
                  href="#programs" 
                  onClick={(e) => scrollToSection(e, 'programs')}
                  className="text-lg font-bold text-[#1D1D1F] py-2"
                >
                  제공 프로그램
                </a>
                <a 
                  href="#campuses" 
                  onClick={(e) => scrollToSection(e, 'campuses')}
                  className="text-lg font-bold text-[#1D1D1F] py-2"
                >
                  캠퍼스 안내
                </a>
                <Link 
                  href="/wonju/gongmuwon" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-bold text-[#0071E3] py-2"
                >
                  원주 공무원학원
                </Link>
              </div>

              {/* Mobile Summer School Info */}
              <div className="flex flex-col gap-2">
                <p className="text-[#0071E3] font-extrabold text-sm px-1 mb-1">🔥 2026 썸머스쿨 바로가기</p>
                <div className="grid grid-cols-3 gap-2">
                  <Link 
                    href="/wonju/summer" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-[#0071E3]/5 text-[#0071E3] text-center py-4 rounded-xl font-bold text-[13px] active:scale-95 transition-all"
                  >
                    원주점
                  </Link>
                  <Link 
                    href="/chuncheon/summer" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-[#0071E3]/5 text-[#0071E3] text-center py-4 rounded-xl font-bold text-[13px] active:scale-95 transition-all"
                  >
                    춘천점
                  </Link>
                  <Link 
                    href="/chungju/summer" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="bg-[#0071E3]/5 text-[#0071E3] text-center py-4 rounded-xl font-bold text-[13px] active:scale-95 transition-all"
                  >
                    충주점
                  </Link>
                </div>
              </div>

              <a 
                href="#campuses" 
                onClick={(e) => scrollToSection(e, 'campuses')}
                className="mt-4 bg-[#1D1D1F] text-white text-center py-5 rounded-2xl font-extrabold text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                캠퍼스 선택 및 상담 예약
                <ChevronRight size={20} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
