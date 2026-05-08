import fs from 'fs'
import path from 'path'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { Facilities } from '@/components/ssc/facilities'
import { defaultFacilities } from '@/components/ssc/facilities-data'
import { InteriorFacilities } from '@/components/ssc/interior-facilities'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { CAMPUS_CONFIG } from '@/lib/campus-config'
import { Footer } from '@/components/ssc/footer'
import { MobileCtaBar } from '@/components/ssc/mobile-cta-bar'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'

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

export default function ChungjuInteriorPage() {
  const facilityImages = getFacilityImages('chungju')
  const facilitiesWithImages = facilityImages.length > 0
    ? defaultFacilities.map((f, i) => ({ ...f, image: facilityImages[i] ?? f.image }))
    : undefined

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0">
      <ScrollRevealInit />
      <Navbar />

      {/* 페이지 헤더 */}
      <div className="pt-16 bg-navy">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <Link
            href="/chungju"
            className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-5 transition-colors"
          >
            <ChevronLeft size={16} />
            충주 홈으로
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">내부시설</h1>
          <p className="text-white/70 text-base">공부가 유지될 수밖에 없는 구조</p>
        </div>
      </div>

      {/* 시설 4-카드 그리드 (사진 없어도 항상 표시) */}
      {/* 📁 4-카드 사진 위치: public/images/facility/chungju/ (01~04 번호 순서대로) */}
      <Facilities facilities={facilitiesWithImages} />

      {/* 실내 사진 갤러리 (사진 넣으면 자동 표시) */}
      {/* 📁 사진 위치: public/images/interior/chungju/ */}
      <InteriorFacilities campus="chungju" />

      <CtaBanner naverMapUrl={CAMPUS_CONFIG.chungju.naverMapUrl} />
      <Footer />
      <MobileCtaBar />
    </main>
  )
}
