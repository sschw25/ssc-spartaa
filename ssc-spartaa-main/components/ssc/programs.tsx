'use client'

import Link from 'next/link'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { ChevronRight } from 'lucide-react'

const cardColors: Record<string, string> = {
  gongmuwon: '#1D1D1F', // Apple Black
  suneung: '#1D1D1F',
  imyong: '#1D1D1F',
  professional: '#1D1D1F',
  job: '#1D1D1F',
  managed: '#1D1D1F',
}

const getProgramsTabs = (location: string) => [
  {
    id: 'gongmuwon',
    badge: `${location} 유일 커넥츠프랩`,
    title: '공무원 합격반',
    subtitle: '국가직/지방직 맞춤형 압도적 순공시간',
    stat: '자세히 보기',
  },
  {
    id: 'suneung',
    badge: '합리적 프리미엄 독학재수',
    title: '수능(재수)',
    subtitle: '생활 리듬이 무너지면 강의도 소용없습니다',
    stat: '자세히 보기',
  },
  {
    id: 'imyong',
    badge: '매년 합격자 배출',
    title: '임용고시 집중반',
    subtitle: '임용은 꾸준함이 당락을 가릅니다',
    stat: '자세히 보기',
  },
  {
    id: 'professional',
    badge: '단기합격 시스템',
    title: '전문자격 준비반',
    subtitle: '세무사·노무사 4개월 단기 완성',
    stat: '자세히 보기',
  },
  {
    id: 'job',
    badge: '면접/코테 완벽대비',
    title: 'NCS 및 취업준비',
    subtitle: '가장 치열하게 준비하는 취준생 베이스캠프',
    stat: '자세히 보기',
  },
  {
    id: 'managed',
    badge: '성인전용 프리미엄',
    title: '관리형독서실',
    subtitle: '어떤 공부든 완벽한 몰입을 위한 공간',
    stat: '자세히 보기',
  },
]

const campusKeyMap = { '원주': 'wonju', '춘천': 'chuncheon', '충주': 'chungju' } as const

export function Programs({ location = '원주' }: { location?: '원주' | '춘천' | '충주' }) {
  const ref = useScrollReveal()
  const campusRoute = campusKeyMap[location]

  return (
    <section id="programs" className="bg-[#F5F5F7] py-20 px-4 sm:px-6 border-t border-black/[0.04]" ref={ref}>
      <div className="max-w-[64rem] mx-auto">
        {/* Section heading */}
        <div className="mb-14 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">Select Program</p>
          <h2 className="text-[#1D1D1F] text-4xl sm:text-5xl font-semibold tracking-tighter mb-4">
            어떤 목표를<br className="sm:hidden" /> 준비 중이신가요?
          </h2>
          <p className="text-[#86868B] text-base sm:text-lg max-w-xl mx-auto font-medium">
            원하시는 시험을 선택하시면, 최적화된 관리 시스템과 시설 안내를 확인하실 수 있습니다.
          </p>
        </div>

        {/* Card stack (Gateway Links) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {getProgramsTabs(location).map((prog, index) => (
            <Link
              href={`/${campusRoute}/${prog.id}`}
              key={prog.id}
              className={`group flex flex-col justify-between p-8 rounded-[24px] transition-all duration-500 ease-out border border-black/5 shadow-[0_4px_14px_rgba(0,0,0,0.02)] hover:shadow-[0_15px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1 fade-in-up delay-${(index % 3) * 100} ${index === 0 ? 'sm:col-span-2 min-h-[300px]' : 'min-h-[260px]'}`}
              style={{ backgroundColor: cardColors[prog.id] }}
            >
              <div>
                <span className="inline-flex px-3 py-1 rounded-full bg-white/10 text-white/90 text-[11px] font-semibold tracking-widest uppercase mb-6 backdrop-blur-md">
                  {prog.badge}
                </span>

                <h3 className="text-white font-semibold text-3xl sm:text-4xl tracking-tighter mb-2">
                  {prog.title}
                </h3>
                <p className="text-white/60 text-sm sm:text-base font-medium tracking-tight">
                  {prog.subtitle}
                </p>
              </div>

              <div className="flex justify-end mt-8">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-md transition-transform duration-300 group-hover:bg-white group-hover:text-black">
                  <ChevronRight size={20} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
