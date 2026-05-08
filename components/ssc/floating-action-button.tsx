'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ArrowUp, MapPin, Phone, MessageCircle } from 'lucide-react'
import { CAMPUS_CONFIG, CampusKey } from '@/lib/campus-config'

export function FloatingActionButton() {
  const [isVisible, setIsVisible] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const params = useParams()
  
  const campus = (params?.campus as CampusKey) || 'wonju'
  const config = CAMPUS_CONFIG[campus] || CAMPUS_CONFIG['wonju']

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
        setIsOpen(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    setIsOpen(false)
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Expanded Menu */}
      <div 
        className={`flex flex-col gap-3 transition-all duration-300 origin-bottom ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'
        }`}
      >
        <a
          href={config.naverMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-white/90 backdrop-blur-md shadow-lg rounded-full py-3 px-4 hover:bg-[#F5F5F7] transition-colors border border-black/5"
        >
          <span className="text-[13px] font-medium text-[#1D1D1F] whitespace-nowrap">방문 상담(지도)</span>
          <div className="w-8 h-8 rounded-full bg-[#E5F1FF] text-[#0071E3] flex items-center justify-center">
            <MapPin size={16} />
          </div>
        </a>

        <a
          href={`tel:${config.phone}`}
          className="flex items-center gap-3 bg-white/90 backdrop-blur-md shadow-lg rounded-full py-3 px-4 hover:bg-[#F5F5F7] transition-colors border border-black/5"
        >
          <span className="text-[13px] font-medium text-[#1D1D1F] whitespace-nowrap">전화 문의하기</span>
          <div className="w-8 h-8 rounded-full bg-[#E5F8EB] text-[#34C759] flex items-center justify-center">
            <Phone size={16} />
          </div>
        </a>

        <button
          onClick={scrollToTop}
          className="flex items-center gap-3 bg-white/90 backdrop-blur-md shadow-lg rounded-full py-3 px-4 hover:bg-[#F5F5F7] transition-colors border border-black/5"
        >
          <span className="text-[13px] font-medium text-[#1D1D1F] whitespace-nowrap">맨 위로 가기</span>
          <div className="w-8 h-8 rounded-full bg-[#F5F5F7] text-[#1D1D1F] flex items-center justify-center">
            <ArrowUp size={16} />
          </div>
        </button>
      </div>

      {/* Main Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-black/80 backdrop-blur-xl text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group border border-white/10"
      >
        <MessageCircle 
          strokeWidth={2} 
          className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-90 opacity-0 absolute' : 'rotate-0 opacity-100'}`} 
        />
        <ArrowUp 
          strokeWidth={2} 
          className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0 absolute'}`} 
        />
      </button>
    </div>
  )
}
