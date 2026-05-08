import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { MonthlyProgram } from '@/components/ssc/monthly-program'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { CAMPUS_CONFIG } from '@/lib/campus-config'
import { Footer } from '@/components/ssc/footer'
import { MobileCtaBar } from '@/components/ssc/mobile-cta-bar'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'

export default function ChuncheonProgramsPage() {
  return (
    <main className="overflow-x-hidden pb-16 md:pb-0">
      <ScrollRevealInit />
      <Navbar />

      {/* 페이지 헤더 */}
      <div className="pt-16 bg-navy">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <Link
            href="/chuncheon"
            className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-5 transition-colors"
          >
            <ChevronLeft size={16} />
            춘천 홈으로
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">이달의 프로그램</h1>
          <p className="text-white/70 text-base">매달 업데이트되는 춘천 캠퍼스 합격 전략 프로그램</p>
        </div>
      </div>

      {/* 프로그램 이미지 (사진 없으면 준비 중 메시지 표시) */}
      {/* 📁 사진 위치: public/images/programs/chuncheon/ */}
      <MonthlyProgram campus="chuncheon" title="이달의 프로그램" showEmpty />

      <CtaBanner naverMapUrl={CAMPUS_CONFIG.chuncheon.naverMapUrl} />
      <Footer />
      <MobileCtaBar />
    </main>
  )
}
