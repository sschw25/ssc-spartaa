'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Shield, BarChart3, Users } from 'lucide-react'

const features = [
  {
    icon: Shield,
    title: '원주 유일 커넥츠프랩(공단기) 파트너',
    description: '노량진 커리큘럼 그대로, 강원도 밀착 관리로 완성',
  },
  {
    icon: BarChart3,
    title: '전국모의고사 + 취약점 분석 프로그램 연계',
    description: '실시간 데이터로 약점을 정확히 잡고 학습 전략을 수립',
  },
  {
    icon: Users,
    title: '코멘터 담임제 — 학습·생활·멘탈 전과정 관리',
    description: '매일 플래너 점검, 의지가 흐트러지는 순간마다 옆에서 잡아줍니다',
  },
]

export function Differentiation() {
  const ref = useScrollReveal()

  return (
    <section
      className="bg-background-blue-soft py-20 md:py-28"
      ref={ref}
      style={{ backgroundColor: '#EEF2FF' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-12 fade-in-up text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 leading-tight">
            서울까지 안 가도 됩니다
          </h2>
          <p className="text-text-secondary leading-relaxed max-w-2xl mx-auto break-keep">
            노량진 커리큘럼 그대로, 강원도 밀착 관리로 완성하는<br className="hidden md:block" />
            SSC 스파르타만의 압도적인 합격 관리 시스템
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`fade-in-up delay-${(i + 1) * 100} rounded-[12px] border border-border-color bg-white dark:bg-background p-6 flex flex-row md:flex-col gap-4`}
              style={{ borderWidth: '0.5px' }}
            >
              {/* Icon — left on mobile, centered on desktop */}
              <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center flex-shrink-0 md:mx-auto">
                <f.icon size={24} className="text-[#1D1D1F]" strokeWidth={1.5} />
              </div>

              <div className="md:text-center">
                <h3 className="text-[17px] font-semibold text-[#1D1D1F] tracking-tight mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Added CTA for conversion */}
        <div className="mt-12 flex justify-center fade-in-up delay-400">
          <button 
            onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-[#1D1D1F] text-white font-bold text-[15px] hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            지금 상담 신청하기
            <Shield size={18} />
          </button>
        </div>
      </div>
    </section>
  )
}
