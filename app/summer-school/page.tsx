import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Target, Award, BookOpen } from 'lucide-react'
import { Navbar } from '@/components/ssc/navbar'
import { TrustBar } from '@/components/ssc/trust-bar'
import { Testimonials } from '@/components/ssc/testimonials'
import { Systems } from '@/components/ssc/systems'
import { Faq } from '@/components/ssc/faq'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { Footer } from '@/components/ssc/footer'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'
import { SpartaPulse } from '@/components/ssc/sparta-pulse'
import { summerContent } from '@/lib/summer-content'
import { RhythmicText } from '@/components/ui/rhythmic-text'

export const metadata: Metadata = {
  title: '2024/2025 썸머스쿨 | SSC스파르타',
  description: '초단기 몰입을 위한 프리미엄 썸머스쿨 관리 프로그램',
}

const featureIcons = [Target, BookOpen, Award]

export default function SummerSchoolPage() {
  return (
    <main className="overflow-x-hidden pb-16 md:pb-0 font-sans bg-[#F5F5F7]">
      <ScrollRevealInit />
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-[#F5F5F7] overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[0%] left-[50%] -translate-x-1/2 w-[100%] h-[100%] bg-gradient-to-b from-white/80 via-white/40 to-transparent blur-[100px] rounded-[100%]" />
          <div className="absolute bottom-[0%] right-[0%] w-[50%] h-[50%] bg-[#FF6B00]/05 blur-[120px] rounded-full" />
          <div className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-[#0071E3]/05 blur-[120px] rounded-full" />
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <p className="text-[#FF6B00] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            SSC SPARTA SUMMER SCHOOL
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-[#1D1D1F] mb-6 whitespace-pre-line leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <RhythmicText text={summerContent.hero.title} />
          </h1>
          <h2 className="text-xl md:text-2xl font-semibold text-[#434345] mb-4 whitespace-pre-line animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <RhythmicText text={summerContent.hero.subtitle} />
          </h2>
          <p className="text-base md:text-lg text-[#86868B] font-medium leading-relaxed whitespace-pre-line max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <RhythmicText text={summerContent.hero.description} />
          </p>
        </div>
      </section>

      <SpartaPulse />
      <TrustBar />

      {/* Features specific to Summer School */}
      <section className="bg-white py-20 md:py-28" style={{ backgroundColor: '#EEF2FF' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-12 text-center fade-in-up">
            <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 leading-tight">
              <RhythmicText text={summerContent.features.title} />
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {summerContent.features.items.map((f, i) => {
              const Icon = featureIcons[i % featureIcons.length]
              return (
                <div
                  key={f.title}
                  className="fade-in-up rounded-[24px] border border-black/5 bg-white p-8 flex flex-col gap-6 shadow-sm hover:shadow-md transition-shadow duration-300"
                >
                  <div className="w-14 h-14 rounded-full bg-[#0071E3]/10 flex items-center justify-center flex-shrink-0 text-[#0071E3]">
                    <Icon size={28} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#1D1D1F] tracking-tight mb-3">
                      <RhythmicText text={f.title} />
                    </h3>
                    <div className="text-[15px] font-medium text-[#434345] leading-relaxed break-keep">
                       <RhythmicText text={f.desc} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials testimonials={summerContent.testimonials} />

      {/* Systems */}
      <Systems systems={summerContent.systems} />

      {/* Campus Selector for Summer School */}
      <section className="bg-[#F5F5F7] py-24 md:py-32" id="campuses">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[#0071E3] text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4 fade-in-up">Campuses</p>
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-12 fade-in-up">
            가까운 썸머스쿨 캠퍼스 찾기
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['원주', '춘천', '충주'].map((campus) => {
              const id = campus === '원주' ? 'wonju' : campus === '춘천' ? 'chuncheon' : 'chungju';
              return (
                <Link 
                  key={campus} 
                  href={`/summer-school/${id}`}
                  className="fade-in-up group block p-8 rounded-[32px] bg-white border border-black/5 hover:bg-[#1D1D1F] transition-colors duration-500 text-left shadow-sm hover:shadow-xl"
                >
                  <h3 className="text-2xl font-bold text-[#1D1D1F] group-hover:text-white mb-2 transition-colors duration-500">
                    {campus} 캠퍼스
                  </h3>
                  <p className="text-[#86868B] group-hover:text-white/70 font-medium mb-8 transition-colors duration-500">
                    {campus}점 썸머스쿨 상세정보 보기
                  </p>
                  <div className="w-12 h-12 rounded-full bg-[#F5F5F7] group-hover:bg-[#0071E3] flex items-center justify-center text-[#1D1D1F] group-hover:text-white transition-all duration-500 shadow-sm">
                    <ChevronRight size={20} />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <Faq customFaqs={summerContent.faqs} />

      {/* CTA and Footer */}
      <CtaBanner phone="1588-0000" naverTalkUrl="#" naverMapUrl="#" />
      <Footer />
    </main>
  )
}
