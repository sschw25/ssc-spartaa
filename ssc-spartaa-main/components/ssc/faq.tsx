'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { Plus, Minus } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'

const categories = [
  { id: 'all', label: '전체' },
  { id: 'admission', label: '입학/시설' },
  { id: 'study', label: '학습/관리' },
  { id: 'cost', label: '비용/혜택' },
]

const categorizedFaqs = [
  {
    category: 'admission',
    q: '의무학습 시간과 개방 시간이 어떻게 되나요?',
    a: '월~금 및 토요일 오전은 의무학습 시간으로 운영됩니다.\n• 의무학습: 08:20 ~ 22:00 (토요일은 오전까지)\n• 추가개방: 22:00 ~ 23:00 (자율 학습)\n• 주말/휴일: 토요일 오후부터 일요일은 보강 및 자율 학습으로 진행됩니다.',
  },
  {
    category: 'admission',
    q: '공휴일이나 명절에도 운영하나요?',
    a: 'SSC스파르타는 수험생의 학습 흐름을 위해 연중무휴 원칙을 지향합니다. 다만, 설 당일과 추석 당일 딱 2일만 휴무이며 그 외 모든 날은 개방합니다.',
  },
  {
    category: 'study',
    q: '학습 공간의 소음 규정은 어떻게 되나요?',
    a: '집중 학습 공간 내부인 \'열람실\'은 철저한 무소음존으로 운영됩니다. 타이핑이나 계산기 사용, 자유로운 분위기에서의 학습이 필요한 경우에는 소음이 허용되는 \'라운지\'를 이용해 주시기 바랍니다.',
  },
  {
    category: 'study',
    q: '스터디나 면접 준비를 위한 개별 공간이 있나요?',
    a: '네, 방음 처리가 된 독립된 스터디룸이 마련되어 있습니다. 사전 예약제로 운영되며, 그룹 스터디나 AI 면접, 수업 실연 등 집중도가 필요한 상황에 자유롭게 활용 가능합니다.',
  },
]

interface FaqProps {
  customFaqs?: Array<{ q: string; a: string; category?: string }>
}

export function Faq({ customFaqs }: FaqProps) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [open, setOpen] = useState<number | null>(0)
  const ref = useScrollReveal()

  const allFaqs = customFaqs || categorizedFaqs
  const filteredFaqs = activeCategory === 'all' 
    ? allFaqs 
    : allFaqs.filter(f => f.category === activeCategory)

  // Reset open item when category changes
  useEffect(() => {
    setOpen(null)
  }, [activeCategory])

  return (
    <section className="bg-[#F5F5F7] py-24 md:py-32" ref={ref}>
      <div className="max-w-[48rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-14 text-center fade-in-up">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">FAQ</p>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-8">
            자주 묻는 질문
          </h2>

          {/* Category Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-6 py-2.5 rounded-full text-[13px] font-bold transition-all ${
                  activeCategory === cat.id
                    ? 'bg-[#1D1D1F] text-white shadow-lg scale-105'
                    : 'bg-white text-[#86868B] border border-black/5 hover:bg-black/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Accordion */}
        <ul className="flex flex-col gap-3 min-h-[400px]">
          <AnimatePresence mode="popLayout">
            {filteredFaqs.map((faq, i) => {
              const isOpen = open === i
              return (
                <motion.li 
                  key={faq.q}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="w-full"
                >
                  <div
                    className={`rounded-[20px] transition-all duration-300 ease-out border ${
                      isOpen
                        ? 'border-black/10 bg-white shadow-xl translate-y-[-2px]'
                        : 'border-black/5 bg-white/50 backdrop-blur-sm hover:bg-white'
                    }`}
                  >
                    <button
                      className="w-full flex items-center justify-between gap-4 px-8 py-7 text-left"
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                    >
                      <div className={`text-[15px] sm:text-base font-bold tracking-tight leading-snug transition-colors ${isOpen ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                        <RhythmicText text={faq.q} />
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${isOpen ? 'bg-[#0071E3] text-white rotate-180' : 'bg-black/5 text-[#86868B]'}`}>
                        {isOpen ? (
                          <Minus size={16} strokeWidth={3} />
                        ) : (
                          <Plus size={16} strokeWidth={3} />
                        )}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-8 pb-8 pt-2 border-t border-black/5 mx-4">
                            <div className="text-[14px] sm:text-[15px] font-medium text-[#434345] leading-relaxed pt-4 max-w-[42rem]">
                              <RhythmicText text={faq.a} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>
    </section>
  )
}
