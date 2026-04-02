'use client'

import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Smartphone, BookOpen, Coffee, Clock, LucideIcon } from 'lucide-react'

function Badge({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${color}`}>
      <Icon size={14} className="shrink-0" />
      <span className="text-xs font-bold whitespace-nowrap">{label}</span>
    </div>
  )
}

export function BeforeAfterSwipe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const xPercent = useMotionValue(50)
  
  // Smooth spring effect for the slider handle
  const springConfig = { damping: 30, stiffness: 300 }
  const smoothPercent = useSpring(xPercent, springConfig)
  
  // Clip path for the right (Sparta) side
  const clipPath = useTransform(smoothPercent, (v) => `inset(0 0 0 ${v}%)`)
  const handleLeft = useTransform(smoothPercent, (v) => `${v}%`)

  const handleMove = (clientX: number) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const position = ((clientX - rect.left) / rect.width) * 100
      xPercent.set(Math.max(0, Math.min(100, position)))
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => handleMove(e.clientX)
  const handleTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX)

  return (
    <section id="comparison" className="py-24 bg-[#F5F5F7]">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="mb-16 text-center">
            <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 whitespace-pre-line break-keep leading-tight">
              당신의 1년,{'\n'}
              누구와 함께하시겠습니까?
            </h2>
            <p className="text-[#86868B] text-lg font-medium leading-relaxed max-w-2xl mx-auto whitespace-pre-line break-keep">
              슬라이더를 좌우로 밀어서{'\n'}
              스파르타가 선사하는 '진짜 몰입'을 체감해 보세요.
            </p>
        </div>

        <div 
          ref={containerRef}
          className="relative h-[450px] md:h-[550px] rounded-[40px] overflow-hidden border border-black/[0.05] shadow-2xl cursor-ew-resize select-none"
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
        >
          {/* Left Side: BEFORE (Alone) */}
          <div className="absolute inset-0 bg-[#E5E5EA] overflow-hidden">
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
               <div className="absolute top-10 left-10 flex flex-col gap-3">
                  <Badge icon={Smartphone} label="스마트폰 유혹" color="bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/10" />
                  <Badge icon={Coffee} label="나른한 낮잠" color="bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/10" />
               </div>
               <div className="max-w-xs md:max-w-md">
                   <h3 className="text-4xl md:text-6xl font-black text-[#1D1D1F]/10 tracking-widest uppercase mb-4">ALONE</h3>
                   <p className="text-[#1D1D1F]/40 text-xl font-bold italic tracking-tighter">
                      "내일부터 진짜 빡세게 해야지..."
                   </p>
               </div>
            </div>
          </div>

          {/* Right Side: AFTER (Sparta) */}
          <motion.div 
            className="absolute inset-0 bg-[#0071E3] overflow-hidden pointer-events-none"
            style={{ clipPath }}
          >
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
               <div className="absolute bottom-10 right-10 flex flex-col items-end gap-3 translate-x-2">
                  <Badge icon={BookOpen} label="순공 12시간 몰입" color="bg-white/20 text-white border border-white/20" />
                  <Badge icon={Clock} label="교시제 집중학습" color="bg-white/20 text-white border border-white/20" />
               </div>
               <div className="max-w-xs md:max-w-md">
                   <h3 className="text-4xl md:text-6xl font-black text-white/20 tracking-widest uppercase mb-4">SPARTA</h3>
                   <p className="text-white text-xl font-bold italic tracking-tighter">
                      "오늘도 목표치를 완벽히 끝냈다."
                   </p>
               </div>
            </div>
          </motion.div>

          {/* Slider Handle */}
          <motion.div 
            className="absolute top-0 bottom-0 w-1 bg-white shadow-xl z-20"
            style={{ left: handleLeft, transform: 'translateX(-50%)' }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white shadow-2xl flex items-center justify-center gap-[2px]">
                <div className="w-[2px] h-4 bg-black/10 rounded-full" />
                <div className="w-[2px] h-6 bg-[#0071E3] rounded-full mx-1" />
                <div className="w-[2px] h-4 bg-black/10 rounded-full" />
            </div>
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-xl">
               Drag to compare
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
