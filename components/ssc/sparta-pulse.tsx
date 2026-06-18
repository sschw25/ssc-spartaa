'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Users, ArrowRight } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'
import { ACADEMY_TIMETABLE } from '@/lib/academy-timetable'

export function SpartaPulse() {
  const [time, setTime] = useState(new Date())
  const [mounted, setMounted] = useState(false)
  const [activeStep, setActiveStep] = useState<typeof ACADEMY_TIMETABLE[0] | null>(null)

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => {
      const now = new Date()
      setTime(now)
      
      const currentTimeStr = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })
      const currentStep = ACADEMY_TIMETABLE.find(step => {
        return currentTimeStr >= step.start && currentTimeStr < step.end
      })
      setActiveStep(currentStep || null)
    }, 16)

    return () => clearInterval(timer)
  }, [])

  const formatMs = (date: Date) => {
    return date.getMilliseconds().toString().padStart(3, '0').slice(0, 2)
  }

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
            <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0071E3]/20 border border-[#0071E3]/40 text-[#ffffff] text-[9.5px] font-black tracking-[0.25em] uppercase mb-10 shadow-[0_0_25px_rgba(0,113,227,0.4)] animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0071E3] shadow-[0_0_10px_#0071E3]" />
              Live Sparta Pulse
            </div>

            {/* Massive Digital Clock - Sharp Apple Typography */}
            <div className="w-full text-center flex flex-col items-center justify-center mb-12 px-8 md:px-16">
               <div className="flex items-baseline justify-center font-sans tracking-[-0.08em] w-full max-w-7xl mx-auto drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                  <span className="text-[14vw] md:text-[16vw] lg:text-[14rem] font-bold text-white leading-[0.75] tabular-nums">
                    {mounted ? time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '00:00:00'}
                  </span>
                  <span className="text-[4vw] md:text-[5vw] lg:text-[4.5rem] font-bold text-[#0071E3] ml-1 md:ml-4 opacity-90 tabular-nums">
                    .{mounted ? formatMs(time) : '00'}
                  </span>
               </div>
               <p className="text-[#86868B] text-[10px] md:text-[14px] font-extrabold tracking-[0.6em] uppercase mt-12 bg-white/[0.03] border border-white/[0.08] px-8 py-2.5 rounded-full backdrop-blur-sm">
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
                    <h3 className="text-3xl md:text-[3.25rem] font-bold text-white tracking-[-0.04em] mb-8 leading-[1.15] text-balance">
                      {activeStep ? (
                        <div className="flex flex-col items-center gap-6">
                           <RhythmicText text={"지금 이 순간,\n스파르타 캠퍼스 전우들은"} className="text-white/90" />
                           <span className="text-[#0071E3] bg-[#0071E3]/15 px-6 py-3 rounded-[20px] inline-block text-[0.75em] border border-[#0071E3]/20 shadow-[0_10px_40px_rgba(0,113,227,0.15)]">
                             <RhythmicText text={activeStep.label.replace(':', '\n:')} />
                           </span>
                        </div>
                      ) : (
                        <RhythmicText text={"스파르타는 지금\n내일의 더 강력한 몰입을\n준비하고 있습니다."} />
                      )}
                    </h3>
                    <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full bg-white/[0.03] border border-white/[0.08] text-[#86868B] text-sm md:text-lg font-bold tracking-tight backdrop-blur-md">
                        <Users size={20} className="text-[#0071E3]" />
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
               initial={{ width: 0 }}
               animate={{ width: '100%' }}
               transition={{ 
                 duration: (new Date(`${time.toDateString()} ${activeStep.end}`).getTime() - new Date(`${time.toDateString()} ${activeStep.start}`).getTime()) / 1000,
                 ease: "linear",
                 repeat: Infinity
               }}
               className="h-full bg-gradient-to-r from-[#0071E3] to-[#40a3ff]"
             />
          </div>
        )}
      </div>
    </div>
  )
}
