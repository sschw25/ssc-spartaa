'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'
import BlurFade from '@/components/ui/blur-fade'

const commitments = [
  {
    id: 1,
    question: '본인의 한계를 넘어서는 고통을 견딜 준비가 되었는가?',
    desc: 'SSC 스파르타의 관리는 엄격합니다. 단순한 편리함이 아닌, 치열한 인고의 시간을 합격으로 바꾸는 과정입니다.'
  },
  {
    id: 2,
    question: '합격이라는 결과 외에 모든 유혹을 끊을 수 있는가?',
    desc: '스마트폰 수거부터 철저한 정숙까지. 공부 외의 모든 것에서 완전히 격리될 용기가 필요합니다.'
  },
  {
    id: 3,
    question: '시스템의 완벽한 통제에 순응할 각오가 되었는가?',
    desc: '자기합리화를 버리고 전문가가 설계한 교시제 시스템에 100% 몸을 맡길 준비가 되어야 합니다.'
  }
]

export default function CommitmentSection() {
  const [checked, setChecked] = useState<number[]>([])

  const toggle = (id: number) => {
    if (checked.includes(id)) {
      setChecked(checked.filter(c => c !== id))
    } else {
      setChecked([...checked, id])
    }
  }

  const isAllChecked = checked.length === commitments.length

  return (
    <section className="py-24 md:py-32 bg-[#F5F5F7] border-t border-black/5">
      <div className="max-w-[50rem] mx-auto px-4 sm:px-6 text-center">
        
        <div className="mb-16">
          <BlurFade delay={0.1}>
            <p className="text-[#86868B] text-xs font-bold tracking-[0.3em] uppercase mb-4">Last Check-in</p>
            <h2 className="text-[#1D1D1F] text-3xl md:text-5xl font-semibold tracking-tighter mb-6 leading-tight">
              입학하기 전,<br className="sm:hidden" /> 스스로에게 물으십시오.
            </h2>
            <p className="text-[#86868B] text-base md:text-lg font-medium max-w-xl mx-auto">
              SSC 스파르타는 모두를 위한 공간이 아닙니다. <br className="hidden md:block" />
              오직 <span className="text-[#1D1D1F] font-bold">합격</span>만이 유일한 목표인 수험생을 위해 존재합니다.
            </p>
          </BlurFade>
        </div>

        <div className="space-y-6 text-left">
          {commitments.map((c, i) => (
            <BlurFade key={c.id} delay={0.3 + i * 0.1} yOffset={20}>
              <div 
                onClick={() => toggle(c.id)}
                className={`group cursor-pointer rounded-[28px] border-2 p-8 transition-all duration-500 ease-out ${
                  checked.includes(c.id) 
                    ? 'bg-white border-black shadow-[0_15px_40px_-5px_rgba(0,0,0,0.1)]' 
                    : 'bg-white border-transparent border-black/5 hover:border-black/20'
                }`}
              >
                <div className="flex items-start gap-6">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                    checked.includes(c.id) ? 'bg-black border-black text-white' : 'border-black/10 text-transparent'
                  }`}>
                    <Check size={20} strokeWidth={3} />
                  </div>
                  <div>
                    <h3 className={`text-xl font-bold tracking-tight mb-2 transition-colors duration-500 ${
                      checked.includes(c.id) ? 'text-[#1D1D1F]' : 'text-[#86868B]'
                    }`}>
                      {c.question}
                    </h3>
                    <p className={`text-[15px] font-medium leading-relaxed transition-opacity duration-500 ${
                      checked.includes(c.id) ? 'text-[#434345] opacity-100' : 'text-[#86868B] opacity-60'
                    }`}>
                      {c.desc}
                    </p>
                  </div>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>

        <div className="mt-20">
          <BlurFade delay={0.7} yOffset={10}>
            <AnimatePresence mode="wait">
              {isAllChecked ? (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <p className="text-[#0071E3] font-bold text-lg mb-6">당신은 SSC 스파르타의 일원이 될 준비가 되었습니다.</p>
                  <button className="px-12 py-5 bg-black text-white rounded-full font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/20 flex items-center gap-3 mx-auto group">
                    전문 상담 예약하기
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="not-ready"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p className="text-[#86868B] font-medium">모든 항목을 신중히 검토해 주십시오.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </BlurFade>
        </div>

      </div>
    </section>
  )
}
