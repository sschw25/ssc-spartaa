'use client'

import {
  Clock,
  CheckSquare,
  BarChart2,
  MessageSquare,
  Heart,
  Home,
  BookOpen,
  ClipboardList,
  Target,
  Award,
  LucideIcon
} from 'lucide-react'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { StreamSystem, COMMON_SYSTEMS } from '@/lib/stream-content'

const iconMap: Record<string, LucideIcon> = {
  Clock,
  CheckSquare,
  BarChart2,
  MessageSquare,
  Heart,
  Home,
  BookOpen,
  ClipboardList,
  Target,
  Award
}

interface SystemsProps {
  systems?: StreamSystem[]
}

export function Systems({ systems = COMMON_SYSTEMS }: SystemsProps) {
  const ref = useScrollReveal()

  return (
    <section className="bg-white py-24 md:py-32 border-t border-black/5" ref={ref}>
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        
        <div className="mb-16 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            System
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 whitespace-pre-line break-keep">
            초격차를 만드는 관리 시스템
          </h2>
          <p className="text-[#86868B] text-base md:text-lg font-medium max-w-lg mx-auto leading-relaxed whitespace-pre-line break-keep">
            SSC스파르타만의 압도적인 관리 노하우.{'\n'}
            6가지 핵심 시스템으로 당신의 한계를 끌어올립니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {systems.map((s, i) => {
            const Icon = iconMap[s.icon]
            return (
              <div
                key={s.title}
                className={`fade-in-up delay-${(i % 4) * 100} group rounded-[28px] border border-black/[0.04] bg-[#F5F5F7] p-8 md:p-10 flex flex-col gap-5 hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-black/5 hover:-translate-y-1 transition-all duration-300 ease-out`}
              >
                <div className="w-14 h-14 rounded-[16px] bg-white shadow-sm flex items-center justify-center border border-black/[0.03] group-hover:scale-105 transition-transform duration-300 ease-out">
                  {Icon && <Icon size={24} className="text-[#0071E3]" strokeWidth={1.5} />}
                </div>
                <div>
                  <h3 className="text-[19px] font-semibold text-[#1D1D1F] tracking-tight mb-2.5 whitespace-pre-line break-keep">
                    {s.title}
                  </h3>
                  <p className="text-[15px] font-medium text-[#86868B] leading-relaxed whitespace-pre-line break-keep">
                    {s.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        
      </div>
    </section>
  )
}
