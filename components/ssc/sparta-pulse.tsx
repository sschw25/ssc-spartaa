'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'
import { ACADEMY_TIMETABLE } from '@/lib/academy-timetable'

const fmtClock = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtMs = (d: Date) => d.getMilliseconds().toString().padStart(3, '0').slice(0, 2)
const toMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

export function SpartaPulse() {
  const [mounted, setMounted] = useState(false)
  // 교시(activeStep)는 교시 경계에서만 바뀌므로 라벨이 실제로 변할 때만 setState.
  // 시계 숫자는 ref + requestAnimationFrame 으로 DOM 텍스트를 직접 갱신 → 초당 60회 리렌더 제거.
  const [activeStep, setActiveStep] = useState<typeof ACADEMY_TIMETABLE[0] | null>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const msRef = useRef<HTMLSpanElement>(null)
  const activeLabelRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
    let raf = 0

    const tick = () => {
      const now = new Date()
      if (clockRef.current) clockRef.current.textContent = fmtClock(now)
      if (msRef.current) msRef.current.textContent = '.' + fmtMs(now)

      const currentTimeStr = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })
      const step = ACADEMY_TIMETABLE.find((s) => currentTimeStr >= s.start && currentTimeStr < s.end) || null
      const label = step?.label ?? null
      if (label !== activeLabelRef.current) {
        activeLabelRef.current = label
        setActiveStep(step)
      }
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    start()
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // 진행 바 주기(초) — 교시 길이. activeStep 이 바뀔 때만 재계산되며 time state 의존 제거.
  const durationSec = activeStep ? (toMinutes(activeStep.end) - toMinutes(activeStep.start)) * 60 : 0

  return (
    <div className="w-full bg-[#0A0A0B] text-white overflow-hidden">
      <div className="relative pt-16 md:pt-28 pb-8 md:pb-12 px-4 sm:px-6">
        {/* Apple-style Subtle Gradient Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
           <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[90%] h-[60%] bg-[radial-gradient(circle_at_center,rgba(0,113,227,0.12)_0%,transparent_80%)] blur-[40px]" />
        </div>

        <div className="max-w-[100rem] mx-auto relative z-10">
          <div className="flex flex-col items-center">
            {/* Live Indicator - Sharper UI */}
            <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#007AFF]/20 border border-[#007AFF]/40 text-[#ffffff] text-[9.5px] font-semibold tracking-[0.18em] uppercase mb-10 shadow-[0_0_25px_rgba(0,113,227,0.4)] animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-[#007AFF] shadow-[0_0_10px_#007AFF]" />
              Live Sparta Pulse
            </div>

            {/* Massive Digital Clock - Sharp Apple Typography */}
            <div className="w-full text-center flex flex-col items-center justify-center mb-12 px-8 md:px-16">
               <div className="flex items-baseline justify-center font-sans tracking-[-0.08em] w-full max-w-7xl mx-auto drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                  <span ref={clockRef} className="text-[14vw] md:text-[16vw] lg:text-[14rem] font-semibold text-white leading-[0.75] tabular-nums">
                    00:00:00
                  </span>
                  <span ref={msRef} className="text-[4vw] md:text-[5vw] lg:text-[4.5rem] font-semibold text-[#007AFF] ml-1 md:ml-4 opacity-90 tabular-nums">
                    .00
                  </span>
               </div>
               <p className="text-[#86868B] text-[10px] md:text-[14px] font-semibold tracking-[0.18em] uppercase mt-12 bg-white/[0.03] border border-white/[0.08] px-8 py-2.5 rounded-full backdrop-blur-sm">
                  Every Second Counts Towards Your Future
               </p>
            </div>

            {/* Status Message Board - Refined Typography */}
            <div className="w-full max-w-5xl mx-auto border-t border-white/[0.08] pt-10">
               <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep?.label || 'offline'}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-center"
                  >
                    <h3 className="text-3xl md:text-[3.25rem] font-semibold text-white tracking-tight mb-8 leading-[1.15] text-balance">
                      {activeStep ? (
                        <div className="flex flex-col items-center gap-6">
                           <RhythmicText text={"지금 이 순간,\n스파르타 캠퍼스 전우들은"} className="text-white/90" />
                           <span className="text-[#007AFF] bg-[#007AFF]/15 px-6 py-3 rounded-[20px] inline-block text-[0.75em] border border-[#007AFF]/20 shadow-[0_10px_40px_rgba(0,113,227,0.15)]">
                             <RhythmicText text={activeStep.label.replace(':', '\n:')} />
                           </span>
                        </div>
                      ) : (
                        <RhythmicText text={"스파르타는 지금\n내일의 더 강력한 몰입을\n준비하고 있습니다."} />
                      )}
                    </h3>
                    <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full bg-white/[0.03] border border-white/[0.08] text-[#86868B] text-sm md:text-lg font-semibold tracking-tight backdrop-blur-md">
                        <Users size={20} className="text-[#007AFF]" />
                        <span>전국 캠퍼스의 스파르탄들 <span className="text-white">압도적 몰입 중</span></span>
                    </div>
                  </motion.div>
               </AnimatePresence>
            </div>

          </div>
        </div>

        {/* Rapid Progress Bar - Sharp & Professional */}
        {activeStep && (
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/[0.05]">
             <motion.div
               key={activeStep.label}
               initial={{ width: 0 }}
               animate={{ width: '100%' }}
               transition={{
                 duration: durationSec,
                 ease: "linear",
                 repeat: Infinity
               }}
               className="h-full bg-gradient-to-r from-[#007AFF] to-[#40a3ff]"
             />
          </div>
        )}
      </div>
    </div>
  )
}
