import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { HeroSlider } from '@/components/ssc/hero-slider'
import { TrustBar } from '@/components/ssc/trust-bar'
import { Programs } from '@/components/ssc/programs'
import { Differentiation } from '@/components/ssc/differentiation'
import { Testimonials } from '@/components/ssc/testimonials'
import { Facilities } from '@/components/ssc/facilities'
import { defaultFacilities } from '@/components/ssc/facilities-data'
import { Curriculum } from '@/components/ssc/curriculum'
import { Systems } from '@/components/ssc/systems'
import { Campus } from '@/components/ssc/campus'
import { Faq } from '@/components/ssc/faq'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { Footer } from '@/components/ssc/footer'
import { MobileCtaBar } from '@/components/ssc/mobile-cta-bar'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'
import { CAMPUS_CONFIG } from '@/lib/campus-config'
import BrainScience from '@/components/ssc/brain-science'
import ComparisonSection from '@/components/ssc/comparison-section'
import CommitmentSection from '@/components/ssc/commitment-section'
import { SpartaPulse } from '@/components/ssc/sparta-pulse'

export const metadata: Metadata = {
  title: 'SSC스파르타 충주 | 대치동·노량진 시스템 충주 직영 관리형 독학재수',
  description: '충주 계명대로에서 경험하는 서울권 압도적 관리 시스템. 철저한 출결 통제와 학습 분석으로 당신의 합격을 앞당깁니다.',
}

/** public/images/facility/{campus}/ 폴더에서 4-카드 시설 이미지 경로 목록을 읽어옵니다 */
function getFacilityImages(campus: string): string[] {
  const dir = path.join(process.cwd(), 'public', 'images', 'facility', campus)
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()
      .map((f) => `/images/facility/${campus}/${f}`)
  } catch {
    return []
  }
}

/** public/images/maincard/{campus}/ 폴더에서 이미지 경로 목록을 읽어옵니다 */
function getMaincardImages(campus: string): string[] {
  const dir = path.join(process.cwd(), 'public', 'images', 'maincard', campus)
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()
      .map((f) => `/images/maincard/${campus}/${f}`)
  } catch {
    return []
  }
}

const chungjuSlides = [
  {
    id: 1,
    image: '/images/campus-chungju.jpg',
    title: '대치동의 자료 그대로\n커넥츠프랩 수능관',
    subtitle: '서울 대치동 수준의 콘텐츠를 충주에서 — 거리의 차이는 없앴습니다',
    description: '수능 · 독학재수 · 전문자격 전 방향 커버',
    ctaLabel: '수능관 알아보기',
    ctaSecondaryLabel: '프로그램 둘러보기',
    programId: 'suneung',
  },
  {
    id: 2,
    image: '/images/campus-chungju.jpg',
    title: '충주 공무원 합격의 메카',
    subtitle: '독한 관리와 커넥츠프랩 시스템으로 매년 합격자를 배출합니다',
    description: '국가직 · 지방직 · 경찰 · 소방 · 군무원 전 직렬 커버',
    ctaLabel: '공무원 합격반 알아보기',
    programId: 'gongmuwon',
  },
  {
    id: 3,
    image: '/images/campus-chungju.jpg',
    title: '"스파르타는 임용생에게\n빛입니다"',
    subtitle: '충주스파르타 임용 합격생의 후기 — 의지 없어도 시스템이 잡아줍니다',
    description: '초등 · 중등 · 유아 임용 매년 합격자 배출',
    ctaLabel: '임용반 알아보기',
    programId: 'imyong',
  },
  {
    id: 4,
    image: '/images/campus-chungju.jpg',
    title: '세무사·노무사·기사시험\n4개월 단기합격의 비밀',
    subtitle: '교시제 시간표 + 코멘터 관리 — 전문자격도 관리가 결과를 만듭니다',
    description: '세무사 · 노무사 · 회계사 · 산업기사 · 각종 기사시험 전 방향 커버',
    ctaLabel: '전문자격반 알아보기',
    programId: 'professional',
  },
]

export default function ChungjuPage() {
  // maincard 폴더 이미지를 슬라이드 배경으로 적용 (폴더에 이미지가 있으면 순서대로 매핑)
  const maincardImages = getMaincardImages('chungju')
  const slides = chungjuSlides.map((slide, i) => ({
    ...slide,
    image: maincardImages[i] ?? slide.image,
  }))

  const facilityImages = getFacilityImages('chungju')
  const facilitiesWithImages = facilityImages.length > 0
    ? defaultFacilities.map((f, i) => ({ ...f, image: facilityImages[i] ?? f.image }))
    : undefined

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0">
      <ScrollRevealInit />
      <Navbar />
      <HeroSlider slides={slides} />
      <SpartaPulse />

      {/* 이달의 프로그램 테이저 → /chungju/programs 페이지로 이동 */}
      {/* 📁 프로그램 사진 위치: public/images/programs/chungju/ */}
      <section id="monthly-program" className="bg-background-subtle py-14 md:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-[24px] border border-black/5 bg-white p-8 shadow-sm"
          >
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold text-[#1D1D1F] tracking-tighter mb-2">
                이달의 프로그램
              </h2>
              <p className="text-[#86868B] text-sm md:text-base font-medium">
                매달 업데이트되는 충주 캠퍼스 합격 전략 프로그램
              </p>
            </div>
            <Link
              href="/chungju/programs"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#1D1D1F] text-white text-[15px] font-semibold hover:bg-black hover:scale-105 active:scale-95 transition-all whitespace-nowrap shadow-sm"
            >
              더 알아보기
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <TrustBar />

      {/* 1. Brain Science Section */}
      <BrainScience />

      <Programs location="충주" />
      <Differentiation />

      {/* 2. Comparison & Commenters Section */}
      <ComparisonSection />

      {/* TODO: 충주 합격후기 블로그 URL - 나중에 수정 필요 */}
      <Testimonials campusName="충주" reviewUrl="https://blog.naver.com/guy0701/224198180485" />

      {/* 내부시설 미리보기 (4-카드 그리드) + 더 알아보기 → /chungju/interior 페이지로 이동 */}
      {/* 📁 4-카드 사진 위치: public/images/facility/chungju/ (01~04 번호 순서대로) */}
      <Facilities facilities={facilitiesWithImages} />
      <div className="bg-background pb-16 flex justify-center -mt-8">
        <Link
          href="/chungju/interior"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-black/10 text-[15px] font-semibold text-[#1D1D1F] hover:bg-[#1D1D1F] hover:text-white hover:border-black transition-all"
        >
          내부시설 더 알아보기
          <ChevronRight size={16} />
        </Link>
      </div>

      <Curriculum />
      <Systems />
      <Campus filter="충주" />
      <Faq />

      {/* 3. Final Commitment Section */}
      <CommitmentSection />

      <CtaBanner phone={CAMPUS_CONFIG.chungju.phone} naverTalkUrl={CAMPUS_CONFIG.chungju.naverTalkUrl} naverMapUrl={CAMPUS_CONFIG.chungju.naverMapUrl} />
      <Footer />
      <MobileCtaBar phone={CAMPUS_CONFIG.chungju.phone} naverTalkUrl={CAMPUS_CONFIG.chungju.naverTalkUrl} />
    </main>
  )
}
