'use client'

import React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, BarChart3, PenTool, Timer, Award } from 'lucide-react'
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
    <section className="py-32 md:py-48 bg-white overflow-hidden">
      <div className="max-w-[72rem] mx-auto px-6 sm:px-8">
        
        <div className="mb-24 md:mb-32 text-center">
          <BlurFade delay={0.1}>
            <p className="text-[#0071E3] text-[11px] font-extrabold tracking-[0.3em] uppercase mb-6">The Real Difference</p>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter mb-8 leading-[1.1] text-balance">
              의지가 아닌,<br />
              환경의 차이가 합격을 정합니다.
            </h2>
            <p className="text-[#434345] text-lg md:text-xl font-semibold max-w-3xl mx-auto break-keep leading-relaxed text-balance">
              혼자 하는 다짐은 쉽게 무너집니다. <br className="hidden md:block" /> 
              압도적 집중 환경과 전문가의 코칭이 결합될 때 비로소 당신의 진짜 잠재력이 폭발합니다.
            </p>
          </BlurFade>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14">
          {compareData.map((choice, idx) => (
            <BlurFade key={idx} delay={0.3 + idx * 0.1} yOffset={30} className="h-full">
              <TiltCard>
                <div className="group rounded-[40px] overflow-hidden bg-[#F5F5F7] border border-black/[0.03] p-2.5 flex flex-col h-full shadow-premium hover:shadow-premium-hover transition-all duration-700 ease-out">
                  <div className={`relative h-56 sm:h-64 w-full overflow-hidden rounded-[32px] bg-gradient-to-br ${choice.color} flex items-center justify-center`}>
                    <choice.icon size={100} className={`${choice.iconColor} opacity-15 group-hover:scale-115 group-hover:rotate-6 transition-transform duration-[1s] ease-out`} strokeWidth={1} />
                    <div className="absolute top-8 left-8 px-5 py-2.5 bg-white/95 backdrop-blur-md rounded-full text-[11px] font-extrabold shadow-sm border border-white/20 tracking-wider uppercase">
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
        <div className="mt-24 lg:mt-40 rounded-[48px] bg-[#0A0A0B] text-white p-10 md:p-20 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-[600px] h-full bg-gradient-to-l from-indigo-600/15 to-transparent pointer-events-none opacity-50" />
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="grid md:grid-cols-5 gap-16 lg:gap-24 items-center relative z-10">
            <div className="md:col-span-3 text-left">
              <BlurFade delay={0.5}>
                <div className="inline-flex px-4 py-1.5 bg-indigo-500/15 border border-indigo-500/25 rounded-full text-indigo-400 text-[10px] font-extrabold tracking-[0.25em] uppercase mb-8 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                  Expert Group
                </div>
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-8 leading-[1.1] tracking-tighter break-keep">
                  <span className="inline-block">전문 지식을 갖춘</span><br />
                  <span className="text-indigo-400 drop-shadow-[0_0_25px_rgba(129,140,248,0.4)] inline-block">자기주도학습지도사들이</span><br />
                  <span className="inline-block">당신의 곁을 끝까지 지킵니다.</span>
                </h3>
                <p className="text-[#86868B] text-lg md:text-xl font-semibold max-w-2xl leading-relaxed break-keep mb-12 text-balance">
                  SSC 스파르타의 코멘터는 단순한 감시자가 아닙니다. <br className="hidden md:block" />
                  <span className="text-white font-bold tracking-tight border-b-2 border-indigo-500/50 pb-0.5">'자기주도학습지도사'</span> 자격증을 취득한 전문가 집단으로서, 수험생의 학습 상황을 분석하고 최적의 몰입 상태로 유도합니다.
                </p>
                <button 
                  onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
                  className="group inline-flex items-center gap-3 px-10 py-5 rounded-full bg-white text-black font-extrabold text-base hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/10 hover:shadow-indigo-500/20"
                >
                  전문가와 상담하기
                  <CheckCircle2 size={20} className="group-hover:rotate-12 transition-transform" />
                </button>
              </BlurFade>
            </div>
            
            <div className="md:col-span-2">
              <BlurFade delay={0.6}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: BarChart3, label: '정밀 분석', color: 'from-blue-500/20 to-indigo-500/10', iconColor: 'text-blue-400' },
                    { icon: PenTool, label: '밀착 코칭', color: 'from-indigo-500/20 to-purple-500/10', iconColor: 'text-indigo-400' },
                    { icon: Timer, label: '몰입 관리', color: 'from-purple-500/20 to-pink-500/10', iconColor: 'text-purple-400' },
                    { icon: Award, label: '전문 지도', color: 'from-pink-500/20 to-rose-500/10', iconColor: 'text-pink-400' },
                  ].map((asset, i) => (
                    <div key={i} className="aspect-square rounded-[24px] bg-white/[0.03] border border-white/[0.08] relative overflow-hidden group hover:bg-white/[0.07] transition-all duration-500">
                       <div className={`absolute inset-0 bg-gradient-to-br ${asset.color} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
                       <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                          <div className={`mb-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 ${asset.iconColor}`}>
                             <asset.icon size={32} strokeWidth={1.5} />
                          </div>
                          <span className="text-[11px] font-bold text-white/40 tracking-widest uppercase group-hover:text-white transition-colors">
                             {asset.label}
                          </span>
                       </div>
                       {/* Subtle internal glow */}
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 bg-indigo-500/10 blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
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
