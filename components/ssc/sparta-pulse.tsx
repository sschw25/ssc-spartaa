'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Users, ArrowRight } from 'lucide-react'

// 제공해주신 이미지 기반 학원 시간표 데이터
const TIMETABLE = [
  { start: '08:20', end: '09:00', label: '0교시: 단어 테스트 및 지각 차단 중', type: 'supplement' },
  { start: '09:00', end: '10:50', label: '1교시: 실전 모의고사 및 집중 학습 중', type: 'study' },
  { start: '10:50', end: '11:10', label: '휴식: 다음 몰입을 위한 짧은 정비 시간입니다', type: 'break' },
  { start: '11:10', end: '12:30', label: '2교시: 숨소리조차 들리지 않는 정적 속의 질주', type: 'study' },
  { start: '12:30', end: '13:50', label: '점심시간: 오후의 압도적 몰입을 위해 에너지를 재충전 중', type: 'meal' },
  { start: '13:50', end: '15:00', label: '3교시: 나태함이 파고들 틈 없는 철저한 관리 중', type: 'study' },
  { start: '15:00', end: '15:10', label: '휴식: 다시 한번 집중력을 가다듬는 시간', type: 'break' },
  { start: '15:10', end: '16:20', label: '4교시: 한계를 넘어서는 순공 시간 확보의 정점', type: 'study' },
  { start: '16:20', end: '16:30', label: '휴식: 마지막 스퍼트를 위한 호흡 가다듬기', type: 'break' },
  { start: '16:30', end: '17:40', label: '5교시: 합격을 앞당기는 소리 없는 열정의 기록 중', type: 'study' },
  { start: '17:40', end: '18:50', label: '저녁시간: 야간 학습의 추진력을 얻기 위한 준비 시간', type: 'meal' },
  { start: '18:50', end: '20:20', label: '6교시: 모두가 지치는 시간, 스파르타의 관리가 빛을 발하는 순간', type: 'study' },
  { start: '20:20', end: '20:30', label: '휴식: 오늘 하루의 결실을 맺기 전 마지막 정돈', type: 'break' },
  { start: '20:30', end: '22:00', label: '7교시: 오늘 하루의 결실을 맺는 완벽한 마무리 학습', type: 'study' },
  { start: '22:00', end: '22:10', label: '정비: 심야 자율 학습 전 잠시 숨 고르기', type: 'break' },
  { start: '22:10', end: '23:20', label: '심야 자율 학습: 남들보다 앞서가는 새벽의 몰입', type: 'late-study' },
]

export function SpartaPulse() {
  const [time, setTime] = useState(new Date())
  const [activeStep, setActiveStep] = useState<typeof TIMETABLE[0] | null>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setTime(now)
      
      const currentTimeStr = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })
      const currentStep = TIMETABLE.find(step => {
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
    <div className="w-full bg-[#0A0A0B] overflow-hidden">
      <div className="relative py-16 md:py-28 px-4 sm:px-6">
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
            <div className="w-full text-center flex flex-col items-center justify-center mb-8 px-8 md:px-16">
               <div className="flex items-baseline justify-center font-sans tracking-[-0.06em] w-full max-w-6xl mx-auto">
                  <span className="text-[12vw] md:text-[14vw] lg:text-[12.5rem] font-bold text-white leading-[0.8] tabular-nums">
                    {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[3vw] md:text-[4vw] lg:text-[3.5rem] font-medium text-[#0071E3] ml-1 md:ml-3 opacity-90 tabular-nums">
                    .{formatMs(time)}
                  </span>
               </div>
               <p className="text-[#86868B] text-[10px] md:text-[13px] font-bold tracking-[0.5em] uppercase mt-8 bg-white/[0.05] border border-white/[0.1] px-6 py-2 rounded-full">
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
                    <h3 className="text-2xl md:text-[2.75rem] font-semibold text-white tracking-[-0.03em] mb-6 break-keep leading-[1.1]">
                      {activeStep ? (
                        <> 지금 이 순간, 스파르타 캠퍼스 전우들은<br /> 
                           <span className="text-[#0071E3] bg-[#0071E3]/10 px-4 py-1 rounded-[12px] inline-block mt-2">{activeStep.label}</span>
                        </>
                      ) : (
                        "스파르타는 지금 내일의 더 강력한 몰입을 준비하고 있습니다."
                      )}
                    </h3>
                    <div className="inline-flex items-center gap-4 px-5 py-2.5 rounded-full bg-white/[0.04] border border-white/[0.1] text-[#86868B] text-sm md:text-base font-semibold tracking-tight">
                        <Users size={18} className="text-[#0071E3]" />
                        <span>전국 캠퍼스의 스파르탄들 <span className="text-white font-bold">압도적 몰입 중</span></span>
                    </div>
                  </motion.div>
               </AnimatePresence>
            </div>

            {/* Bottom Urgency Link - Sharp Button */}
            <motion.div 
               whileHover={{ scale: 1.02 }}
               whileTap={{ scale: 0.98 }}
               className="mt-12"
            >
               <a 
                 href="#cta" 
                 className="group relative inline-flex items-center gap-3 px-12 py-5 bg-[#ffffff] text-[#000000] rounded-full text-lg font-bold shadow-[0_10px_30px_rgba(255,255,255,0.1)] hover:shadow-[0_20px_50px_rgba(255,255,255,0.2)] transition-all"
               >
                 당신의 자리를 지금 확보하세요
                 <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
               </a>
            </motion.div>
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
