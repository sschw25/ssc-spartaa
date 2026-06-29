'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronDown, Flag, Sparkles } from 'lucide-react'
import type { StreamRoadmap as StreamRoadmapData } from '@/lib/stream-content'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * 직렬별 1년 학습 로드맵 (면접 페이지 디자인 톤).
 * 특정 날짜가 아닌 상대적 단계(입문기→실전기→시험)로 구성해 유지보수가 필요 없다.
 * 데스크톱: 가로 스텝 + 화살표 연결 / 모바일: 세로 스택.
 */
export function StreamRoadmap({ data }: { data: StreamRoadmapData }) {
  const phases = data.phases

  return (
    <section id="roadmap" className="bg-[#F8F9FA] py-16 md:py-24 border-y border-[#E5E7EB]">
      <div className="max-w-5xl mx-auto px-4">
        {/* Heading */}
        <div className="text-center mb-12">
          <p className="inline-flex items-center gap-1.5 text-[#007AFF] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            <Sparkles size={13} strokeWidth={2} /> Year Roadmap
          </p>
          <h2 className="section-title mb-3 leading-tight whitespace-pre-line text-[#1D1D1F]">
            {data.title}
          </h2>
          <p className="text-sm md:text-base text-[#86868B] max-w-2xl mx-auto leading-relaxed whitespace-pre-line">
            {data.subtitle}
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-2">
          {phases.map((p, i) => (
            <React.Fragment key={i}>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.07 }}
                className={`relative flex-1 rounded-2xl border bg-white p-5 md:p-6 ${
                  p.exam
                    ? 'border-[#007AFF] ring-1 ring-[#007AFF]/15 shadow-sm shadow-blue-500/5'
                    : 'border-[#E5E7EB]'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                      p.exam ? 'bg-blue-50 text-[#007AFF]' : 'bg-[#F5F5F7] text-[#1D1D1F]'
                    }`}
                  >
                    {p.exam ? <Flag size={16} strokeWidth={2.4} /> : i + 1}
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      p.exam ? 'bg-blue-50 text-[#007AFF]' : 'bg-[#F5F5F7] text-[#86868B]'
                    }`}
                  >
                    {p.period}
                  </span>
                </div>
                <h3 className="font-bold text-[#1D1D1F] mb-1.5 tracking-tight leading-snug whitespace-pre-line">
                  {p.title}
                </h3>
                <p className="text-[#86868B] text-sm leading-relaxed whitespace-pre-line">
                  {p.focus}
                </p>
              </motion.div>

              {/* connector */}
              {i < phases.length - 1 && (
                <div className="flex items-center justify-center text-[#C7C7CC] shrink-0">
                  <ChevronRight size={18} className="hidden lg:block" />
                  <ChevronDown size={18} className="lg:hidden" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-[#86868B] leading-relaxed">
          * 위 흐름은 합격까지의 대략적인 학습 단계이며, 실제 일정은 시험 회차·직렬·개인 상황에 따라 조정됩니다.
        </p>
      </div>
    </section>
  )
}
