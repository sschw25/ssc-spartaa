'use client'

import { useEffect, useRef } from 'react'
import { motion, useInView, useSpring, useTransform } from 'framer-motion'

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef(null)
  // amount(가시 비율)로 판정 — 예전 margin:'-100px'는 좌우도 100px 줄여서 오른쪽(합격률) 컬럼의
  // 가운데 정렬 숫자가 좁은 화면에서 "화면 밖"으로 잡혀 카운트업이 0에 머무는 버그가 있었다.
  const inView = useInView(ref, { once: true, amount: 0.4 })
  
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
    <motion.span ref={ref} className="text-[30px] leading-none sm:text-4xl md:text-6xl font-semibold tracking-tighter text-[#1D1D1F] tabular-nums">
      {displayValue}
    </motion.span>
  )
}

export function AnimatedStats() {
  return (
    <section id="stats" className="py-12 sm:py-16 md:py-24 bg-white border-b border-black/[0.03]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-3 gap-3 sm:gap-8 md:gap-12 text-center">
          <div className="min-w-0 flex flex-col gap-2">
            <Counter value={500} suffix="+" />
            <p className="text-[#86868B] text-[11px] sm:text-sm font-medium leading-snug tracking-tight uppercase break-keep">누적 최종 합격자 수</p>
          </div>
          <div className="min-w-0 flex flex-col gap-2">
            <Counter value={11} suffix="H+" />
            <p className="text-[#86868B] text-[11px] sm:text-sm font-medium leading-snug tracking-tight uppercase break-keep">학생 평균 실제 순공 시간</p>
          </div>
          <div className="min-w-0 flex flex-col items-center gap-2">
            <Counter value={56} suffix="%" />
            <p className="text-[#86868B] text-[11px] sm:text-sm font-medium leading-snug tracking-tight uppercase break-keep">스파르타를 버텨낸 사람들의 합격률</p>
            <p className="text-[#AEAEB2] text-[11px] font-medium leading-snug tracking-tight mt-0.5 break-keep">
              * 1년 이상 스파르타 경험 인증 합격자 수 추산 기준
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
