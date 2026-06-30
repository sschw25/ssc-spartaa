'use client'

import React, { useRef } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, ShieldAlert, Award } from 'lucide-react'

interface GongmuwonCardsProps {
  campusName: string
}

export default function GongmuwonCards({ campusName }: GongmuwonCardsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft } = scrollRef.current
      const cardWidth = 320 + 24 // 카드 너비 + gap
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth
      scrollRef.current.scrollTo({
        left: scrollLeft + scrollAmount,
        behavior: 'smooth',
      })
    }
  }

  const cardsData = [
    {
      id: 1,
      icon: <Award className="w-8 h-8 text-[#007AFF]" />,
      title: `${campusName} 유일의\n공단기 파트너`,
      description: `노량진 공단기·경단기·소단기 본원의 실시간 합격 예측 전국 모의고사 시스템과 1타 강사진의 하프 테스트 등 노량진 독점 콘텐츠를 제공받습니다.`,
      badge: '독점 제휴',
    },
    {
      id: 2,
      icon: <ShieldAlert className="w-8 h-8 text-[#007AFF]" />,
      title: `노량진의 관리를\n${campusName}에서 그대로`,
      description: `하루 12시간 엄격한 교시제 밀착 출결 관리, 원내 대화 및 친목 완전 차단, 스마트폰 수거 및 유해 사이트 통제로 오직 공부에만 완전 침잠할 수 있는 절대 몰입 환경을 갖췄습니다.`,
      badge: '스파르타 통제',
    },
    {
      id: 3,
      icon: <CheckCircle2 className="w-8 h-8 text-[#007AFF]" />,
      title: `전국 석차 및\n정밀 오답률 분석`,
      description: `전국 단위 모의고사를 마친 후, 문항별 정답률 분석과 직렬별 석차 데이터를 제공합니다. 1:1 학습 상담 및 취약점 보완 지도를 통해 불필요한 시행착오를 단축합니다.`,
      badge: '데이터 피드백',
    },
  ]

  return (
    <section className="bg-white py-16 border-b border-black/[0.03] overflow-hidden">
      <div className="max-w-[64rem] w-full mx-auto px-6">
        
        {/* Section Header */}
        <div className="flex flex-col items-center gap-6 mb-10 text-center">
          <div className="max-w-2xl">
            <p className="text-[#007AFF] text-[11px] font-semibold tracking-[0.18em] uppercase mb-3">
              Why SSC Sparta
            </p>
            <h2 className="text-[#1D1D1F] text-2xl md:text-4xl font-semibold tracking-tight text-balance">
              합격할 수밖에 없는<br className="md:hidden" /> 압도적 스파르타 시스템
            </h2>
          </div>
          
          {/* Scroll Navigation Controls */}
          <div className="flex md:hidden items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-white text-[#1D1D1F] shadow-sm transition-transform active:scale-95"
              aria-label="이전 카드 보기"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#F5F5F7] px-4 text-[11px] font-semibold tracking-tight text-[#86868B]">
              옆으로 넘겨보기
              <ChevronRight size={14} />
            </span>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-white text-[#1D1D1F] shadow-sm transition-transform active:scale-95"
              aria-label="다음 카드 보기"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Horizontal Card Carousel (Mobile: flex scroll / Desktop: grid layout) */}
        <div className="relative -mx-6 md:mx-0">
          <div
            ref={scrollRef}
            className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-4 md:pb-0 px-6 md:px-0 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {cardsData.map((card) => (
              <div
                key={card.id}
                className="group relative rounded-[28px] bg-[#F5F5F7] border border-black/[0.02] p-8 shadow-sm flex flex-col justify-between min-h-[300px] w-[290px] sm:w-[320px] md:w-full shrink-0 md:shrink snap-start hover:shadow-md hover:border-black/5 transition-all duration-300"
              >
                {/* Card Header */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="p-3 rounded-2xl bg-white shadow-sm group-hover:scale-110 transition-transform duration-300">
                      {card.icon}
                    </div>
                    <span className="text-[11px] font-semibold tracking-tight text-[#86868B] px-3 py-1 rounded-full bg-black/[0.04]">
                      {card.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-semibold tracking-tight text-[#1D1D1F] leading-tight mb-4 whitespace-pre-line">
                    {card.title}
                  </h3>
                </div>

                {/* Card Body Description */}
                <p className="text-sm font-medium text-[#86868B] leading-relaxed tracking-tight">
                  {card.description}
                </p>
                
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent md:hidden" />
        </div>
        
      </div>
    </section>
  )
}
