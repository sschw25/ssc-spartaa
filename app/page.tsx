import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, MapPin } from 'lucide-react'
import BlurFade from '@/components/ui/blur-fade'
import TiltCard from '@/components/ui/tilt-card'
import BrainScience from '@/components/ssc/brain-science'
import ComparisonSection from '@/components/ssc/comparison-section'
import CommitmentSection from '@/components/ssc/commitment-section'
import { SpartaPulse } from '@/components/ssc/sparta-pulse'
import { Footer } from '@/components/ssc/footer'
import { RhythmicText } from '@/components/ui/rhythmic-text'

const locations = [
  {
    id: 'wonju',
    name: '원주',
    href: '/wonju',
    tagline: '원주 유일\n공단기/커넥츠프랩 파트너',
    highlights: [
      '데이터 기반 1:1 학습 전략 &\n정밀한 성적 관리 시스템',
      '단기합격을 위한\n스파르타식 타임테이블',
    ],
    address: '원주시 치악로 1793 농협건물 4층',
    color: '#F5F5F7',
  },
  {
    id: 'chuncheon',
    name: '춘천',
    href: '/chuncheon',
    tagline: '임용고시\n최상위 합격의 산실',
    highlights: [
      '순공 10시간을 맹세하는\n철저한 교시제 시스템',
      '합격생들이 증명하는\n압도적인 면학 분위기',
    ],
    address: '춘천시 퇴계로 249 5층',
    color: '#F5F5F7',
  },
  {
    id: 'chungju',
    name: '충주',
    href: '/chungju',
    tagline: '노량진 시스템\n충주 직영 학습센터',
    highlights: [
      '대치동 현강 자료와\n프리미엄 모의고사 완벽 도입',
      '풀타임 상주 코치의\n철저한 수면 및 출결 통제',
    ],
    address: '충주시 계명대로 283',
    color: '#F5F5F7',
  },
]

const programs = ['공무원', '임용고시', '전문자격', '독학재수']

import { CAMPUS_CONFIG } from '@/lib/campus-config'

export default function SelectLocation() {
  const images: Record<string, string> = {
    wonju: CAMPUS_CONFIG.wonju.image,
    chuncheon: CAMPUS_CONFIG.chuncheon.image,
    chungju: CAMPUS_CONFIG.chungju.image,
  }

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] flex flex-col font-sans overflow-hidden text-[#1D1D1F] selection:bg-black/10 selection:text-black transition-colors duration-500">
      
      {/* Background Soft Glow (Clean Apple Light) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[0%] left-[50%] -translate-x-1/2 w-[100%] h-[40%] bg-gradient-to-b from-white/80 via-white/40 to-transparent blur-[120px] rounded-[100%]" />
        <div className="absolute bottom-[10%] right-[0%] w-[50%] h-[30%] bg-[#0071E3]/05 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header Section */}
        <header className="pt-16 md:pt-24 pb-20 px-6 text-center max-w-5xl mx-auto">
          <BlurFade delay={0.1} yOffset={20}>
            <p className="text-[#86868B] text-[10px] sm:text-xs font-bold tracking-[0.4em] uppercase mb-6 opacity-80">
              Supreme Spartan Control
            </p>
          </BlurFade>
          
          <BlurFade delay={0.2} yOffset={20}>
            <h1 className="main-title mb-8">
              <RhythmicText 
                text={"완벽한 통제,\n그 이상의 결과."}
                className="inline-block"
              />
            </h1>
          </BlurFade>
          
          <BlurFade delay={0.3} yOffset={20}>
            <div className="text-[#434345] text-base sm:text-lg md:text-2xl font-medium max-w-3xl mx-auto leading-relaxed tracking-tight text-balance">
              <RhythmicText 
                text={"가장 본질적인 것에 집중하십시오.\n압도적인 집중 환경과 노량진 시스템이\n당신의 단기 합격을 증명합니다."}
              />
            </div>
          </BlurFade>
        </header>

        {/* Categories badge strip */}
        <div id="programs" className="scroll-mt-32 px-4 mb-20 md:mb-24">
          <BlurFade delay={0.4} yOffset={10}>
            <div className="max-w-2xl mx-auto grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-3 sm:gap-4">
              {programs.map((p) => (
                <div
                  key={p}
                  className="px-5 py-3.5 sm:py-2 rounded-2xl sm:rounded-full text-[11px] sm:text-xs font-bold sm:font-semibold uppercase tracking-widest border border-black/[0.05] bg-white text-[#1D1D1F] shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-300 cursor-default flex items-center justify-center text-center"
                >
                  {p}
                </div>
              ))}
            </div>
          </BlurFade>
        </div>

        {/* Real-time Sparta Pulse Timer (High Urgency) */}
        <BlurFade delay={0.45}>
          <SpartaPulse />
        </BlurFade>

        {/* 1. Brain Science Section (Foundational Logic) */}
        <BrainScience />

        {/* Location cards - 3 items centered */}
        <div id="campuses" className="flex-1 px-6 py-32 md:py-48 bg-white/30 scroll-mt-32">
          <div className="max-w-[72rem] mx-auto text-center mb-20 md:mb-24">
            <BlurFade delay={0.1}>
              <p className="text-[#0071E3] text-[11px] font-extrabold tracking-[0.25em] uppercase mb-5">Campuses</p>
              <h2 className="text-[#1D1D1F] text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-balance">당신의 단기합격을 증명할 장소</h2>
            </BlurFade>
          </div>
          <div className="max-w-[64rem] mx-auto flex flex-col md:flex-row gap-8 md:gap-10 justify-center">
            {locations.map((loc, idx) => {
              const image = images[loc.id]
              return (
                <BlurFade key={loc.id} delay={0.5 + idx * 0.15} yOffset={30} className="w-full">
                  <Link href={loc.href} className="block outline-none w-full">
                    <TiltCard>
                      <div className="group relative rounded-[32px] overflow-hidden min-h-[400px] md:min-h-[500px] flex flex-col justify-between bg-white border border-black/[0.03] shadow-premium hover:shadow-premium-hover transition-all duration-500 ease-out">
                        
                        {/* Image Header Area in Card */}
                        <div className="h-[200px] md:h-[250px] relative overflow-hidden bg-[#F5F5F7]">
                          {image && (
                            <Image
                              src={image}
                              alt={`${loc.name} 캠퍼스`}
                              fill
                              className="object-cover transition-transform duration-[2s] ease-out group-hover:scale-[1.08]"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent opacity-90" />
                        </div>

                        {/* Content Area */}
                        <div className="flex flex-col flex-1 p-8 md:p-10 relative z-10 bg-white">
                          <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                              <p className="text-[#86868B] text-[10px] font-bold tracking-[0.25em] uppercase mb-2">
                                {loc.id} CAMPUS
                              </p>
                              <h2 className="text-[#1D1D1F] text-3xl md:text-4xl font-bold tracking-tighter mb-2">{loc.name}</h2>
                              <p className="font-semibold text-xs sm:text-sm text-[#434345] tracking-tight whitespace-pre-line leading-relaxed">{loc.tagline}</p>
                            </div>
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-[#F5F5F7] text-[#1D1D1F] group-hover:bg-[#0071E3] group-hover:text-white transition-all duration-500 ease-out shadow-sm group-hover:shadow-lg group-hover:-translate-y-1">
                              <ChevronRight size={20} />
                            </div>
                          </div>

                          <ul className="space-y-2 mt-auto mb-4">
                            {loc.highlights.map((h, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-[#86868B] mt-[2px] text-[10px]">✦</span>
                                <div className="text-[#434345] text-xs sm:text-sm font-medium tracking-tight leading-snug">
                                  <RhythmicText text={h} />
                                </div>
                              </li>
                            ))}
                          </ul>

                          <div className="flex items-center gap-1.5 pt-4 border-t border-black/[0.05]">
                            <MapPin size={12} className="text-[#86868B] flex-shrink-0" />
                            <span className="text-[#86868B] text-[10px] sm:text-[11px] tracking-wide">{loc.address}</span>
                          </div>
                        </div>
                        
                      </div>
                    </TiltCard>
                  </Link>
                </BlurFade>
              )
            })}
          </div>
        </div>

        {/* 2. Comparison & Commenters Section */}
        <ComparisonSection />

        {/* 3. Final Commitment Section */}
        <CommitmentSection />

        <Footer />
      </div>
    </main>
  )
}
