'use client'

import { useState } from 'react'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Plus, Minus } from 'lucide-react'

const defaultFaqs = [
  {
    q: '공무원 커리큘럼이 노량진과 정말 똑같나요?',
    a: '네. SSC스파르타는 원주 유일 커넥츠프랩(공단기) 파트너 학원으로, 노량진 본원과 동일한 강의 콘텐츠와 학습 시스템을 강원도에서 그대로 제공합니다. 다른 점은 서울에 가지 않아도 된다는 것, 그리고 코멘터의 밀착 관리가 더해진다는 점입니다.',
  },
  {
    q: '공무원만 공부할 수 있나요?',
    a: '아닙니다. SSC스파르타는 성인관리학습관으로, 공무원, 공기업, 임용, 독학재수 등 다양한 수험생분들이 함께 공부하고 있습니다.',
  },
  {
    q: '취업준비 어떤 분들이 오나요?',
    a: '강원도 소재 공공기관, 준정부기관, 지역 기업 취업을 목표로 하는 분들이 주로 수강합니다. 기본점수(토익,한능검 등) NCS, 최종 면접까지 통합적으로 준비하고 싶은 분에게 적합합니다.',
  },
  {
    q: '온라인 강의를 갖고 있어야 하나요?',
    a: '네. 각자 갖고 있는 인터넷 강의를 가져오시면 학원에서 시간표를 짜고 관리해드리고 있습니다. 만약 처음 시작하시는 경우 강의선정부터 함께 합니다.',
  },
  {
    q: '면접반은 어떻게 진행되나요?',
    a: '면접반은 필기 합격 발표 이후 즉시 집중 면접 준비에 돌입할 수 있도록 하고 있습니다. 필요 시 수시개강하고 있습니다.',
  },
]

interface FaqProps {
  customFaqs?: Array<{ q: string; a: string }>
}

export function Faq({ customFaqs }: FaqProps) {
  const [open, setOpen] = useState<number | null>(0)
  const ref = useScrollReveal()

  const faqs = customFaqs ?? defaultFaqs

  return (
    <section className="bg-[#F5F5F7] py-24 md:py-32" ref={ref}>
      <div className="max-w-[48rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-14 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">FAQ</p>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter">
            자주 묻는 질문
          </h2>
        </div>

        {/* Accordion */}
        <ul className="flex flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = open === i
            return (
              <li key={i} className={`fade-in-up delay-${(i % 5) * 100}`}>
              <div
                className={`rounded-[16px] transition-all duration-300 ease-out border ${
                  isOpen
                    ? 'border-black/10 bg-white shadow-sm'
                    : 'border-black/5 bg-transparent hover:bg-black/[0.02]'
                }`}
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-6 py-6 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className={`text-[15px] sm:text-base font-semibold tracking-tight leading-snug transition-colors ${isOpen ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                    {faq.q}
                  </span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${isOpen ? 'bg-[#0071E3]/10 text-[#0071E3]' : 'bg-black/5 text-[#86868B]'}`}>
                    {isOpen ? (
                      <Minus size={16} strokeWidth={2.5} />
                    ) : (
                      <Plus size={16} strokeWidth={2.5} />
                    )}
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-6 pb-6 pt-2 border-t border-black/5 mx-4">
                    <p className="text-[14px] sm:text-[15px] font-medium text-[#434345] leading-relaxed pt-4">{faq.a}</p>
                  </div>
                </div>
              </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
