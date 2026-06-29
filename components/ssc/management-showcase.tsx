'use client'

import { useEffect, useRef } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'
import type { ManagementSection } from '@/lib/stream-content'
import { resolveStreamIcon } from '@/components/ssc/stream-icons'

const EASE = [0.16, 1, 0.3, 1] as const

/** metric 문자열에서 선행 숫자를 추출해 카운트업, 나머지(단위)는 그대로 표시 */
function Metric({ metric }: { metric: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const match = metric.match(/^(\d+(?:\.\d+)?)(.*)$/)
  const target = match ? parseFloat(match[1]) : 0
  const suffix = match ? match[2] : metric

  const spring = useSpring(0, { stiffness: 90, damping: 26, restDelta: 0.01 })
  const text = useTransform(spring, (v) => {
    const rounded = Number.isInteger(target) ? Math.round(v) : v.toFixed(1)
    return `${rounded}${suffix}`
  })

  useEffect(() => {
    if (inView && match) spring.set(target)
  }, [inView, match, spring, target])

  if (!match) {
    return (
      <span ref={ref} className="text-[#0A84FF] text-3xl md:text-4xl font-black tracking-tighter">
        {metric}
      </span>
    )
  }
  return (
    <motion.span
      ref={ref}
      className="text-[#0A84FF] text-3xl md:text-4xl font-semibold tracking-tight tabular-nums"
    >
      {text}
    </motion.span>
  )
}

/** 주간 순공시간 추이 — 애니메이션 SVG 영역 차트 */
function StudyTimeChart() {
  const data = [6.2, 7.4, 8.0, 8.9, 9.6, 10.4, 11.3, 12.1]
  const W = 320
  const H = 110
  const PAD = 8
  const max = 13
  const min = 5
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (data.length - 1)
  const y = (v: number) => PAD + (H - PAD * 2) * (1 - (v - min) / (max - min))
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`
  const lastX = x(data.length - 1)
  const lastY = y(data[data.length - 1])
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/70 text-[13px] font-semibold tracking-tight">주간 순공시간 추이</span>
        <span className="text-[#0A84FF] text-[13px] font-semibold tabular-nums">최근 12.1h/일</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px] overflow-visible">
        <defs>
          <linearGradient id="studyfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A84FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0A84FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2].map((g) => (
          <line key={g} x1={PAD} x2={W - PAD} y1={PAD + g * ((H - PAD * 2) / 2)} y2={PAD + g * ((H - PAD * 2) / 2)} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}
        <motion.path
          d={area}
          fill="url(#studyfill)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="#0A84FF"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1.3, ease: EASE }}
        />
        <motion.circle
          cx={lastX}
          cy={lastY}
          r={4.5}
          fill="#0A84FF"
          initial={{ scale: 0, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: EASE, delay: 1.2 }}
          style={{ transformOrigin: `${lastX}px ${lastY}px` }}
        />
        {/* 정적 헤일로 — AGENTS.md §6: 장식성 무한 애니메이션 자제 */}
        <circle cx={lastX} cy={lastY} r={8} fill="#0A84FF" fillOpacity={0.16} />
      </svg>
    </div>
  )
}

function LiveBar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/70 text-[13px] font-semibold tracking-tight">{label}</span>
        <span className="text-white text-[13px] font-semibold tabular-nums">{value}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 1.1, ease: EASE, delay }}
        />
      </div>
    </div>
  )
}

export function ManagementShowcase({ data }: { data: ManagementSection }) {
  return (
    <section id="management" className="relative bg-[#1D1D1F] py-24 md:py-32 overflow-hidden">
      {/* Ambient accents (brand-safe blue glow) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-[#007AFF]/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-[64rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-14 text-center"
        >
          <p className="text-[#0A84FF] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
            Learning Management
          </p>
          <h2 className="section-title text-white mb-4 leading-tight whitespace-pre-line">{data.title}</h2>
          <p
            className="text-white/60 font-medium max-w-xl mx-auto leading-relaxed whitespace-pre-line"
            style={{ fontSize: 'var(--font-size-body-lg)' }}
          >
            {data.subtitle}
          </p>
        </motion.div>

        {/* Live dashboard mock */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-12 rounded-[24px] border border-white/10 bg-white/[0.04] p-7 md:p-9 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-7">
            <p className="text-white text-sm font-semibold tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#34C759]" />
              실시간 학습관리 현황
            </p>
            <span className="text-white/40 text-[11px] font-semibold tracking-tight">오늘 기준</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <LiveBar label="출석률" value={98} color="#34C759" delay={0.05} />
            <LiveBar label="순공시간 목표 달성" value={92} color="#007AFF" delay={0.15} />
            <LiveBar label="주간 진도율" value={87} color="#FF9500" delay={0.25} />
          </div>
          <div className="pt-6 border-t border-white/10">
            <StudyTimeChart />
          </div>
        </motion.div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.features.map((f, i) => {
            const Icon = resolveStreamIcon(f.icon)
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.07 }}
                className="group rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-[14px] bg-white/[0.06] border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <Icon size={22} className="text-[#0A84FF]" strokeWidth={1.75} />
                  </div>
                  {f.metric && <Metric metric={f.metric} />}
                </div>
                <h3 className="text-white text-lg font-semibold tracking-tight mb-2 leading-snug whitespace-pre-line">
                  {f.title}
                </h3>
                <p className="text-white/55 text-[14px] font-medium leading-relaxed whitespace-pre-line">
                  {f.desc}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
