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

/** 폴더에서 첫 번째 이미지 경로를 반환. 없으면 null. */
function getFirstImage(campus: string): string | null {
  const dir = path.join(process.cwd(), 'public', 'images', 'main', campus)
  try {
    const files = fs.readdirSync(dir)
    const first = files
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()[0]
    return first ? `/images/main/${campus}/${first}` : null
  } catch {
    return null
  }
}

const locations = [
  {
    id: 'wonju',
    name: '원주',
    href: '/wonju',
    tagline: '원주 유일 공단기/커넥츠프랩 파트너',
    highlights: [
      '데이터 기반 1:1 학습 전략 & 성적 관리',
      '단기합격을 위한 스파르타식 타임테이블',
    ],
    address: '원주시 치악로 1793 농협건물 4층',
    color: '#F5F5F7',
  },
  {
    id: 'chuncheon',
    name: '춘천',
    href: '/chuncheon',
    tagline: '임용고시 최상위 합격의 산실',
    highlights: [
      '순공 10시간을 맹세하는 교시제 시스템',
      '합격생들이 증명하는 압도적 면학 분위기',
    ],
    address: '춘천시 퇴계로 249 5층',
    color: '#F5F5F7',
  },
  {
    id: 'chungju',
    name: '충주',
    href: '/chungju',
    tagline: '노량진 시스템 충주 직영',
    highlights: [
      '대치동 현강 자료·모의고사 완벽 도입',
      '풀타임 상주 코치의 철저한 수면·출결 통제',
    ],
    address: '충주시 계명대로 283',
    color: '#F5F5F7',
  },
]

const programs = ['공무원', '임용고시', '전문자격', '독학재수']

export default function SelectLocation() {
  const images = Object.fromEntries(
    locations.map((loc) => [loc.id, getFirstImage(loc.id)])
  )

  return (
    <main className="relative min-h-screen bg-[#F5F5F7] flex flex-col font-sans overflow-hidden text-[#1D1D1F] selection:bg-black/10 selection:text-black transition-colors duration-500">
      
      {/* Background Soft Glow (Clean Apple Light) */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[0%] left-[50%] -translate-x-1/2 w-[80%] h-[30%] bg-white/60 blur-[100px] rounded-[100%]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header Section */}
        <header className="pt-28 pb-14 px-4 text-center">
          <BlurFade delay={0.1} yOffset={20}>
            <p className="text-[#86868B] text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase mb-4">
              Supreme Spartan Control
            </p>
          </BlurFade>
          
          <BlurFade delay={0.2} yOffset={20}>
            <h1 className="text-[#1D1D1F] text-[2.5rem] sm:text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tighter mb-6" style={{ wordBreak: 'keep-all' }}>
              완벽한 통제,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1D1D1F] via-[#434345] to-[#86868B]">
                그 이상의 결과.
              </span>
            </h1>
          </BlurFade>
          
          <BlurFade delay={0.3} yOffset={20}>
            <p className="text-[#86868B] text-sm sm:text-base md:text-xl font-medium max-w-2xl mx-auto leading-relaxed tracking-tight">
              가장 본질적인 것에 집중하십시오.<br className="hidden sm:block"/> 
              압도적인 집중 환경과 노량진 시스템이 당신의 단기 합격을 증명합니다.
            </p>
          </BlurFade>
        </header>

        {/* Categories badge strip */}
        <div className="px-4 mb-20 md:mb-24">
          <BlurFade delay={0.4} yOffset={10}>
            <div className="max-w-2xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-4">
              {programs.map((p) => (
                <div
                  key={p}
                  className="px-5 py-2 rounded-full text-[11px] sm:text-xs font-semibold uppercase tracking-widest border border-black/[0.05] bg-white text-[#1D1D1F] shadow-sm hover:shadow-md hover:-translate-y-[1px] transition-all duration-300 cursor-default"
                >
                  {p}
                </div>
              ))}
            </div>
          </BlurFade>
        </div>

        {/* 1. Brain Science Section (Foundational Logic) */}
        <BrainScience />

        {/* Location cards - 3 items centered */}
        <div className="flex-1 px-4 py-28">
          <div className="max-w-[64rem] mx-auto text-center mb-16">
            <BlurFade delay={0.1}>
              <p className="text-[#0071E3] text-[10px] font-bold tracking-[0.2em] uppercase mb-4">Campuses</p>
              <h2 className="text-[#1D1D1F] text-3xl md:text-5xl font-semibold tracking-tighter">당신의 단기합격을 증명할 장소</h2>
            </BlurFade>
          </div>
          <div className="max-w-[54rem] mx-auto flex flex-col md:flex-row gap-6 md:gap-8 justify-center">
            {locations.map((loc, idx) => {
              const image = images[loc.id]
              return (
                <BlurFade key={loc.id} delay={0.5 + idx * 0.15} yOffset={30} className="w-full">
                  <Link href={loc.href} className="block outline-none w-full">
                    <TiltCard>
                      <div className="group relative rounded-[24px] overflow-hidden min-h-[360px] md:min-h-[460px] flex flex-col justify-between bg-white border border-black/[0.04]">
                        
                        {/* Image Header Area in Card */}
                        <div className="h-[45%] md:h-[50%] relative overflow-hidden bg-[#F5F5F7] border-b border-black/[0.03]">
                          {image && (
                            <Image
                              src={image}
                              alt={`${loc.name} 캠퍼스`}
                              fill
                              className="object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-[1.05]"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent opacity-80" />
                        </div>

                        {/* Content Area */}
                        <div className="flex flex-col flex-1 p-6 relative z-10 bg-white">
                          <div className="flex items-start justify-between gap-2 mb-4">
                            <div>
                              <p className="text-[#86868B] text-[10px] font-bold tracking-[0.2em] uppercase mb-1">
                                {loc.id} CAMPUS
                              </p>
                              <h2 className="text-[#1D1D1F] text-2xl sm:text-3xl font-semibold tracking-tighter mb-1">{loc.name}</h2>
                              <p className="font-medium text-xs sm:text-sm text-[#434345] tracking-tight">{loc.tagline}</p>
                            </div>
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-[#F5F5F7] text-[#1D1D1F] group-hover:bg-black group-hover:text-white transition-all duration-300 ease-out shadow-sm group-hover:shadow-md">
                              <ChevronRight size={18} />
                            </div>
                          </div>

                          <ul className="space-y-2 mt-auto mb-4">
                            {loc.highlights.map((h, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-[#86868B] mt-[2px] text-[10px]">✦</span>
                                <span className="text-[#434345] text-xs sm:text-sm font-medium tracking-tight leading-snug">{h}</span>
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

        {/* Footer note */}
        <div className="text-center pb-12 px-4 relative z-10">
          <p className="text-[#86868B] text-[10px] font-semibold tracking-[0.2em] uppercase">
            SSC스파르타 · 033-766-7999
          </p>
        </div>
      </div>
    </main>
  )
}
