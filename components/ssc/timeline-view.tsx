'use client'

import { motion } from 'framer-motion'
import { Sun, Coffee, Moon, BookOpen } from 'lucide-react'

const SCHEDULE = [
  { time: '08:20', label: '오전 집중 학습 시작', desc: '0교시 단어 테스트 및 가장 상쾌한 오전의 몰입', icon: Sun },
  { time: '12:30', label: '점심 식사 및 휴식', desc: '오후의 압도적 몰입을 위한 에너지 재충전', icon: Coffee },
  { time: '13:50', label: '오후 집중 밀착 관리', desc: '나태함이 파고들 틈 없는 철저한 생활 통제 시스템', icon: BookOpen },
  { time: '17:40', label: '저녁 식사 및 정비', desc: '마지막 스퍼트를 위해 몸과 마음을 정돈하는 시간', icon: Coffee },
  { time: '18:50', label: '야간 심화 몰입 학습', desc: '오늘 배운 내용을 완벽하게 정리하는 밤의 몰입', icon: BookOpen },
  { time: '22:10', label: '최종 하원 및 심야 자율 학습', desc: '순공 12시간의 성취감과 함께하는 하루의 마무리', icon: Moon },
]

export function TimelineView() {
  return (
    <section id="timeline" className="pb-24 md:pb-32 pt-0 bg-[#F5F5F7] overflow-hidden">
      <div className="max-w-[72rem] mx-auto px-6 sm:px-8 -mt-24 md:-mt-36">
        <div className="mb-12 md:mb-16 text-center fade-in-up">
            <p className="text-[#0071E3] text-[11px] sm:text-xs font-extrabold tracking-[0.3em] uppercase mb-6 opacity-80">Daily Workflow</p>
            <h2 className="text-4xl md:text-5xl lg:text-7xl font-bold text-[#1D1D1F] tracking-tighter mb-8 leading-[1.05] text-balance">
              가장 치열한 몰입,<br />
              스파르타의 하루
            </h2>
            <p className="text-[#434345] text-lg md:text-xl font-semibold max-w-2xl mx-auto leading-relaxed text-balance">
              낭비되는 시간 없이 오직 본질에만 집중합니다. <br className="hidden md:block" />
              1분 1초를 아끼는 완벽한 일과표를 확인하세요.
            </p>
        </div>

        <div className="relative mt-12 md:mt-20 max-w-3xl mx-auto">
          {/* Vertical Line */}
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[2px] bg-black/[0.05] -translate-x-1/2" />
          
          <div className="flex flex-col gap-12">
            {SCHEDULE.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className={`flex items-start md:items-center gap-8 md:gap-0 ${
                  i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Content Side */}
                <div className={`flex-1 md:w-1/2 ${i % 2 === 0 ? 'md:pr-16 md:text-right' : 'md:pl-16 md:text-left'} ml-12 md:ml-0`}>
                  <p className="text-[#0071E3] text-[11px] md:text-xs font-extrabold tracking-[0.2em] uppercase mb-2 opacity-80">{item.time}</p>
                  <h3 className="text-2xl md:text-3xl font-bold text-[#1D1D1F] tracking-tight mb-2">{item.label}</h3>
                  <p className="text-[#86868B] text-base md:text-lg font-semibold leading-relaxed break-keep max-w-md inline-block">{item.desc}</p>
                </div>

                {/* Counterpart Side (Dot/Icon) */}
                <div className="absolute left-4 md:left-1/2 -translate-x-1/2 z-10">
                  <div className="w-12 h-12 rounded-full bg-white border-4 border-[#F5F5F7] flex items-center justify-center shadow-premium-hover transition-transform duration-500 hover:scale-110">
                    <item.icon size={22} className="text-[#1D1D1F]" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Empty Side for layout */}
                <div className="hidden md:block flex-1 w-1/2" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Flexible Schedule Note - Moved outside the vertical line container to avoid overlap */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-24 text-center"
        >
          <p className="text-[#86868B] text-sm font-semibold flex items-center justify-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#0071E3]" />
            등원 및 하원 시간은 수험생의 거주지에 따라 유동적으로 운영됩니다.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
