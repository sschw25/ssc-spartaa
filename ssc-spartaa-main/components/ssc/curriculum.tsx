'use client'

import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Sun, Coffee, Moon } from 'lucide-react'

const schedule = [
  {
    icon: Sun,
    label: '오전 루틴',
    time: '08:20 – 12:30',
    items: ['0교시: 단어 테스트 및 출결 체크', '1교시: 실전 모의고사 및 집중 학습', '2교시: 정적 속의 압도적 몰입'],
    bgColor: 'bg-gradient-to-br from-[#FFF8E7] to-[#FFF1D0]',
    iconColor: 'text-[#F5A623]',
  },
  {
    icon: Coffee,
    label: '오후 루틴',
    time: '13:50 – 17:40',
    items: ['3·4교시: 한계를 넘어서는 순공 확보', '5교시: 합격을 앞당기는 열정 기록', '개인별 밀착 학습 관리'],
    bgColor: 'bg-gradient-to-br from-[#EBF5FF] to-[#D6E8FB]',
    iconColor: 'text-[#0071E3]',
  },
  {
    icon: Moon,
    label: '저녁 루틴',
    time: '18:50 – 23:20',
    items: ['6교시: 지치지 않는 스파르타식 관리', '7교시: 완벽한 마무리 및 일일 점검', '심야 자율 학습: 앞서가는 새벽'],
    bgColor: 'bg-gradient-to-br from-[#2D2D2F] to-[#1D1D1F]',
    iconColor: 'text-white',
    textColor: 'text-[#F5F5F7]',
    subTextColor: 'text-[#86868B]'
  },
]

export function Curriculum() {
  const ref = useScrollReveal()

  return (
    <section id="curriculum" className="bg-[#F5F5F7] py-32 md:py-48 border-t border-black/[0.02]" ref={ref}>
      <div className="max-w-[72rem] mx-auto px-6 sm:px-8">
        
        <div className="mb-20 md:mb-28 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-extrabold tracking-[0.3em] uppercase mb-6">Timetable</p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-8 leading-[1.1] text-balance">낭비 없는 압도적 몰입 시간</h2>
          <p className="text-[#434345] text-lg md:text-xl font-semibold max-w-2xl mx-auto break-keep leading-relaxed text-balance">
            매 순간 가장 몰입할 수 있도록 설계된 스파르타식 교시제. <br className="hidden md:block" /> 
            낭비되는 시간 없이 오직 본질에 집중합니다.
          </p>
        </div>

        {/* Daily schedule visualization */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {schedule.map((s, i) => (
            <div
              key={s.label}
              className={`fade-in-up delay-${(i + 1) * 150} ${s.bgColor} rounded-[40px] p-10 md:p-12 flex flex-col justify-between shadow-premium hover:shadow-premium-hover hover:-translate-y-2 transition-all duration-700 ease-out border border-black/[0.02]`}
            >
              <div>
                <div className="flex items-center gap-3 mb-8">
                  <div className={`w-14 h-14 rounded-2xl bg-white/50 backdrop-blur-md flex items-center justify-center shadow-sm`}>
                    <s.icon size={28} className={s.iconColor} strokeWidth={2.5} />
                  </div>
                </div>
                
                <h3 className={`text-2xl md:text-3xl font-bold tracking-tighter mb-4 ${s.textColor || 'text-[#1D1D1F]'}`}>
                  {s.label}
                </h3>
                <p className={`font-mono text-[15px] font-medium tracking-wide mb-8 ${s.subTextColor || 'text-[#434345]'}`}>
                  {s.time}
                </p>
              </div>

              <div className="pt-8 border-t border-black/10">
                <ul className="flex flex-col gap-4">
                  {s.items.map((item) => (
                    <li key={item} className={`flex items-center gap-3.5 text-[16px] font-bold tracking-tight ${s.textColor || 'text-[#1D1D1F]'}`}>
                      <span className={`w-2 h-2 rounded-full ${s.iconColor.replace('text-', 'bg-')} bg-current shadow-[0_0_10px_currentColor]`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Flexible Schedule Note */}
        <div className="mt-20 text-center fade-in-up">
          <p className="text-[#86868B] text-sm font-semibold flex items-center justify-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#0071E3]" />
            등원 및 하원 시간은 수험생의 거주지에 따라 유동적으로 운영됩니다.
          </p>
        </div>

      </div>
    </section>
  )
}
