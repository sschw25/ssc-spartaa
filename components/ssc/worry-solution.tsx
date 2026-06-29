'use client'

import { motion } from 'framer-motion'
import { ArrowDown, Check } from 'lucide-react'
import type { WorriesSection } from '@/lib/stream-content'
import { resolveStreamIcon } from '@/components/ssc/stream-icons'

const EASE = [0.16, 1, 0.3, 1] as const

export function WorrySolution({ data }: { data: WorriesSection }) {
  return (
    <section id="worries" className="bg-[#F5F5F7] py-24 md:py-32 border-t border-black/[0.04]">
      <div className="max-w-[60rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-16 text-center"
        >
          <p className="text-[#FF9500] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            Worries &amp; Answers
          </p>
          <h2 className="section-title mb-4 leading-tight whitespace-pre-line">{data.title}</h2>
          <p
            className="text-[#86868B] font-medium max-w-xl mx-auto leading-relaxed whitespace-pre-line"
            style={{ fontSize: 'var(--font-size-body-lg)' }}
          >
            {data.subtitle}
          </p>
        </motion.div>

        {/* Worry → Solution stack */}
        <div className="flex flex-col gap-6">
          {data.items.map((item, i) => {
            const Icon = resolveStreamIcon(item.icon)
            return (
              <motion.div
                key={item.worry}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, ease: EASE, delay: i * 0.05 }}
                className="grid grid-cols-1 md:grid-cols-2 rounded-[24px] overflow-hidden border border-black/[0.05] bg-white shadow-[0_4px_14px_rgba(0,0,0,0.02)]"
              >
                {/* Worry side */}
                <div className="relative p-7 md:p-9 bg-[#FBFBFD] border-b md:border-b-0 md:border-r border-black/[0.05]">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFEEEC] text-[#D63229] text-[11px] font-semibold tracking-tight mb-5">
                    이런 게 걱정되시죠
                  </span>
                  <h3 className="text-[#1D1D1F] text-xl font-semibold tracking-tight mb-2.5 leading-snug whitespace-pre-line">
                    {item.worry}
                  </h3>
                  <p className="text-[#86868B] text-[15px] font-medium leading-relaxed whitespace-pre-line">
                    {item.worryDetail}
                  </p>

                  {/* Connector arrow */}
                  <div className="absolute left-1/2 -translate-x-1/2 -bottom-[18px] md:left-auto md:right-[-18px] md:top-1/2 md:bottom-auto md:translate-x-0 md:-translate-y-1/2 z-10">
                    <div className="w-9 h-9 rounded-full bg-[#1D1D1F] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.18)] ring-4 ring-[#F5F5F7]">
                      <ArrowDown size={16} className="text-white md:-rotate-90" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>

                {/* Solution side */}
                <div className="relative p-7 md:p-9 bg-white">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F1FC] text-[#007AFF] text-[11px] font-semibold tracking-tight mb-5">
                    SSC스파르타의 답
                  </span>
                  <div className="flex items-start gap-3.5">
                    <div className="shrink-0 w-11 h-11 rounded-[14px] bg-[#007AFF] flex items-center justify-center shadow-[0_4px_12px_rgba(0,113,227,0.25)]">
                      <Icon size={20} className="text-white" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="text-[#1D1D1F] text-xl font-semibold tracking-tight mb-2.5 leading-snug whitespace-pre-line">
                        {item.solution}
                      </h3>
                      <p className="text-[#434345] text-[15px] font-medium leading-relaxed whitespace-pre-line">
                        {item.solutionDetail}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-[#34C759] text-[13px] font-semibold">
                    <Check size={15} strokeWidth={2.5} /> 관리로 해결됩니다
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
