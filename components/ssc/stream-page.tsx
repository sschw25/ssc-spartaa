import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { Facilities } from '@/components/ssc/facilities'
import { defaultFacilities } from '@/components/ssc/facilities-data'
import { Testimonials } from '@/components/ssc/testimonials'
import { Systems } from '@/components/ssc/systems'
import { Faq } from '@/components/ssc/faq'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { Footer } from '@/components/ssc/footer'
import { FloatingActionButton } from '@/components/ssc/floating-action-button'
import { StickySubNav } from '@/components/ssc/sticky-sub-nav'
import { AvailabilityBadge } from '@/components/ssc/availability-badge'
import { AnimatedStats } from '@/components/ssc/animated-stats'
import { TimelineView } from '@/components/ssc/timeline-view'
import { DirectorMessage } from '@/components/ssc/director-message'
import { RulesViewer } from '@/components/ssc/rules-viewer'
import { FacilityComparison } from '@/components/ssc/facility-comparison'
import { BeforeAfterSwipe } from '@/components/ssc/before-after-swipe'
import { streamContents, StreamId } from '@/lib/stream-content'
import { CAMPUS_CONFIG } from '@/lib/campus-config'
import { RhythmicText } from '@/components/ui/rhythmic-text'
import BlurFade from '@/components/ui/blur-fade'

export default function StreamPage({
  campus,
  stream,
}: {
  campus: 'wonju' | 'chuncheon' | 'chungju'
  stream: StreamId
}) {
  const content = streamContents[stream]
  const config = CAMPUS_CONFIG[campus]

  if (!content) return <div>페이지를 찾을 수 없습니다.</div>

  const campusName = campus === 'wonju' ? '원주' : campus === 'chuncheon' ? '춘천' : '충주'

  // Dynamic image fetching for facilities (matching by numbered indices 01, 02...)
  const facilityDir = path.join(process.cwd(), 'public', 'images', 'facility', campus)
  const interiorDir = path.join(process.cwd(), 'public', 'images', 'interior', campus)
  
  // Use a map to store images by their number (01 -> id 1, etc.)
  const imageMap: Record<number, string> = {}
  
  const processDir = (dir: string, webPath: string) => {
    try {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir)
          .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
          .forEach((f) => {
            const numMatch = f.match(/^(\d+)/)
            if (numMatch) {
              const num = parseInt(numMatch[1], 10)
              // Store if not already exists (priority: interior comes first in the call order)
              if (!imageMap[num]) {
                imageMap[num] = `${webPath}/${f}`
              }
            }
          })
      }
    } catch (e) {}
  }

  // Priority order: check facility first, then interior (so facility images take precedence)
  processDir(facilityDir, `/images/facility/${campus}`)
  processDir(interiorDir, `/images/interior/${campus}`)

  const facilitiesWithImages = defaultFacilities.map((f) => ({
    ...f,
    image: imageMap[f.id] ?? f.image
  }))

  const getReviewUrl = (campus: string, streamId: string) => {
    if (campus === 'wonju') {
      return streamId === 'gongmuwon' 
        ? 'https://blog.naver.com/guy0701/224198155260' 
        : 'https://blog.naver.com/guy0701/224198170681'
    }
    return 'https://blog.naver.com/guy0701'
  }

  const reviewUrl = getReviewUrl(campus, stream)
  const bgImage = facilitiesWithImages.length > 0 ? facilitiesWithImages[0].image : undefined

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0 bg-[#F5F5F7]">
      <Navbar />

      {/* Stream Specific Hero (Apple Light Aesthetic) */}
      <section id="hero" className="relative pt-24 pb-14 px-4 sm:px-6 bg-[#F5F5F7] min-h-[400px] flex items-center justify-center border-b border-black/[0.03]">
        <div className="max-w-[64rem] w-full mx-auto text-center">
          <BlurFade delay={0.1} yOffset={20}>
            <Link 
              href={`/${campus}`} 
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white border border-black/5 text-[#86868B] text-xs font-semibold uppercase tracking-widest hover:bg-black/5 hover:text-black transition-all mb-8 shadow-sm"
            >
              <ArrowLeft size={14} /> Back to {campusName} Campus
            </Link>
          </BlurFade>

          <BlurFade delay={0.2} yOffset={20}>
            <AvailabilityBadge campusName={config.name} />
            <div className="mb-6">
              {stream === 'gongmuwon' ? (
                <div className="inline-flex items-center gap-3">
                  <span className="text-sm md:text-base font-black tracking-tighter text-[#1D1D1F]">SSC 스파르타</span>
                  <span className="text-xs font-light text-[#86868B] opacity-40">X</span>
                  <span className="text-sm md:text-base font-black tracking-tight text-[#0071E3]">커넥츠프랩</span>
                </div>
              ) : (
                <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase">
                  SSC SPARTA {content.name}
                </p>
              )}
            </div>
          </BlurFade>
          
          <BlurFade delay={0.3} yOffset={20}>
            <h1 
              className="main-title mb-8 text-balance drop-shadow-sm"
            >
              <RhythmicText text={content.hero.title} />
            </h1>
          </BlurFade>

          <BlurFade delay={0.4} yOffset={20}>
            <div 
              className="text-[#434345] font-medium tracking-tight mb-6 text-balance"
              style={{ fontSize: 'var(--font-size-body-lg)' }}
            >
              <RhythmicText text={content.hero.subtitle} />
            </div>
          </BlurFade>

          {content.hero.description && (
            <BlurFade delay={0.5} yOffset={20}>
               <div className="text-[#86868B] text-sm sm:text-base max-w-2xl mx-auto leading-relaxed font-medium tracking-tight">
                <RhythmicText text={content.hero.description} />
               </div>
            </BlurFade>
          )}

          <BlurFade delay={0.6} yOffset={20}>
            <div className="mt-12">
               <a 
                 href="#cta" 
                 className="inline-flex items-center rounded-full bg-[#1D1D1F] text-white font-semibold hover:bg-black hover:scale-105 active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,0,0,0.15)] btn-fluid"
               >
                 상담 예약하기
               </a>
            </div>
          </BlurFade>
        </div>
      </section>

      <StickySubNav />

      {/* Stats Section */}
      <AnimatedStats />

      {/* Shared Components */}
      <div id="testimonials">
        <Testimonials campusName={campusName} testimonials={content.testimonials} reviewUrl={reviewUrl} bgImage={bgImage} />
      </div>
      
      <TimelineView />
      
      <div id="comparison">
        <BeforeAfterSwipe />
      </div>

      <div id="director">
        <DirectorMessage />
      </div>

      <div id="systems">
        <Systems systems={content.systems} />
      </div>

      <div id="rules">
        <RulesViewer />
      </div>

      <div id="facilities">
        <Facilities facilities={facilitiesWithImages} />
      </div>

      <div id="chairs">
        <FacilityComparison />
      </div>

      {/* Stream Specific FAQ Injection */}
      <div id="faq">
        <Faq customFaqs={content.faqs} />
      </div>

      <FloatingActionButton />
      <CtaBanner phone={config.phone} naverTalkUrl={config.naverTalkUrl} naverMapUrl={config.naverMapUrl} />
      <Footer />
    </main>
  )
}
