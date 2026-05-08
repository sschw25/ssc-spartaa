'use client'

import { useState, useEffect } from 'react'

const TABS = [
  { id: 'stats', label: '성과' },
  { id: 'testimonials', label: '수기' },
  { id: 'curriculum', label: '시간표' },
  { id: 'timeline', label: '하루전경' },
  { id: 'systems', label: '시스템' },
  { id: 'facilities', label: '시설' },
  { id: 'faq', label: 'FAQ' },
]

export function StickySubNav() {
  const [activeTab, setActiveTab] = useState('')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Show nav after hero
      if (window.scrollY > 500) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }

      // Track active section
      for (const tab of [...TABS].reverse()) {
        const element = document.getElementById(tab.id)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 120) {
            setActiveTab(tab.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100 // Navbar height + buffer
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth',
      })
    }
  }

  if (!isVisible) return <div className="h-0" />

  return (
    <nav className="sticky top-14 md:top-16 z-40 bg-white/90 backdrop-blur-md border-b border-black/[0.05] transition-all duration-500 animate-in fade-in slide-in-from-top-4">
      <div className="max-w-[64rem] mx-auto px-4 overflow-x-auto no-scrollbar">
        <ul className="flex items-center justify-between md:justify-center md:gap-12 min-w-max h-12">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => scrollToSection(tab.id)}
                className={`relative h-12 text-[13px] font-semibold transition-colors whitespace-nowrap px-1 ${
                  activeTab === tab.id ? 'text-[#1D1D1F]' : 'text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1D1D1F] rounded-full" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
