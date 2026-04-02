'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Sun, Coffee, Moon } from 'lucide-react'

const schedule = [
  {
    icon: Sun,
    label: '오전 루틴',
    time: '08:20 – 12:30',
    items: ['집중 자습1', '오전출결체크', '오전 강의'],
    bgColor: 'bg-gradient-to-br from-[#FFF8E7] to-[#FFF1D0]',
    iconColor: 'text-[#F5A623]',
  },
  {
    icon: Coffee,
    label: '오후 루틴',
    time: '13:50 – 17:40',
    items: ['집중 자습2', '오후 강의', '매드클래스(선택)'],
    bgColor: 'bg-gradient-to-br from-[#EBF5FF] to-[#D6E8FB]',
    iconColor: 'text-[#0071E3]',
  },
  {
    icon: Moon,
    label: '저녁 루틴',
    time: '18:50 – 22:00',
    items: ['집중 자습3', '일일 점검', '오답 노트 작성'],
    bgColor: 'bg-gradient-to-br from-[#2D2D2F] to-[#1D1D1F]',
    iconColor: 'text-white',
    textColor: 'text-[#F5F5F7]',
    subTextColor: 'text-[#86868B]'
  },
]

export function Curriculum() {
  const ref = useScrollReveal()

  return (
    <section id="curriculum" className="bg-[#F5F5F7] py-24 md:py-32 border-t border-black/[0.04]" ref={ref}>
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        
        <div className="mb-16 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">Timetable</p>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4">
            하루가 비상식이 되는 시간
          </h2>
          <p className="text-[#86868B] text-base md:text-lg font-medium max-w-lg mx-auto">
            매 순간 가장 몰입할 수 있도록 설계된 스파르타식 교시제. 낭비되는 시간 없이 오직 본질에 집중합니다.
          </p>
        </div>

        {/* Daily schedule visualization */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {schedule.map((s, i) => (
            <div
              key={s.label}
              className={`fade-in-up delay-${(i + 1) * 100} ${s.bgColor} rounded-[28px] p-8 md:p-10 flex flex-col justify-between shadow-sm hover:scale-[1.02] hover:shadow-lg transition-all duration-500 ease-out`}
            >
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-12 h-12 rounded-full bg-white/40 backdrop-blur-md flex items-center justify-center shadow-sm`}>
                    <s.icon size={22} className={s.iconColor} strokeWidth={2} />
                  </div>
                </div>
                
                <h3 className={`text-2xl font-semibold tracking-tight mb-2 ${s.textColor || 'text-[#1D1D1F]'}`}>
                  {s.label}
                </h3>
                <p className={`font-mono text-[15px] font-medium tracking-wide mb-8 ${s.subTextColor || 'text-[#434345]'}`}>
                  {s.time}
                </p>
              </div>

              <div className="pt-6 border-t border-black/10">
                <ul className="flex flex-col gap-3">
                  {s.items.map((item) => (
                    <li key={item} className={`flex items-center gap-2.5 text-[15px] font-medium ${s.textColor || 'text-[#1D1D1F]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.iconColor.replace('text-', 'bg-')} bg-current`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
