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
    <section className="relative py-32 md:py-48 bg-[#0A0A0B] text-white overflow-hidden">
      {/* Abstract Glowing Backgrounds */}
      <div className="absolute top-[10%] -left-20 w-[600px] h-[600px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none opacity-60" />
      <div className="absolute bottom-[10%] -right-20 w-[600px] h-[600px] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none opacity-60" />

      <div className="max-w-[72rem] mx-auto px-6 sm:px-8 relative z-10 text-center">
        <BlurFade delay={0.1}>
          <p className="text-[#0071E3] text-[11px] font-extrabold tracking-[0.4em] uppercase mb-6 drop-shadow-[0_0_15px_rgba(0,113,227,0.3)]">
            The Science of Focus
          </p>
        </BlurFade>
        
        <BlurFade delay={0.2}>
          <h2 className="text-4xl md:text-5xl lg:text-7xl font-bold text-white mb-10 leading-[1.05] tracking-tighter text-balance">
            의지는 배신하지만,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
              설계된 뇌는 배신하지 않습니다.
            </span>
          </h2>
        </BlurFade>

        <BlurFade delay={0.3}>
          <p className="text-[#86868B] text-lg md:text-2xl font-semibold max-w-3xl mx-auto mb-24 leading-relaxed break-keep text-balance">
            공부가 안 되는 것은 당신의 탓이 아닙니다.<br className="hidden md:block" />
            SSC는 당신의 뇌를 합격에 최적화된 상태로<br className="md:hidden" /> "강제 전환" 시켜 드립니다.
          </p>
        </BlurFade>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 text-left">
          {principles.map((p, i) => (
            <BlurFade key={i} delay={0.4 + i * 0.15} yOffset={30}>
              <div className={`group relative h-full rounded-[40px] bg-white/[0.02] border border-white/[0.06] p-10 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-700 ease-out backdrop-blur-3xl shadow-2xl`}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                  <p.icon size={28} className="text-white/90" />
                </div>
                <h3 className="text-white text-2xl font-bold mb-5 tracking-tight group-hover:text-blue-400 transition-colors duration-500">
                  {p.title}
                </h3>
                <p className="text-[#86868B] text-[16px] leading-[1.7] font-medium opacity-80 group-hover:opacity-100 transition-opacity duration-500">
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
