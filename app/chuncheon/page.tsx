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
  title: 'SSC스파르타 춘천 | 교원 임용 및 수능 단기 합격의 요람',
  description: '춘천 퇴계동 최고의 면학 분위기. 0교시 단어시험부터 심야 자습까지, 합격을 위한 가장 완벽한 1년을 설계합니다.',
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

const chuncheonSlides = [
  {
    id: 1,
    image: '/images/campus-chuncheon.jpg',
    title: '임용합격생의 추천으로\n이어지는 합격',
    subtitle: '매년 배출되는 합격자들이\n다음 수험생을 이끌어 갑니다.',
    description: '초등 · 중등 · 유아 임용\n춘천스파르타에서 시작하세요.',
    ctaLabel: '임용반 알아보기',
    ctaSecondaryLabel: '프로그램 둘러보기',
    programId: 'imyong',
  },
  {
    id: 2,
    image: '/images/campus-chuncheon.jpg',
    title: '공무원 합격을 묻는다면?\n춘천스파르타',
    subtitle: '혼자서는 무너집니다.\n관리받는 사람이 합격합니다.',
    description: '국가직 · 지방직 · 경찰 · 소방 · 군무원\n전 직렬 완벽 커버 시스템',
    ctaLabel: '공무원 합격반 알아보기',
    programId: 'gongmuwon',
  },
  {
    id: 3,
    image: '/images/campus-chuncheon.jpg',
    title: '세무사·노무사·기사시험\n4개월 단기합격의 비밀',
    subtitle: '교시제 시간표 + 코멘터 관리\n전문자격도 관리가 결과를 만듭니다.',
    description: '세무사 · 노무사 · 회계사 · 산업기사 · 기사시험\n전 직렬 관리 시스템',
    ctaLabel: '전문자격반 알아보기',
    programId: 'professional',
  },
  {
    id: 4,
    image: '/images/campus-chuncheon.jpg',
    title: '합리적 프리미엄 독학재수',
    subtitle: '생활 리듬이 무너지면 강의도 소용없습니다.\n관리가 먼저입니다.',
    description: '불필요한 실강 비용을 덜어내고\n진짜 필요한 관리에만 집중합니다.',
    ctaLabel: '프리미엄 독학재수 알아보기',
    programId: 'suneung',
  },
]

export default function ChuncheonPage() {
  // maincard 폴더 이미지를 슬라이드 배경으로 적용 (폴더에 이미지가 있으면 순서대로 매핑)
  const maincardImages = getMaincardImages('chuncheon')
  const slides = chuncheonSlides.map((slide, i) => ({
    ...slide,
    image: maincardImages[i] ?? slide.image,
  }))

  const facilityImages = getFacilityImages('chuncheon')
  const facilitiesWithImages = facilityImages.length > 0
    ? defaultFacilities.map((f, i) => ({ ...f, image: facilityImages[i] ?? f.image }))
    : undefined

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0">
      <ScrollRevealInit />
      <Navbar />
      <HeroSlider slides={slides} />
      <SpartaPulse />

      {/* 이달의 프로그램 테이저 → /chuncheon/programs 페이지로 이동 */}
      {/* 📁 프로그램 사진 위치: public/images/programs/chuncheon/ */}
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
                매달 업데이트되는 춘천 캠퍼스 합격 전략 프로그램
              </p>
            </div>
            <Link
              href="/chuncheon/programs"
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

      <Programs location="춘천" />
      <Differentiation />

      {/* 2. Comparison & Commenters Section */}
      <ComparisonSection />

      {/* TODO: 춘천 합격후기 블로그 URL - 나중에 수정 필요 */}
      <Testimonials campusName="춘천" reviewUrl="https://blog.naver.com/guy0701/224198180485" />

      {/* 내부시설 미리보기 (4-카드 그리드) + 더 알아보기 → /chuncheon/interior 페이지로 이동 */}
      {/* 📁 4-카드 사진 위치: public/images/facility/chuncheon/ (01~04 번호 순서대로) */}
      <Facilities facilities={facilitiesWithImages} />
      <div className="bg-background pb-16 flex justify-center -mt-8">
        <Link
          href="/chuncheon/interior"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-black/10 text-[15px] font-semibold text-[#1D1D1F] hover:bg-[#1D1D1F] hover:text-white hover:border-black transition-all"
        >
          내부시설 더 알아보기
          <ChevronRight size={16} />
        </Link>
      </div>

      <Systems />
      <Campus filter="춘천" />
      <Faq />

      {/* 3. Final Commitment Section */}
      <CommitmentSection />

      <CtaBanner phone={CAMPUS_CONFIG.chuncheon.phone} naverTalkUrl={CAMPUS_CONFIG.chuncheon.naverTalkUrl} naverMapUrl={CAMPUS_CONFIG.chuncheon.naverMapUrl} />
      <Footer />
      <MobileCtaBar phone={CAMPUS_CONFIG.chuncheon.phone} naverTalkUrl={CAMPUS_CONFIG.chuncheon.naverTalkUrl} />
    </main>
  )
}
