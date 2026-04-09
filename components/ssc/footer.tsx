'use client'

import React from 'react'
import { CAMPUS_CONFIG } from '@/lib/campus-config'

export function Footer() {
  return (
    <footer className="bg-white border-t border-black/5 py-14">
      <div className="max-w-[72rem] mx-auto px-4 sm:px-6">
        
        {/* Company Info Block */}
        <div className="text-[12px] leading-[1.8] text-[#86868B]">
          <p className="font-bold text-[#434345] mb-2 text-[13px]">(주)에스에스씨 스파르타</p>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(원주) :</span>
              <a href={`tel:${CAMPUS_CONFIG.wonju.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.wonju.phone}</a>
            </div>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(춘천) :</span>
              <a href={`tel:${CAMPUS_CONFIG.chuncheon.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.chuncheon.phone}</a>
            </div>
            <span className="w-[1px] h-2 bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">전화번호(충주) :</span>
              <a href={`tel:${CAMPUS_CONFIG.chungju.phone}`} className="hover:text-[#0071E3]">{CAMPUS_CONFIG.chungju.phone}</a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-[#86868B]/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-black/60">주사무소(원주) :</span>
              <span>{CAMPUS_CONFIG.wonju.address}</span>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 opacity-60">
            <p className="text-[11px] tracking-tight">
              Copyright © 2025 (주)에스에스씨 스파르타 All rights reserved. 
              단기 합격의 꿈, SSC 스파르타가 함께합니다.
            </p>
          </div>
        </div>

      </div>
    </footer>
  )
}
