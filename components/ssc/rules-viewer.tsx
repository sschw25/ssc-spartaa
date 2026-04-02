'use client'

import { motion } from 'framer-motion'
import { AlertCircle, Smartphone, Clock, Coffee, ShieldCheck } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const RULES = [
  { id: 'rule-1', icon: Smartphone, title: '등원 시 스마트폰 완전 수거', desc: '등원 즉시 사물함 또는 데스크에 전원 종료 후 제출. 적발 시 즉시 퇴소 처리' },
  { id: 'rule-2', icon: Clock, title: '지각 및 외출 벌점제', desc: '사전 승인 없는 지각이나 외출 시 벌점 부여. 누적 벌점 15점 도달 시 1주일 정학 및 상담' },
  { id: 'rule-3', icon: Coffee, title: '졸음 적발 시 강력 조치', desc: '코멘터가 순찰 중 졸음 적발 시 즉시 깨워드림. 3회 연속 적발 시 지정된 스탠딩 테이블로 이동' },
  { id: 'rule-4', icon: ShieldCheck, title: '학습 분위기 저해자 제명', desc: '이성 교제, 친목질, 잡담 등 면학 분위기를 저해하는 행위 발각 시 예외 없이 제명' },
]

export function RulesViewer() {
  return (
    <section id="rules" className="py-24 bg-white">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6 flex flex-col md:flex-row gap-16 md:gap-24 items-start">
        <div className="md:w-1/3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF3B30]/5 text-[#FF3B30] text-xs font-bold uppercase tracking-widest mb-6 border border-[#FF3B30]/10">
            <AlertCircle size={14} /> Sparta Rules
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 whitespace-pre-line break-keep leading-tight">
            우리의 엄격함이{'\n'}
            당신을 합격으로{'\n'}
            이끕니다.
          </h2>
          <p className="text-[#86868B] text-lg font-medium leading-relaxed whitespace-pre-line break-keep">
            단순한 학원이 아닙니다.{'\n'}
            최후의 1인이 될 때까지,{'\n'}
            우리는 절대 타협하지 않습니다.
          </p>
        </div>

        <div className="flex-1 w-full">
          <Accordion type="single" collapsible className="w-full space-y-4">
            {RULES.map((rule) => (
              <AccordionItem key={rule.id} value={rule.id} className="border border-black/[0.05] rounded-3xl px-6 py-2 overflow-hidden bg-[#F5F5F7]/30 hover:bg-[#F5F5F7]/80 transition-colors">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-[#1D1D1F] shadow-sm border border-black/5">
                      <rule.icon size={20} />
                    </div>
                    <span className="text-lg font-bold text-[#1D1D1F] tracking-tight">{rule.title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-[#86868B] text-base font-medium leading-relaxed pl-14 pb-6 whitespace-pre-line break-keep">
                  {rule.desc}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
