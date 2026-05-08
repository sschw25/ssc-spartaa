'use client'

import { motion } from 'framer-motion'

interface AvailabilityBadgeProps {
  campusName: string
}

export function AvailabilityBadge({ campusName }: AvailabilityBadgeProps) {
  // Randomly select small number (2~4) for urgency or different message
  const limitedSeats = 3 

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-md border border-[#FF3B30]/10 mb-8 cursor-default group"
    >
      <div className="relative w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-[#FF3B30] animate-ping opacity-75" />
        <span className="absolute inset-0 rounded-full bg-[#FF3B30]" />
      </div>
      <span className="text-[11px] sm:text-xs font-bold text-[#FF3B30] tracking-tight text-center">
        {campusName} 캠퍼스 <span className="opacity-60 font-medium">·</span> 현재 잔여석이 얼마 남지 않았습니다 <span className="underline decoration-[#FF3B30]/30 underline-offset-2">(선착순 마감)</span>
      </span>
    </motion.div>
  )
}
