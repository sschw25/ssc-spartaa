'use client'

import { motion } from 'framer-motion'
import { Sun, Coffee, Moon, BookOpen } from 'lucide-react'

const SCHEDULE = [
  { time: '08:00', label: '등원 및 스마트폰 반납', desc: '모든 전송기기 수거 및 즉시 몰입 준비', icon: Sun },
  { time: '09:00', label: '오전 집중 자습(1~3교시)', desc: '중간 이탈 금지, 압도적 고요함 속 몰입', icon: BookOpen },
  { time: '12:00', label: '점심 식사 및 휴식', desc: '개별 자유 식사 및 인근 식당 이용 안내', icon: Coffee },
  { time: '13:00', label: '오후 집중 자습(4~7교시)', desc: '졸음 관리 코멘터의 상시 순찰', icon: BookOpen },
  { time: '18:00', label: '저녁 식사 및 멘탈 케어', desc: '잠시 휴식 후 저녁 자습 대비 멘탈 정돈', icon: Sun },
  { time: '19:00', label: '저녁 심화 자습', desc: '오늘 배운 내용 완벽 복습 및 마무리', icon: BookOpen },
  { time: '22:00', label: '최종 하원', desc: '순공 12시간의 성취감과 함께 귀가', icon: Moon },
]

export function TimelineView() {
  return (
    <section id="timeline" className="py-24 bg-[#F5F5F7]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="mb-16 text-center">
            <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 whitespace-pre-line break-keep">
              가장 치열한 몰입,{'\n'}
              스파르타의 하루
            </h2>
            <p className="text-[#86868B] text-lg font-medium max-w-2xl mx-auto leading-relaxed whitespace-pre-line break-keep">
              낭비되는 시간 없이 오직 본질에만 집중합니다.{'\n'}
              1분 1초를 아끼는 완벽한 일과표를 확인하세요.
            </p>
        </div>

        <div className="relative mt-20 max-w-3xl mx-auto">
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
                <div className={`flex-1 md:w-1/2 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12 md:text-left'} ml-12 md:ml-0`}>
                  <p className="text-[#0071E3] text-sm font-bold tracking-widest mb-1">{item.time}</p>
                  <h3 className="text-xl font-semibold text-[#1D1D1F] mb-1">{item.label}</h3>
                  <p className="text-[#86868B] text-sm font-medium">{item.desc}</p>
                </div>

                {/* Counterpart Side (Dot/Icon) */}
                <div className="absolute left-4 md:left-1/2 -translate-x-1/2 z-10">
                  <div className="w-8 h-8 rounded-full bg-white border-2 border-black/[0.05] flex items-center justify-center shadow-lg group overflow-hidden">
                    <item.icon size={16} className="text-[#1D1D1F]" />
                  </div>
                </div>

                {/* Empty Side for layout */}
                <div className="hidden md:block flex-1 w-1/2" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
