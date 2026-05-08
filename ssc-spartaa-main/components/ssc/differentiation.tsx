'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Shield, BarChart3, Users } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'

const features = [
  {
    icon: Shield,
    title: '원주 유일\n공단기·커넥츠프랩 파트너',
    description: '노량진 프리미엄 커리큘럼 그대로,\n강원도 밀착 관리로 완성합니다.',
  },
  {
    icon: BarChart3,
    title: '전국 모의고사 &\n취약점 분석 프로그램',
    description: '실시간 데이터로 약점을 정확히 파악하고\n최적의 학습 전략을 수립합니다.',
  },
  {
    icon: Users,
    title: '코멘터 담임제 —\n전과정 밀착 케어',
    description: '매일 플래너 점검부터 멘탈 관리까지,\n의지가 흔들리는 순간마다 곁을 지킵니다.',
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
          <h2 className="section-title mb-4 leading-tight">
            서울까지 안 가도 됩니다
          </h2>
          <div className="text-text-secondary leading-relaxed max-w-2xl mx-auto break-keep" style={{ fontSize: 'var(--font-size-body-lg)' }}>
            <RhythmicText text={"노량진 커리큘럼 그대로, 강원도 밀착 관리로 완성하는\nSSC 스파르타만의 압도적인 합격 관리 시스템"} />
          </div>
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
                  <RhythmicText text={f.title} />
                </h3>
                <div className="text-sm text-text-secondary leading-relaxed break-keep">
                   <RhythmicText text={f.description} />
                </div>
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
