'use client'

import React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle } from 'lucide-react'
import BlurFade from '@/components/ui/blur-fade'
import TiltCard from '@/components/ui/tilt-card'

const compareData = [
  {
    title: '나 홀로 공부 (Alone)',
    icon: XCircle,
    color: 'from-gray-200 to-gray-300',
    iconColor: 'text-gray-400',
    status: 'bad',
    features: [
      '스스로 통제하기 어려운 습관적 스마트폰 사용',
      '집중력이 흐트러지는 순간 늘어나는 휴식 시간',
      '불규칙한 등원 및 자기합리화에 기반한 학습',
      '슬럼프가 왔을 때 혼자 삭히는 심리적 압박'
    ]
  },
  {
    title: 'SSC 스파르타 (Sparta)',
    icon: CheckCircle2,
    color: 'from-[#0071E3] to-[#00c6ff]',
    iconColor: 'text-white',
    status: 'good',
    features: [
      '모든 스마트폰 강제 수거 및 인터넷 완벽 통제',
      '하루 12시간, 흔들리지 않는 극강의 몰입 시스템',
      '실시간 태블릿 모니터링 및 즉각적 졸음 관리',
      '전문 코멘터의 밀착 상담으로 멘탈 집중 케어'
    ]
  }
]

export default function ComparisonSection() {
  return (
    <section className="py-24 md:py-32 bg-white">
      <div className="max-w-[72rem] mx-auto px-4 sm:px-6">
        
        <div className="mb-20 text-center">
          <BlurFade delay={0.1}>
            <p className="text-[#0071E3] text-xs font-bold tracking-[0.3em] uppercase mb-4">The Real Difference</p>
            <h2 className="text-[#1D1D1F] text-3xl md:text-5xl font-semibold tracking-tighter mb-6">
              의지가 아닌,<br className="sm:hidden" /> 환경의 차이가 합격을 정합니다.
            </h2>
            <p className="text-[#86868B] text-base md:text-lg font-medium max-w-2xl mx-auto">
              혼자 하는 다짐은 쉽게 무너집니다. 압도적 집중 환경과 전문가의 코칭이 결합될 때 비로소 당신의 진짜 잠재력이 폭발합니다.
            </p>
          </BlurFade>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14">
          {compareData.map((choice, idx) => (
            <BlurFade key={idx} delay={0.3 + idx * 0.1} yOffset={30}>
              <TiltCard>
                <div className="group rounded-[32px] overflow-hidden bg-[#F5F5F7] border border-black/[0.04] p-2 flex flex-col h-full shadow-sm hover:shadow-xl transition-all duration-500">
                  <div className={`relative h-48 sm:h-56 w-full overflow-hidden rounded-[26px] bg-gradient-to-br ${choice.color} flex items-center justify-center`}>
                    <choice.icon size={80} className={`${choice.iconColor} opacity-20 group-hover:scale-110 transition-transform duration-700`} strokeWidth={1} />
                    <div className="absolute top-6 left-6 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full text-xs font-bold shadow-sm">
                      {choice.title}
                    </div>
                  </div>
                  
                  <div className="p-8 pb-10 flex flex-col flex-1">
                    <ul className="space-y-4">
                      {choice.features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-3">
                          {choice.status === 'good' ? (
                            <CheckCircle2 size={18} className="mt-1 text-[#0071E3] flex-shrink-0" />
                          ) : (
                            <XCircle size={18} className="mt-1 text-[#86868B]/40 flex-shrink-0" />
                          )}
                          <span className={`${choice.status === 'good' ? 'text-[#1D1D1F]' : 'text-[#86868B]'} text-[15px] font-medium leading-relaxed`}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </TiltCard>
            </BlurFade>
          ))}
        </div>

        {/* Meet the Commenters - Special Highlight */}
        <div className="mt-20 lg:mt-32 rounded-[40px] bg-[#0A0A0B] p-8 md:p-14 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-full bg-gradient-to-l from-indigo-600/10 to-transparent pointer-events-none" />
          
          <div className="grid md:grid-cols-5 gap-10 items-center relative z-10">
            <div className="md:col-span-3 text-left">
              <BlurFade delay={0.5}>
                <div className="inline-flex px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-[10px] font-bold tracking-widest uppercase mb-6">
                  Expert Group
                </div>
                <h3 className="text-white text-3xl md:text-5xl font-semibold tracking-tighter mb-6 leading-[1.1]">
                  전문 지식을 갖춘<br />
                  <span className="text-indigo-400">자기주도학습지도사</span>들이<br />
                  당신의 곁을 지킵니다.
                </h3>
                <p className="text-[#86868B] text-lg font-medium max-w-xl leading-relaxed">
                  SSC 스파르타의 코멘터는 단순한 감시자가 아닙니다. <span className="text-white">'자기주도학습지도사'</span> 자격증을 취득한 전문가 집단으로서, 수험생의 학습 상황을 분석하고 최적의 몰입 상태로 유도하는 프로페셔널 파트너입니다.
                </p>
              </BlurFade>
            </div>
            
            <div className="md:col-span-2">
              <BlurFade delay={0.6}>
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-square rounded-[24px] bg-white/[0.03] border border-white/[0.08] flex items-center justify-center group hover:bg-white/[0.08] transition-all">
                       <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
                          <CheckCircle2 size={24} className="text-indigo-400 opacity-40 group-hover:opacity-100 transition-all" />
                       </div>
                    </div>
                  ))}
                </div>
              </BlurFade>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
