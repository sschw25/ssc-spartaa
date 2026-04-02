'use client'

import { motion } from 'framer-motion'
import { Brain, Zap, Target } from 'lucide-react'
import BlurFade from '@/components/ui/blur-fade'

const principles = [
  {
    icon: Brain,
    title: '도파민 하이재킹 원천 차단',
    desc: '스마트폰 알람 하나가 앗아가는 집중력 회복 시간은 평균 23분. SSC는 이 치명적인 낭비를 원천 봉쇄하여 오직 공부에만 도파민이 돌게 합니다.',
    color: 'from-blue-500/20 to-indigo-500/10'
  },
  {
    icon: Zap,
    title: '뇌가 풀가동되는 90분 루틴',
    desc: '의지로 버티는 지루한 자습은 더 이상 없습니다. 뇌의 집중 한계점인 90분을 한 교시로 설정하여, 합격자들의 폭발적인 몰입 리듬을 몸에 새깁니다.',
    color: 'from-purple-500/20 to-pink-500/10'
  },
  {
    icon: Target,
    title: '심해의 정적, 전두엽의 해방',
    desc: '외부 자극이 0에 수렴할 때 비로소 뇌의 CPU인 전두엽이 풀가동됩니다. SSC의 철저한 정숙 관리는 배려가 아니라, 수험생의 뇌를 보호하기 위한 과학입니다.',
    color: 'from-emerald-500/20 to-teal-500/10'
  }
]

export default function BrainScience() {
  return (
    <section className="relative py-24 md:py-32 bg-[#0A0A0B] overflow-hidden">
      {/* Abstract Glowing Backgrounds */}
      <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-[64rem] mx-auto px-4 sm:px-6 relative z-10 text-center">
        <BlurFade delay={0.1}>
          <p className="text-[#0071E3] text-xs font-bold tracking-[0.3em] uppercase mb-4">
            The Science of Focus
          </p>
        </BlurFade>
        
        <BlurFade delay={0.2}>
          <h2 className="text-white text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tighter mb-8 leading-[1.1]">
            의지는 배신하지만,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
              설계된 뇌는 배신하지 않습니다.
            </span>
          </h2>
        </BlurFade>

        <BlurFade delay={0.3}>
          <p className="text-[#86868B] text-lg md:text-xl font-medium max-w-2xl mx-auto mb-20 leading-relaxed">
            공부가 안 되는 것은 당신의 탓이 아닙니다. SSC는 당신의 뇌를 합격에 최적화된 상태로 "강제 전환" 시켜 드립니다.
          </p>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {principles.map((p, i) => (
            <BlurFade key={i} delay={0.4 + i * 0.15} yOffset={20}>
              <div className={`group relative h-full rounded-[32px] bg-white/[0.03] border border-white/[0.08] p-8 hover:bg-white/[0.06] transition-all duration-500`}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-6`}>
                  <p.icon size={24} className="text-white/90" />
                </div>
                <h3 className="text-white text-xl font-semibold mb-4 tracking-tight">
                  {p.title}
                </h3>
                <p className="text-[#86868B] text-[15px] leading-relaxed font-medium">
                  {p.desc}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  )
}
