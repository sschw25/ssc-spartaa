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
  { 
    id: 'rule-1', 
    icon: Smartphone, 
    title: '스마트폰 관리 및 수거', 
    desc: '원칙: 등원 즉시 전원 종료 후 지정 사물함에 제출\n예외: 점심 및 저녁 식사 시간에 한해 일시적 사용 가능 (종료 후 즉시 재제출)\n주의: 학습 시간 중 소지 적발 시 예외 없이 즉시 퇴소 처리' 
  },
  { 
    id: 'rule-2', 
    icon: Clock, 
    title: '지각 및 결석 벌점제', 
    desc: '기준: 지각(1점), 무단결석(5점) 부여 (개인 사유 증빙 시 예외)\n3점 초과 시: 즉각적인 생활 면담 및 태도 개선 교육 실시\n10점 초과 시(1개월 기준): 면학 분위기 유지를 위해 강제 퇴출' 
  },
  { 
    id: 'rule-3', 
    icon: Coffee, 
    title: '졸음 방지 및 집중력 관리', 
    desc: '시스템: 코멘터가 상시 순찰하며 졸음 시 즉시 깨움 서비스 제공\n조치: 졸음 1회 적발 시 본인 자리 학습 중단\n이동: 다음 쉬는 시간까지 라운지 스탠딩 테이블에서 학습 전환' 
  },
  { 
    id: 'rule-4', 
    icon: ShieldCheck, 
    title: '학습 분위기 저해 행위 엄단', 
    desc: '즉시 제명: 원내외 이성 교제, 친목 소모임, 학습실 내 잡담 등\n엄단: 타인의 몰입을 방해하는 모든 행위는 사전 경고 없이 제명\n정숙: 센터 내 전 구역 절대 정숙을 원칙으로 함' 
  },
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
            철저한 관리가 합격을 만듭니다.{'\n'}
            SSC 스파르타는 여러분의 몰입을{'\n'}
            방해하는 모든 요소를 차단합니다.
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
