'use client'

import { motion } from 'framer-motion'

interface AvailabilityBadgeProps {
  campusName: string
}

// 정직한 안내 배지 — 실제 좌석 수 데이터가 없으므로 거짓 희소성("잔여석 마감 임박")은 쓰지 않는다.
// 사실인 것만: 신규 등록 상담을 접수 중. systemGreen(접수 가능) + 차분한 톤.
export function AvailabilityBadge({ campusName }: AvailabilityBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-md border border-[#34C759]/15 mb-8 cursor-default"
    >
      <span className="w-2 h-2 rounded-full bg-[#34C759]" />
      <span className="text-[11px] sm:text-xs font-semibold text-[#1D1D1F] tracking-tight text-center">
        {campusName} 캠퍼스 <span className="text-[#86868B] font-medium">·</span> 신규 등록 상담 접수 중
      </span>
    </motion.div>
  )
}
