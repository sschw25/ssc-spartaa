'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { ArrowRight } from 'lucide-react'

export function Subsidy() {
  const ref = useScrollReveal()

  return (
    <section id="subsidy" className="bg-background-blue-soft py-16 md:py-20" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center fade-in-up">
          {/* Badge */}
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-accent-blue/15 text-accent-blue text-xs font-semibold border border-accent-blue/30 mb-5">
            원주시 청년 지원사업
          </span>

          {/* Heading */}
          <h2 className="text-2xl md:text-3xl font-bold text-navy dark:text-foreground text-balance mb-4">
            원주시 청년이라면{' '}
            <span className="text-accent-blue">10만원 지원</span>받고 시작하세요
          </h2>

          {/* Body */}
          <p className="text-text-secondary leading-relaxed mb-6">
            원주시 1개월 이상 거주 만 18~39세 청년 대상.
            <br />
            관리형 독서실 등록 후 지원사업 신청 시 1인 1회 10만원 지원.
          </p>

          {/* CTA */}
          <button
            onClick={() =>
              document.querySelector('#cta')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-navy text-navy font-semibold text-sm hover:bg-navy/5 transition-colors dark:border-accent-blue dark:text-accent-blue dark:hover:bg-accent-blue/10"
          >
            지원 자격 확인하기
            <ArrowRight size={14} />
          </button>

          {/* Fine print */}
          <p className="mt-5 text-xs text-text-secondary leading-relaxed">
            대학 3학년 이상 휴학생, 4학년 재학생, 취업준비생 해당 / 직장인 · 고등학생 제외
          </p>
        </div>
      </div>
    </section>
  )
}
