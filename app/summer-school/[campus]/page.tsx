import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { TrustBar } from '@/components/ssc/trust-bar'
import { Testimonials } from '@/components/ssc/testimonials'
import { Systems } from '@/components/ssc/systems'
import { Campus } from '@/components/ssc/campus'
import { Faq } from '@/components/ssc/faq'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { MobileCtaBar } from '@/components/ssc/mobile-cta-bar'
import { Footer } from '@/components/ssc/footer'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'
import { SpartaPulse } from '@/components/ssc/sparta-pulse'
import { summerContent } from '@/lib/summer-content'
import { CAMPUS_CONFIG, CampusKey } from '@/lib/campus-config'
import { RhythmicText } from '@/components/ui/rhythmic-text'

interface Props {
  params: {
    campus: string
  }
}

export function generateMetadata({ params }: Props): Metadata {
  const campusKey = params.campus as CampusKey
  const config = CAMPUS_CONFIG[campusKey]
  
  if (!config) {
    return { title: 'Not Found' }
  }

  return {
    title: `${config.name} 썸머스쿨 | SSC스파르타`,
    description: `SSC스파르타 ${config.name} 캠퍼스의 프리미엄 썸머스쿨 프로그램입니다.`,
  }
}

export function generateStaticParams() {
  return [
    { campus: 'wonju' },
    { campus: 'chuncheon' },
    { campus: 'chungju' },
  ]
}

export default function CampusSummerSchoolPage({ params }: Props) {
  const campusKey = params.campus as CampusKey
  const config = CAMPUS_CONFIG[campusKey]

  if (!config) {
    notFound()
  }

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0 font-sans">
      <ScrollRevealInit />
      <Navbar />

      {/* Hero Section specific to campus */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-[#1D1D1F] overflow-hidden text-white">
        {/* Background glow for dark mode hero */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[0%] left-[50%] -translate-x-1/2 w-[100%] h-[100%] bg-gradient-to-b from-[#0071E3]/20 via-[#0071E3]/5 to-transparent blur-[100px] rounded-[100%]" />
          <div className="absolute bottom-[0%] right-[0%] w-[50%] h-[50%] bg-[#FF6B00]/10 blur-[120px] rounded-full" />
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {config.name} CAMPUS SUMMER SCHOOL
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-6 whitespace-pre-line leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <RhythmicText text={`${config.name} 썸머스쿨\n초격차 몰입 캠프`} />
          </h1>
          <h2 className="text-lg md:text-xl font-medium text-white/80 mb-8 whitespace-pre-line animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <RhythmicText text={`${config.name} 캠퍼스에서 경험하는 완벽한 통제와 관리`} />
          </h2>
          <Link 
            href="#cta"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#0071E3] text-white font-bold text-[15px] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#0071E3]/20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300"
          >
            상담 예약하기
            <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      <SpartaPulse />
      <TrustBar />

      {/* Testimonials */}
      <Testimonials 
        testimonials={summerContent.testimonials} 
        campusName={config.name}
      />

      {/* Systems */}
      <Systems systems={summerContent.systems} />

      {/* Campus Map & Facility */}
      <Campus filter={config.name} />

      {/* FAQ */}
      <Faq customFaqs={summerContent.faqs} />

      <CtaBanner 
        phone={config.phone} 
        naverTalkUrl={config.naverTalkUrl} 
        naverMapUrl={config.naverMapUrl} 
      />
      <Footer />
      <MobileCtaBar 
        phone={config.phone} 
        naverTalkUrl={config.naverTalkUrl} 
      />
    </main>
  )
}
