'use client'

import { ChevronRight, Target, BookOpen, Award, CheckCircle2, Calendar, Users, MapPin, Check } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/ssc/navbar'
import { TrustBar } from '@/components/ssc/trust-bar'
import { Testimonials } from '@/components/ssc/testimonials'
import { Faq } from '@/components/ssc/faq'
import { CtaBanner } from '@/components/ssc/cta-banner'
import { MobileCtaBar } from '@/components/ssc/mobile-cta-bar'
import { Footer } from '@/components/ssc/footer'
import { ScrollRevealInit } from '@/components/ssc/scroll-reveal-init'
import { SpartaPulse } from '@/components/ssc/sparta-pulse'
import { campusSummerContent } from '@/lib/summer-content'
import { CAMPUS_CONFIG, CampusKey } from '@/lib/campus-config'
import { RhythmicText } from '@/components/ui/rhythmic-text'
import { TimelineView } from '@/components/ssc/timeline-view'
import { Campus } from '@/components/ssc/campus'
import { notFound } from 'next/navigation'

interface Props {
  campusKey: CampusKey
}

export function CampusSummerPage({ campusKey }: Props) {
  const config = CAMPUS_CONFIG[campusKey]
  const summerContent = campusSummerContent[campusKey]
  
  if (!config || !summerContent) {
    notFound()
  }

  const reservationUrl = summerContent.reservationUrl
  const pricingInfo = summerContent.pricing.tuition

  return (
    <main className="overflow-x-hidden pb-16 md:pb-0 font-sans">
      <ScrollRevealInit />
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-[#1D1D1F] overflow-hidden text-white">
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
            <RhythmicText text={summerContent.hero.description} />
          </h2>
          <Link 
            href={reservationUrl}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#0071E3] text-white font-bold text-[15px] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#0071E3]/20 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300"
          >
            {config.name} 썸머스쿨 상담 예약
            <ChevronRight size={18} />
          </Link>
        </div>
      </section>

      <SpartaPulse />
      


      {/* Mindset Rules */}
      <section className="bg-[#1D1D1F] py-24 md:py-32 border-b border-white/10">
        <div className="max-w-[64rem] mx-auto px-6 sm:px-8">
          <div className="mb-16 md:mb-20 text-center fade-in-up">
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tighter mb-6 leading-tight whitespace-pre-line">
              <RhythmicText text={summerContent.mindsetRules.title} />
            </h2>
            <p className="text-[#86868B] text-lg md:text-xl font-medium leading-relaxed max-w-2xl mx-auto break-keep whitespace-pre-line">
              <RhythmicText text={summerContent.mindsetRules.description} />
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 fade-in-up">
            {summerContent.mindsetRules.items.map((rule, idx) => (
              <div key={idx} className="bg-white/[0.03] border border-white/10 p-8 rounded-3xl hover:bg-white/[0.05] transition-colors duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-10 font-bold text-6xl text-white transform group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                  0{idx + 1}
                </div>
                <h4 className="text-[#0071E3] font-bold text-sm mb-2">{rule.subtitle}</h4>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{rule.title}</h3>
                <p className="text-white/70 font-medium leading-relaxed break-keep">
                  {rule.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recruitment Overview */}
      <section className="bg-white pb-20 md:pb-28 pt-12 md:pt-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12 text-center fade-in-up">
            <p className="text-[#0071E3] text-xs font-bold tracking-[0.2em] uppercase mb-4">Overview</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#1D1D1F] tracking-tighter mb-4">모집 개요</h2>
          </div>
          
          <div className="bg-[#F5F5F7] rounded-3xl p-8 md:p-10 shadow-sm fade-in-up">
            <ul className="space-y-6">
              <li className="flex gap-4">
                <Users className="text-[#0071E3] flex-shrink-0" size={24} />
                <div>
                  <h4 className="text-sm font-bold text-[#86868B] mb-1">대상</h4>
                  <p className="text-[#1D1D1F] font-medium leading-relaxed">{summerContent.overview.target}</p>
                </div>
              </li>
              <li className="flex gap-4">
                <Calendar className="text-[#0071E3] flex-shrink-0" size={24} />
                <div>
                  <h4 className="text-sm font-bold text-[#86868B] mb-1">기간</h4>
                  <p className="text-[#1D1D1F] font-medium leading-relaxed">{summerContent.overview.period}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Recommended For */}
      <section className="bg-[#F5F5F7] py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mb-12 text-center fade-in-up">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1D1D1F] tracking-tighter mb-4">이런 학생에게 추천합니다</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {summerContent.recommendedFor.map((item, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl flex items-start gap-4 shadow-sm fade-in-up">
                <CheckCircle2 className="text-[#FF6B00] flex-shrink-0 mt-0.5" size={24} />
                <p className="text-[#434345] font-medium leading-relaxed break-keep">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20 md:py-28" style={{ backgroundColor: '#EEF2FF' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-12 text-center fade-in-up">
            <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4 leading-tight">
              <RhythmicText text={summerContent.features.title} />
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {summerContent.features.items.map((f, i) => {
              const Icon = [Target, BookOpen, Award][i % 3]
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

      {/* Schedule -> Reusing TimelineView for now but we could customize */}
      <TimelineView />

      {/* Registration Process & Pricing */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mb-16 text-center fade-in-up">
            <p className="text-[#0071E3] text-xs font-bold tracking-[0.2em] uppercase mb-4">Process</p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#1D1D1F] tracking-tighter mb-4">등록 절차 및 안내</h2>
          </div>
          
          {/* Steps */}
          <div className="flex flex-col md:flex-row gap-4 mb-20 fade-in-up">
            {summerContent.registrationSteps.map((step, i) => (
              <div key={i} className="flex-1 relative">
                {/* Connector Line */}
                {i !== summerContent.registrationSteps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-1/2 w-full h-[2px] bg-gray-100" />
                )}
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-[#0071E3] text-white flex items-center justify-center font-bold mb-4 shadow-md">
                    {i + 1}
                  </div>
                  <h4 className="text-lg font-bold text-[#1D1D1F] mb-2">{step.title}</h4>
                  <p className="text-sm text-[#86868B] font-medium break-keep">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Info */}
          <div className="bg-[#1D1D1F] text-white rounded-3xl p-8 md:p-12 fade-in-up">
            <h3 className="text-2xl font-bold mb-8">안내 사항</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-[#0071E3] font-bold mb-2">포함 내역</h4>
                <p className="text-white/80 font-medium leading-relaxed whitespace-pre-line">{summerContent.pricing.included}</p>
              </div>
              <div className="md:col-span-2 pt-6 border-t border-white/10">
                <h4 className="text-white font-bold mb-2">수강료</h4>
                <p className="text-white/80 font-medium leading-relaxed whitespace-pre-line">{pricingInfo}</p>
              </div>
            </div>
            <div className="mt-8 text-center">
              <Link 
                href={reservationUrl}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-white text-[#1D1D1F] font-bold hover:bg-gray-100 transition-colors"
              >
                썸머스쿨 예약 (구글폼)
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Campus Map & Facility */}
      <Campus filter={config.name} />

      {/* Testimonials */}
      <Testimonials 
        testimonials={summerContent.testimonials} 
        campusName={config.name}
      />

      {/* FAQ */}
      <Faq customFaqs={summerContent.faqs} />

      {/* Custom CTA */}
      <section id="cta" className="bg-white py-24 md:py-32 border-t border-black/[0.04]">
        <div className="max-w-[42rem] mx-auto px-4 sm:px-6 text-center">
          <div className="fade-in-up">
            <h2 className="section-title mb-6 leading-tight text-balance">
              <RhythmicText text={"인생을 바꿀\n단 한 번의 여름"} />
            </h2>
            <div className="text-[#86868B] font-medium leading-relaxed mb-10 max-w-lg mx-auto break-keep text-lg">
              <RhythmicText text={"썸머스쿨 예약은 구글폼 작성을 통해 진행됩니다.\n제출해주시면 순차적으로 안내해 드립니다."} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* Action 1: Google Form Reservation */}
              <a
                href={reservationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#1D1D1F] text-white font-semibold hover:bg-black hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_4px_14px_rgba(0,0,0,0.15)] px-8 py-4 w-full sm:w-auto"
              >
                썸머스쿨 예약 (구글폼)
              </a>
              
              {/* Action 2: Naver TalkTalk */}
              <a
                href={config.naverTalkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border border-black/10 bg-[#00C73C]/10 text-[#00C73C] font-bold hover:bg-[#00C73C]/20 transition-all duration-300 px-8 py-4 w-full sm:w-auto"
              >
                네이버 톡톡 문의하기
              </a>
            </div>
          </div>
        </div>
      </section>
      
      <Footer />
    </main>
  )
}
