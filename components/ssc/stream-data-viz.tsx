'use client'

import { useEffect, useRef } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import type {
  StreamVizData,
  VizColor,
  VizBlock,
  VizGaugeBlock,
  VizDonutBlock,
  VizCompareBlock,
} from '@/lib/stream-content'

/**
 * 경찰·소방 직렬 전용 데이터 시각화 섹션.
 * 모든 수치는 2026 리서치+검증 워크플로우에서 교차검증된 사실.
 *  - 경찰: 순환식 체력 통과율 게이지(63.9% / 남88.6·여42.5) + 최종 반영비율 도넛(필기50·체력25·면접가산25)
 *  - 소방: 반영비율 Before/After 도넛(75:15:10 → 50:25:25)
 * 색 규칙: blue=정보, green=긍정, amber=주의, red=위험, 보라 금지.
 */

const EASE = [0.16, 1, 0.3, 1] as const
const C_BLUE = '#007AFF'
const C_GREEN = '#34C759'
const C_AMBER = '#FF9500'
const C_RED = '#FF3B30'
const C_INK = '#1D1D1F'
const C_MUTE = '#86868B'
const TRACK = '#ECECEF'

/* ── animated number ── */
function useCountUp(target: number, decimals = 0) {
  const ref = useRef<SVGTextElement | HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const spring = useSpring(0, { stiffness: 80, damping: 26, restDelta: 0.001 })
  const text = useTransform(spring, (v) => v.toFixed(decimals))
  useEffect(() => {
    if (inView) spring.set(target)
  }, [inView, spring, target])
  return { ref, text }
}

/* ── 270° radial gauge ── */
function Gauge({ value, label, sub, color }: { value: number; label: string; sub: string; color: string }) {
  const r = 78
  const cx = 100
  const cy = 100
  const C = 2 * Math.PI * r
  const SWEEP = 0.75 // 270°
  const { ref, text } = useCountUp(value, 1)
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="0 0 200 200" className="w-[200px] h-[200px]">
          {/* track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TRACK}
            strokeWidth={18}
            strokeLinecap="round"
            strokeDasharray={`${SWEEP * C} ${C}`}
            transform={`rotate(135 ${cx} ${cy})`}
          />
          {/* value */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={18}
            strokeLinecap="round"
            strokeDasharray={`${SWEEP * C} ${C}`}
            transform={`rotate(135 ${cx} ${cy})`}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: SWEEP * (value / 100) }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 1.4, ease: EASE }}
          />
          <motion.text
            ref={ref as React.RefObject<SVGTextElement>}
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="tabular-nums"
            style={{ fontSize: 38, fontWeight: 800, fill: C_INK, letterSpacing: '-0.04em' }}
          >
            {text}
          </motion.text>
          <text x={cx} y={cy - 2} dx={34} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: C_INK }}>
            %
          </text>
          <text x={cx} y={cy + 26} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: C_MUTE }}>
            {sub}
          </text>
        </svg>
      </div>
      <p className="text-center text-[13px] font-bold text-[#1D1D1F] tracking-tight -mt-2">{label}</p>
    </div>
  )
}

/* ── horizontal compare bar ── */
function CompareBar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-[#434345]">{label}</span>
        <span className="text-[13px] font-extrabold tabular-nums" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: TRACK }}>
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

/* ── donut from segments ── */
type Seg = { label: string; value: number; color: string }
function Donut({ segments, centerTop, centerBottom, size = 200 }: { segments: Seg[]; centerTop: string; centerBottom: string; size?: number }) {
  const r = 72
  const cx = 100
  const cy = 100
  const total = segments.reduce((s, x) => s + x.value, 0)
  let acc = 0
  return (
    <svg viewBox="0 0 200 200" style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={TRACK} strokeWidth={26} />
      {segments.map((seg, i) => {
        const f = seg.value / total
        const startDeg = -90 + (acc / total) * 360
        acc += seg.value
        return (
          <motion.circle
            key={seg.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={26}
            strokeLinecap="butt"
            transform={`rotate(${startDeg} ${cx} ${cy})`}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: f }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 1, ease: EASE, delay: 0.15 * i }}
          />
        )
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 15, fontWeight: 800, fill: C_INK, letterSpacing: '-0.02em' }}>
        {centerTop}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: C_MUTE }}>
        {centerBottom}
      </text>
    </svg>
  )
}

function Legend({ segments }: { segments: Seg[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
          <span className="text-[12px] font-semibold text-[#434345]">
            {s.label} <b className="tabular-nums" style={{ color: s.color }}>{s.value}%</b>
          </span>
        </div>
      ))}
    </div>
  )
}

function SectionHead({ eyebrow, title, subtitle, accent }: { eyebrow: string; title: string; subtitle: string; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE }}
      className="mb-14 text-center"
    >
      <p className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4" style={{ color: accent }}>
        {eyebrow}
      </p>
      <h2 className="section-title mb-4 leading-tight whitespace-pre-line">{title}</h2>
      <p className="text-[#86868B] font-medium max-w-xl mx-auto leading-relaxed whitespace-pre-line" style={{ fontSize: 'var(--font-size-body-lg)' }}>
        {subtitle}
      </p>
    </motion.div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`rounded-[24px] border border-black/[0.05] bg-white shadow-[0_4px_18px_rgba(0,0,0,0.03)] p-7 md:p-9 ${className}`}
    >
      {children}
    </motion.div>
  )
}

/* ── VizColor 이름 → 실제 색 상수 매핑 (의미색만, 보라 금지) ── */
const COLOR: Record<VizColor, string> = {
  blue: C_BLUE,
  green: C_GREEN,
  amber: C_AMBER,
  red: C_RED,
}

/* ── 게이지 블록: 270° 게이지 + 비교막대 + 노트 ── */
function GaugeBlock({ block }: { block: VizGaugeBlock }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        {block.alert && <AlertTriangle size={16} className="text-[#FF3B30]" />}
        <p className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#86868B]">{block.label}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] items-center gap-4 mt-2">
        <Gauge value={block.gauge.value} label={block.gauge.label} sub={block.gauge.sub} color={COLOR[block.gauge.color]} />
        <div className="flex flex-col gap-4 sm:pl-2">
          {block.bars?.map((bar, i) => (
            <CompareBar key={bar.label} label={bar.label} value={bar.value} color={COLOR[bar.color]} delay={0.2 + i * 0.15} />
          ))}
          {block.note && (
            <p className="text-[12.5px] text-[#86868B] font-medium leading-relaxed">{block.note}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ── 도넛 블록: 단일 도넛 + 범례 + 노트 ── */
function DonutBlock({ block }: { block: VizDonutBlock }) {
  const segs: Seg[] = block.segments.map((s) => ({ label: s.label, value: s.value, color: COLOR[s.color] }))
  return (
    <Card>
      <p className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#86868B] mb-2">{block.label}</p>
      <div className="flex flex-col items-center gap-5 mt-2">
        <Donut segments={segs} centerTop={block.centerTop} centerBottom={block.centerBottom} />
        <Legend segments={segs} />
        {block.note && (
          <p className="text-[12.5px] text-[#86868B] font-medium leading-relaxed text-center max-w-sm">{block.note}</p>
        )}
      </div>
    </Card>
  )
}

/* ── 비교 블록: Before/After 도넛 ── */
function CompareBlock({ block }: { block: VizCompareBlock }) {
  const before: Seg[] = block.before.map((s) => ({ label: s.label, value: s.value, color: COLOR[s.color] }))
  const after: Seg[] = block.after.map((s) => ({ label: s.label, value: s.value, color: COLOR[s.color] }))
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-8">
        {/* before */}
        <div className="flex flex-col items-center gap-4">
          <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#86868B]">{block.beforeLabel}</span>
          <Donut segments={before} centerTop={block.beforeCenterTop} centerBottom={block.beforeCenterBottom} size={180} />
          <Legend segments={before} />
        </div>
        {/* arrow */}
        <div className="flex md:flex-col items-center justify-center gap-2 text-[#007AFF]">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.6 }}
            className="w-12 h-12 rounded-full bg-[#007AFF] flex items-center justify-center shadow-[0_6px_16px_rgba(0,113,227,0.3)]"
          >
            <TrendingUp size={22} className="text-white" strokeWidth={2.2} />
          </motion.div>
          <span className="text-[11px] font-extrabold text-[#007AFF] tracking-tight">{block.midLabel}</span>
        </div>
        {/* after */}
        <div className="flex flex-col items-center gap-4">
          <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-[#007AFF]">{block.afterLabel}</span>
          <Donut segments={after} centerTop={block.afterCenterTop} centerBottom={block.afterCenterBottom} size={180} />
          <Legend segments={after} />
        </div>
      </div>
      {block.note && (
        <p className="text-[12.5px] text-[#86868B] font-medium leading-relaxed text-center max-w-2xl mx-auto mt-8">{block.note}</p>
      )}
    </Card>
  )
}

function renderBlock(block: VizBlock, i: number) {
  switch (block.kind) {
    case 'gauge':
      return <GaugeBlock key={i} block={block} />
    case 'donut':
      return <DonutBlock key={i} block={block} />
    case 'compare':
      return <CompareBlock key={i} block={block} />
  }
}

export function StreamDataViz({ data }: { data: StreamVizData }) {
  const single = data.blocks.length <= 1
  return (
    <section id="data-viz" className="bg-[#F5F5F7] py-24 md:py-32 border-t border-black/[0.04]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <SectionHead eyebrow={data.eyebrow} title={data.title} subtitle={data.subtitle} accent={COLOR[data.accent]} />
        <div className={single ? '' : 'grid grid-cols-1 lg:grid-cols-2 gap-5'}>
          {data.blocks.map((block, i) => renderBlock(block, i))}
        </div>
      </div>
    </section>
  )
}
