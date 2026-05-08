'use client'

import { motion } from 'framer-motion'
import { Check, X, Info } from 'lucide-react'

const SEAT_TYPES = [
  { name: '강의실 학습공간', privacy: '중', noise: '초저소음', laptop: false, ideal: '스카 분위기 선호자' },
  { name: '개인 학습테이블', privacy: '최상', noise: '완전무소음', laptop: false, ideal: '독서실 몰입 선호자' },
  { name: '라운지', privacy: '하', noise: '타이핑 허용', laptop: true, ideal: '인강, 자소서 작업자' },
]

export function FacilityComparison() {
  return (
    <section id="chairs" className="py-24 bg-white">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 whitespace-pre-line break-keep leading-tight">
            나에게 딱 맞는{'\n'}
            학습 공간 찾기
          </h2>
          <p className="text-[#86868B] text-lg font-medium leading-relaxed max-w-2xl mx-auto whitespace-pre-line break-keep">
            모든 좌석은 수험생의 체형과 집중력을 고려해{'\n'}
            인체공학적으로 설계되었습니다.
          </p>
        </div>

        <div className="overflow-x-auto no-scrollbar border border-black/[0.05] rounded-3xl bg-[#F5F5F7]/30">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="border-b border-black/[0.05]">
                <th className="p-6 text-left text-sm font-bold text-[#86868B] uppercase tracking-widest">Type</th>
                <th className="p-6 text-center text-sm font-bold text-[#86868B] uppercase tracking-widest">개인 프라이버시</th>
                <th className="p-6 text-center text-sm font-bold text-[#86868B] uppercase tracking-widest">소음 관리 기준</th>
                <th className="p-6 text-center text-sm font-bold text-[#86868B] uppercase tracking-widest">노트북 타이핑</th>
                <th className="p-6 text-left text-sm font-bold text-[#86868B] uppercase tracking-widest">추천 대상</th>
              </tr>
            </thead>
            <tbody>
              {SEAT_TYPES.map((seat, i) => (
                <tr key={i} className="border-b border-black/[0.05] hover:bg-white/50 transition-colors">
                  <td className="p-6 font-bold text-[#1D1D1F] text-lg">{seat.name}</td>
                  <td className="p-6 text-center">
                    <span className="inline-flex items-center px-3 py-1 bg-white rounded-full text-xs font-bold text-[#1D1D1F] border border-black/5 shadow-sm">
                      {seat.privacy}
                    </span>
                  </td>
                  <td className="p-6 text-center text-[#86868B] font-medium">{seat.noise}</td>
                  <td className="p-6 text-center">
                    <div className="flex justify-center">
                      {seat.laptop ? (
                        <div className="w-6 h-6 rounded-full bg-[#34C759]/10 text-[#34C759] flex items-center justify-center">
                          <Check size={14} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] flex items-center justify-center">
                          <X size={14} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-6 text-[#86868B] font-medium italic">{seat.ideal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 p-6 rounded-2xl bg-[#0071E3]/5 border border-[#0071E3]/10 flex items-start gap-4">
          <Info className="text-[#0071E3] shrink-0" size={20} />
          <p className="text-[#0071E3] text-sm font-medium leading-relaxed break-keep">
            독학 관리반 등록 시 위 3가지 학습 공간(강의실, 개인테이블, 라운지)을 모두 자유롭게 이용할 수 있습니다. 전 좌석에 백색 소음기 시스템이 가동 중이며, 개인별 수납공간과 기가 와이파이(5G), 그리고 콘센트가 기본 제공됩니다. 자세한 좌석 현황은 캠퍼스 상담 시 안내해 드립니다.
          </p>
        </div>
      </div>
    </section>
  )
}
