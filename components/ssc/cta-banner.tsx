'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { MapPin, Phone } from 'lucide-react'
import { CAMPUS_CONFIG } from '@/lib/campus-config'

interface CtaBannerProps {
  phone?: string
  naverTalkUrl?: string
  naverMapUrl?: string
}

export function CtaBanner({
  phone = CAMPUS_CONFIG.wonju.phone,
  naverTalkUrl = CAMPUS_CONFIG.wonju.naverTalkUrl,
  naverMapUrl = CAMPUS_CONFIG.wonju.naverMapUrl,
}: CtaBannerProps) {
  const ref = useScrollReveal()

  return (
    <section id="cta" className="bg-white py-24 md:py-32 border-t border-black/[0.04]" ref={ref}>
      <div className="max-w-[42rem] mx-auto px-4 sm:px-6 text-center">
        <div className="fade-in-up">
          <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#F5F5F7] text-[#86868B] text-xs font-bold tracking-widest uppercase mb-6 border border-black/5">
            1일 무료 체험 예약
          </span>
          <h2 className="text-[#1D1D1F] text-3xl md:text-5xl font-semibold tracking-tighter mb-4 leading-tight">
            압도적인 차이를<br />
            직접 경험해 보세요.
          </h2>
          <p className="text-[#86868B] text-base md:text-lg font-medium leading-relaxed mb-10 max-w-lg mx-auto">
            원하는 방법으로 방문 예약을 남겨주시면, 친절하게 센터 안내 및 무료 체험을 도와드립니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {/* Action 1: Naver Map Reservation */}
            <a
              href={naverMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-[#1D1D1F] text-white font-semibold text-[15px] hover:bg-black hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_4px_14px_rgba(0,0,0,0.15)]"
            >
              <MapPin size={18} strokeWidth={2.5} />
              네이버 방문 예약
            </a>
            
            {/* Action 2: Direct Phone Call */}
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full border border-black/10 bg-[#F5F5F7] text-[#1D1D1F] font-semibold text-[15px] hover:bg-white hover:border-black/20 hover:shadow-sm transition-all duration-300"
            >
              <Phone size={18} strokeWidth={2.5} />
              전화로 예약하기
            </a>
          </div>

          <div className="mt-8 pt-8 border-t border-black/5">
            <p className="text-sm font-medium text-[#86868B]">
              또는 <a href={naverTalkUrl} target="_blank" rel="noopener noreferrer" className="text-[#0071E3] font-semibold hover:underline">네이버 톡톡</a>으로 간편하게 문의하실 수 있습니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
