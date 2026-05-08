'use client'

import { useEffect, useRef } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })
  
  const spring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })
  
  const displayValue = useTransform(spring, (current) => Math.round(current).toLocaleString() + suffix)

  useEffect(() => {
    if (inView) {
      spring.set(value)
    }
  }, [inView, value, spring])

  return (
    <motion.span ref={ref} className="text-4xl md:text-6xl font-semibold tracking-tighter text-[#1D1D1F]">
      {displayValue}
    </motion.span>
  )
}

export function AnimatedStats() {
  return (
    <section id="stats" className="py-24 bg-white border-b border-black/[0.03]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div className="flex flex-col gap-2">
            <Counter value={500} suffix="+" />
            <p className="text-[#86868B] text-sm font-medium tracking-tight uppercase">누적 최종 합격자 수</p>
          </div>
          <div className="flex flex-col gap-2">
            <Counter value={11} suffix="H+" />
            <p className="text-[#86868B] text-sm font-medium tracking-tight uppercase">학생 평균 실제 순공 시간</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Counter value={56} suffix="%" />
            <p className="text-[#86868B] text-sm font-medium tracking-tight uppercase">스파르타를 버텨낸 사람들의 합격률</p>
            <p className="text-[#AEAEB2] text-[10px] font-medium tracking-tight mt-0.5">
              * 1년 이상 스파르타 경험 인증 합격자 수 추산 기준
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
