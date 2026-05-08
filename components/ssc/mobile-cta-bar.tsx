'use client'

import { CAMPUS_CONFIG } from '@/lib/campus-config'

interface MobileCtaBarProps {
  phone?: string
  naverTalkUrl?: string
}

export function MobileCtaBar({
  phone = CAMPUS_CONFIG.wonju.phone,
  naverTalkUrl = CAMPUS_CONFIG.wonju.naverTalkUrl,
}: MobileCtaBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white border-t border-border-color md:hidden">
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`tel:${phone}`}
          className="flex items-center justify-center py-3.5 rounded-xl bg-accent-amber text-navy font-bold text-sm"
        >
          📞 전화 상담
        </a>
        <a
          href={naverTalkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center py-3.5 rounded-xl bg-[#03C75A] text-white font-bold text-sm"
        >
          💬 네이버 톡톡
        </a>
      </div>
    </div>
  )
}
