'use client'

import React, { useRef } from 'react'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import { type TestimonialItem, streamContents } from '@/lib/stream-content'
import { RhythmicText } from '@/components/ui/rhythmic-text'

interface TestimonialsProps {
  testimonials?: TestimonialItem[]
  reviewUrl?: string
  bgImage?: string
  campusName?: string
}

export function Testimonials({ 
  testimonials = streamContents.gongmuwon.testimonials, 
  reviewUrl, 
  bgImage,
  campusName
}: TestimonialsProps) {
  const ref = useScrollReveal()
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft } = scrollRef.current
      const cardWidth = window.innerWidth * 0.85 + 16 // 모바일 카드 너비(85vw) + gap
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth
      scrollRef.current.scrollTo({
        left: scrollLeft + scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  // 지역명 자동 치환 함수
  const formatQuote = (quote: string) => {
    if (!campusName) return quote
    // 다른 지역명들을 현재 캠퍼스 명칭으로 변환
    return quote.replace(/원주|춘천|충주/g, campusName)
  }

  return (
    <section id="testimonials" className="relative pt-24 sm:pt-32 pb-12 overflow-hidden bg-[#F5F5F7]" ref={ref}>
      {bgImage && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
          {/* Base Image with Parallax-like attachment */}
          <div 
            className="absolute inset-0 opacity-[0.25] mix-blend-luminosity scale-105"
            style={{
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundAttachment: 'fixed',
              filter: 'grayscale(100%) blur(4px)'
            }}
          />
          {/* Nano-texture frosted glass overlay */}
          <div className="absolute inset-0 bg-[#F5F5F7]/80 backdrop-blur-[60px]" />
          
          {/* Subtle gradient sweeps for depth */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/40 via-transparent to-white/40" />
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="mb-16 text-center fade-in-up">
          <p className="text-[#007AFF] text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase mb-4">학생들의 치열한 기록</p>
          <h2 
            className="font-semibold text-[#1D1D1F] tracking-tighter mb-6 whitespace-pre-line break-keep drop-shadow-sm text-balance"
            style={{ fontSize: 'var(--font-size-section-title)' }}
          >
            고통의 시간 끝에 얻어낸{'\n'}
            합격의 희열
          </h2>
          <p className="text-[#86868B] text-base md:text-lg font-medium max-w-2xl mx-auto leading-relaxed whitespace-pre-line break-keep">
            SSC스파르타를 거쳐간 선배들의 생생한 후기가 증명합니다.{'\n'}
            다음 합격의 주인공은 당신입니다.
          </p>
        </div>

        {/* Mobile Scroll Controls */}
        <div className="flex md:hidden items-center justify-center gap-4 mb-6">
          <button
            onClick={() => handleScroll('left')}
            className="w-11 h-11 rounded-full border border-black/5 flex items-center justify-center bg-white text-[#1D1D1F] active:scale-95 transition-all shadow-sm"
            aria-label="이전 후기"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">
            후기 넘겨보기
          </span>
          <button
            onClick={() => handleScroll('right')}
            className="w-11 h-11 rounded-full border border-black/5 flex items-center justify-center bg-white text-[#1D1D1F] active:scale-95 transition-all shadow-sm"
            aria-label="다음 후기"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Desktop: grid / Mobile: snap scroll */}
        <div 
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-8 -mx-4 px-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible md:snap-none md:mx-0 md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden mb-12 scroll-smooth"
        >
          {testimonials.map((t) => (
            <article
              key={t.name}
              className="snap-center shrink-0 w-[85vw] md:w-auto fade-in-up"
            >
              <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 sm:p-10 h-full flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 relative overflow-hidden group hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 ease-out hover:-translate-y-1">
                {/* Subtle Nano-texture glow inside card */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <Quote size={28} className="w-10 h-10 text-[#007AFF]/10 mb-6 drop-shadow-sm group-hover:text-[#007AFF]/20 transition-colors duration-300" strokeWidth={2} />
                <blockquote className="text-[16px] font-medium text-[#1D1D1F] leading-relaxed tracking-tight flex-1 text-balance">
                  <RhythmicText text={`“${formatQuote(t.quote)}”`} className="inline" />
                </blockquote>
                <div className="flex flex-col gap-1 border-t border-black/5 pt-6 mt-auto">
                  <span className="text-[15px] font-semibold text-[#1D1D1F]">{t.name}</span>
                  <span className="text-[13px] text-[#007AFF] font-semibold tracking-wide">{t.result}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="fade-in-up delay-200 mx-auto mt-4 max-w-2xl text-center text-[11px] sm:text-xs font-medium leading-relaxed text-[#86868B] break-keep">
          *위 후기는 합격자와의 인터뷰 내용을 재구성한 것입니다. 다양한 합격수기 전문을 보려면 블로그에서 확인해보세요.
        </p>

        {/* 더보기 링크 */}
        {reviewUrl && (
          <div className="fade-in-up delay-200 flex justify-center mt-8">
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-4 pl-10 pr-14 py-3.5 rounded-full border border-black/10 text-[15px] font-semibold text-[#1D1D1F] hover:bg-[#1D1D1F] hover:text-white hover:border-black transition-all"
            >
              블로그에서 생생한 후기 더보기
              <ChevronRight size={16} strokeWidth={2.5} />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
