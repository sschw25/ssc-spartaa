import fs from 'fs'
import path from 'path'
import { Sparkles } from 'lucide-react'
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
import { StreamStructuredData } from '@/components/ssc/seo-structured-data'
import GongmuwonCards from '@/components/ssc/gongmuwon-cards'
import { ExamInfo2026 } from '@/components/ssc/exam-info-2026'
import { StreamDataViz } from '@/components/ssc/stream-data-viz'
import { WorrySolution } from '@/components/ssc/worry-solution'
import { ManagementShowcase } from '@/components/ssc/management-showcase'
import { StreamRoadmap } from '@/components/ssc/stream-roadmap'

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
    } catch {}
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
    <main className="stream-tone overflow-x-hidden pb-16 md:pb-0 bg-[#F8F9FA] text-[#1D1D1F]">
      <StreamStructuredData
        campus={campus}
        stream={stream}
        streamName={content.name}
        description={content.hero.description?.replaceAll('{{region}}', campusName) || ''}
        faqs={content.faqs}
      />

      {/* Stream Hero (면접 페이지 디자인 정렬) */}
      <section id="hero" className="bg-white py-16 md:py-24 border-b border-[#E5E7EB]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <BlurFade delay={0.1} yOffset={20}>
            <div className="flex items-center justify-center mb-6">
              <AvailabilityBadge campusName={config.name} />
            </div>
          </BlurFade>

          <BlurFade delay={0.2} yOffset={20}>
            <div className="mb-6">
              {stream === 'gongmuwon' ? (
                <div className="inline-flex items-center gap-3">
                  <span className="text-sm md:text-base font-semibold tracking-tighter text-[#1D1D1F]">SSC 스파르타</span>
                  <span className="text-xs font-light text-[#86868B] opacity-40">X</span>
                  <span className="text-sm md:text-base font-semibold tracking-tight text-[#007AFF]">커넥츠프랩</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#007AFF] text-xs font-semibold uppercase tracking-wider">
                  <Sparkles size={12} />
                  SSC SPARTA {content.name}
                </div>
              )}
            </div>
          </BlurFade>

          <BlurFade delay={0.3} yOffset={20}>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-[#1D1D1F] leading-tight mb-6 text-balance break-keep">
              <RhythmicText text={content.hero.title.replaceAll('{{region}}', campusName)} />
            </h1>
          </BlurFade>

          <BlurFade delay={0.4} yOffset={20}>
            <div className="text-base md:text-lg text-[#86868B] max-w-2xl mx-auto leading-relaxed mb-6 text-balance break-keep">
              <RhythmicText text={content.hero.subtitle.replaceAll('{{region}}', campusName)} />
            </div>
          </BlurFade>

          {content.hero.description && (
            <BlurFade delay={0.5} yOffset={20}>
              <div className="text-sm text-[#86868B] max-w-2xl mx-auto leading-relaxed break-keep">
                <RhythmicText text={content.hero.description.replaceAll('{{region}}', campusName)} />
              </div>
            </BlurFade>
          )}

          <BlurFade delay={0.6} yOffset={20}>
            <div className="mt-10">
              <a
                href="#cta"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#007AFF] text-white font-semibold hover:bg-blue-700 hover:scale-102 active:scale-98 transition-all shadow-md shadow-blue-500/10"
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

      {/* Gongmuwon Specific Strengths Cards */}
      {stream === 'gongmuwon' && <GongmuwonCards campusName={campusName} />}

      {/* 직렬 특화 섹션 (경찰·소방): 2026 시험정보 → 걱정/해결 → 학습관리 프로그램 */}
      {content.examInfo && (
        <ExamInfo2026
          data={{
            ...content.examInfo,
            title: content.examInfo.title.replaceAll('{{region}}', campusName),
            subtitle: content.examInfo.subtitle.replaceAll('{{region}}', campusName),
          }}
        />
      )}
      {content.viz && (
        <StreamDataViz
          data={{
            ...content.viz,
            title: content.viz.title.replaceAll('{{region}}', campusName),
            subtitle: content.viz.subtitle.replaceAll('{{region}}', campusName),
          }}
        />
      )}
      {content.worries && (
        <WorrySolution
          data={{
            ...content.worries,
            title: content.worries.title.replaceAll('{{region}}', campusName),
            subtitle: content.worries.subtitle.replaceAll('{{region}}', campusName),
          }}
        />
      )}
      {content.management && (
        <ManagementShowcase
          data={{
            ...content.management,
            title: content.management.title.replaceAll('{{region}}', campusName),
            subtitle: content.management.subtitle.replaceAll('{{region}}', campusName),
          }}
        />
      )}

      {/* 1년 학습 로드맵 (모든 직렬 — 있을 때만) */}
      {content.roadmap && (
        <StreamRoadmap
          data={{
            ...content.roadmap,
            title: content.roadmap.title.replaceAll('{{region}}', campusName),
            subtitle: content.roadmap.subtitle.replaceAll('{{region}}', campusName),
          }}
        />
      )}

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
