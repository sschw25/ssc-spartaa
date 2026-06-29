'use client'

import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { ExamInfo } from '@/lib/stream-content'

const EASE = [0.16, 1, 0.3, 1] as const

export function ExamInfo2026({ data }: { data: ExamInfo }) {
  return (
    <section id="exam-2026" className="bg-white py-24 md:py-32 border-t border-black/[0.04]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-16 text-center"
        >
          <p className="inline-flex items-center gap-1.5 text-[#007AFF] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            <Sparkles size={13} strokeWidth={2} /> 2026 Exam Update
          </p>
          <h2 className="section-title mb-4 leading-tight whitespace-pre-line">{data.title}</h2>
          <p
            className="text-[#86868B] font-medium max-w-xl mx-auto leading-relaxed whitespace-pre-line"
            style={{ fontSize: 'var(--font-size-body-lg)' }}
          >
            {data.subtitle}
          </p>
        </motion.div>

        {/* Fact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.facts.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
              className="group rounded-[20px] border border-black/[0.05] bg-[#F5F5F7] p-6 hover:bg-white hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 transition-all duration-300"
            >
              <p className="text-[13px] font-medium text-[#86868B] mb-2">
                {f.label}
              </p>
              <p className="text-[#1D1D1F] text-[17px] font-semibold tracking-tight leading-snug whitespace-pre-line">
                {f.value}
              </p>
              {f.note && (
                <p className="mt-2 text-[13px] font-medium text-[#86868B] leading-relaxed whitespace-pre-line">
                  {f.note}
                </p>
              )}
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
