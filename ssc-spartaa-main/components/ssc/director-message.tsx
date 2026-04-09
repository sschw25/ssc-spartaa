'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { Quote } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'

export function DirectorMessage() {
  return (
    <section id="director" className="py-24 bg-[#1D1D1F] text-white overflow-hidden relative">
      {/* Background Subtle Gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black via-transparent to-black opacity-40 pointer-events-none" />
      
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6 relative z-10 flex flex-col md:flex-row items-center gap-16 md:gap-24">
        {/* Profile Image / Image Placeholder */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="w-full md:w-1/3 aspect-[3/4] relative group"
        >
          <div className="absolute inset-0 rounded-[40px] border border-white/10 group-hover:border-white/20 transition-colors" />
          <div className="absolute inset-2 rounded-[32px] overflow-hidden group-hover:inset-0 transition-all duration-700">
             <Image 
               src="/images/commenters.jpg" 
               alt="SSC Sparta Director & Team"
               fill
               className="object-cover group-hover:scale-105 transition-all duration-1000"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-[#1D1D1F] via-transparent to-transparent opacity-60" />
          </div>
          {/* Caption */}
          <div className="absolute -bottom-6 -right-6 md:-right-12 bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl">
             <p className="text-white text-lg font-bold leading-tight">스파르타 임직원 일동<br /><span className="text-white/60 text-xs font-medium uppercase tracking-widest">SSC Sparta Team</span></p>
          </div>
        </motion.div>

        {/* Content Side */}
        <div className="flex-1 text-left">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Quote className="text-[#0071E3] mb-8" size={40} />
            <h2 className="section-title text-white mb-8 leading-tight">
              <RhythmicText text={"관리는 단순한 통제가 아니라\n학생의 의지가 꺾이지 않도록\n지켜주는 울타리입니다."} />
            </h2>
            <div className="space-y-6 text-white/90 text-base md:text-lg font-medium leading-relaxed tracking-tight break-keep">
              <RhythmicText text={"수험 생활의 실패는\n머리가 나빠서가 아닙니다.\n불안함에 못 이겨 스마트폰을 켜는 순간,\n나른함에 못 이겨 책상을 떠나는\n그 찰나의 순간들이 모여 실패를 만듭니다."} />
              <RhythmicText text={"SSC스파르타는\n여러분의 그 '순간'들을 지킵니다.\n혼자 가면 외로운 길이지만,\n철저한 시스템 안에서 함께 가면\n반드시 합격이라는 결승선에 도달할 수 있습니다."} />
              <RhythmicText text={"충주, 원주, 춘천 캠퍼스의 모든 코멘터들이\n여러분의 인생을 건 도전을\n가장 가까이에서 응원하겠습니다."} />
            </div>
            <div className="mt-12 inline-flex flex-col gap-1">
              <p className="text-white font-bold leading-snug">스파르타 임직원 일동 올림</p>
              <div className="h-[2px] w-12 bg-[#0071E3] rounded-full" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
