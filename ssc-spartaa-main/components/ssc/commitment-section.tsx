'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'
import BlurFade from '@/components/ui/blur-fade'
import { RhythmicText } from '@/components/ui/rhythmic-text'

const commitments = [
  {
    id: 1,
    question: "한계를 넘어서는 고통을\n견딜 준비가 되었는가?",
    desc: "SSC 스파르타의 관리는 엄격합니다.\n단순한 편리함이 아닌, 치열한 인고의 시간을\n합격으로 바꾸는 과정입니다."
  },
  {
    id: 2,
    question: "합격이라는 결과 외에\n모든 유혹을 끊을 수 있는가?",
    desc: "스마트폰 수거부터 철저한 인터넷 통제까지.\n공부 외의 모든 것에서 완전히 격리될\n각오와 용기가 필요합니다."
  },
  {
    id: 3,
    question: "시스템의 완벽한 통제에\n순응할 각오가 되었는가?",
    desc: "자기합리화를 버리고 전문가가 설계한\n교시제 시스템에 100% 몸을 맡길\n준비가 되어야 합니다."
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
    <section className="py-32 md:py-48 bg-[#F5F5F7] border-t border-black/[0.03] overflow-hidden">
      <div className="max-w-[54rem] mx-auto px-6 sm:px-8 text-center">
        
        <div className="mb-20 md:mb-28">
          <BlurFade delay={0.1}>
            <p className="text-[#86868B] text-[11px] font-extrabold tracking-[0.4em] uppercase mb-6 opacity-70">Last Check-in</p>
            <h2 
              className="text-4xl md:text-5xl lg:text-7xl font-bold tracking-tighter mb-10 leading-[1.05] text-balance"
            >
              <RhythmicText text={"입학하기 전,\n스스로에게 물으십시오."} />
            </h2>
            <div className="text-[#434345] text-lg md:text-xl font-semibold max-w-2xl mx-auto break-keep leading-relaxed text-balance">
              <RhythmicText text={"SSC 스파르타는 모두를 위한 공간이 아닙니다.\n오직 합격만이 유일한 목표인 수험생을 위해 존재합니다."} />
            </div>
          </BlurFade>
        </div>

        <div className="space-y-6 text-left">
          {commitments.map((c, i) => (
            <BlurFade key={c.id} delay={0.3 + i * 0.1} yOffset={30}>
              <div 
                onClick={() => toggle(c.id)}
                className={`group cursor-pointer rounded-[40px] border-[3px] p-10 transition-all duration-700 ease-out shadow-premium hover:shadow-premium-hover ${
                  checked.includes(c.id) 
                    ? 'bg-white border-[#0071E3] scale-[1.02]' 
                    : 'bg-white border-transparent hover:border-[#0071E3]/20'
                }`}
              >
                <div className="flex items-start gap-8">
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-700 ${
                    checked.includes(c.id) 
                      ? 'bg-[#0071E3] border-[#0071E3] text-white shadow-[0_10px_30px_rgba(0,113,227,0.3)]' 
                      : 'border-black/05 text-transparent'
                  }`}>
                    <Check size={24} strokeWidth={4} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-2xl md:text-3xl font-bold tracking-tighter mb-4 transition-colors duration-700 ${
                      checked.includes(c.id) ? 'text-[#1D1D1F]' : 'text-[#86868B]'
                    }`}>
                      <RhythmicText text={c.question} />
                    </h3>
                    <div className={`text-base md:text-lg font-semibold leading-relaxed transition-all duration-700 break-keep max-w-[42rem] ${
                      checked.includes(c.id) ? 'text-[#434345] opacity-100' : 'text-[#86868B] opacity-50'
                    }`}>
                      <RhythmicText text={c.desc} />
                    </div>
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
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white p-12 md:p-16 rounded-[48px] shadow-premium-hover border border-[#0071E3]/10"
                >
                  <p className="text-[#0071E3] font-extrabold text-2xl md:text-3xl mb-10 tracking-tight text-balance">당신은 SSC 스파르타의 일원이 될<br /> 준비가 되었습니다.</p>
                  <button 
                    onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
                    className="bg-[#1D1D1F] text-white px-12 py-6 rounded-full font-extrabold text-xl hover:scale-105 active:scale-95 transition-all duration-500 shadow-2xl shadow-black/20 flex items-center justify-center gap-4 mx-auto group"
                  >
                    전문 상담 예약하기
                    <ArrowRight size={26} className="group-hover:translate-x-3 transition-transform" />
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
