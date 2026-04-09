'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import type { SiteContent } from '@/lib/content'
import { RhythmicText } from '@/components/ui/rhythmic-text'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const defaultSlides = [
  {
    id: 1,
    title: '혼자서는 무너집니다.\nSSC스파르타와 함께라면 버팁니다.',
    subtitle: '독한 관리로 단기합격',
    description: '공무원 · 임용 · 전문자격 · 재수 전 방향 커버',
    ctaLabel: '상담 신청하기',
    ctaSecondaryLabel: '프로그램 둘러보기',
  },
  {
    id: 2,
    title: '원주 유일\n노량진 커넥츠프랩(공단기) 파트너',
    subtitle: '공무원 합격자에게 물어보세요, 합격자는 스파르타 했습니다.',
    description: '',
    ctaLabel: '공무원 합격반 알아보기',
  },
  {
    id: 3,
    title: '임용에서 강합니다.\n매년 합격자를 배출합니다',
    subtitle: '초등·중등·유아 임용 — 마지막 60일이 합격을 가릅니다',
    description: '',
    ctaLabel: '임용반 알아보기',
  },
  {
    id: 4,
    title: '합리적 가격,\n압도적 프리미엄 독학재수',
    subtitle: '생활 리듬이 무너지면 강의도 소용없어요. 관리가 먼저입니다.',
    description: '',
    ctaLabel: '프리미엄 독학재수 알아보기',
  },
  {
    id: 5,
    title: '세무사·노무사·기사시험\n4개월 단기합격의 비밀',
    subtitle: '교시제 시간표 + 코멘터 관리 — 전문자격도 관리가 결과를 만듭니다',
    description: '세무사 · 노무사 · 회계사 · 산업기사 · 각종 기사시험 전 방향 커버',
    ctaLabel: '전문자격반 알아보기',
  },
]

export function HeroSlider({ slides: slidesProp }: { slides?: typeof defaultSlides } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  
  // 현재 캠퍼스 경로 추출 (예: /wonju/programs -> wonju)
  const campusPath = pathname.split('/')[1] || 'wonju'

  const { data } = useSWR<SiteContent>('/api/content', fetcher)
  const slides = slidesProp ?? data?.hero?.slides ?? defaultSlides

  const [current, setCurrent] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (!autoPlay) return
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [autoPlay, slides.length])

  const goToSlide = (index: number) => {
    setCurrent(index)
    setAutoPlay(false)
    setTimeout(() => setAutoPlay(true), 8000)
  }

  const scroll = (id: string) => {
    document.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setAutoPlay(false)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) >= 50) {
      if (delta > 0) {
        goToSlide((current + 1) % slides.length)
      } else {
        goToSlide((current - 1 + slides.length) % slides.length)
      }
    } else {
      setTimeout(() => setAutoPlay(true), 8000)
    }
    touchStartX.current = null
  }

  return (
    <section
      id="hero"
      className="relative h-screen min-h-[600px] overflow-hidden bg-[#F5F5F7]"
      onMouseEnter={() => setAutoPlay(false)}
      onMouseLeave={() => setAutoPlay(true)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <div className="relative h-full">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-out ${
              i === current ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Background Image handling */}
            {(slide as {image?: string}).image ? (
              <>
                <Image src={(slide as {image?: string}).image!} alt="" fill className="object-cover transition-transform duration-[10s] ease-out scale-100 origin-center" priority={i === 0} style={{ transform: i === current ? 'scale(1.05)' : 'scale(1)' }} />
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#F5F5F7]/95 via-transparent to-transparent" />
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-white" />
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `radial-gradient(1px 1px at 20px 30px, #000, rgba(0,0,0,0.1))`,
                    backgroundSize: '40px 60px',
                  }}
                />
              </>
            )}

            {/* Content Area */}
            <div className="relative h-full flex items-center pt-16">
              <div className="w-full max-w-[64rem] mx-auto px-4 sm:px-6">
                <div className="max-w-3xl transform transition-all duration-700 ease-out translate-y-0 opacity-100">
                  <div className="fade-in-up" style={{ animation: i === current ? 'slideUp 0.8s ease-out forwards' : 'none' }}>
                    <p className="text-[#86868B] text-[10px] sm:text-xs font-semibold tracking-[0.2em] uppercase mb-4 opacity-80">
                      PREMIUM SPARTAN CENTER
                    </p>
                    <h1
                      className="main-title mb-8 display-title drop-shadow-sm text-balance"
                    >
                      <RhythmicText text={slide.title} />
                    </h1>
                    <p className="text-[#434345] font-medium tracking-tight mb-4 text-balance" style={{ fontSize: 'var(--font-size-body-lg)' }}>
                      <RhythmicText text={slide.subtitle} />
                    </p>
                    {slide.description && (
                      <p className="text-[#86868B] text-sm sm:text-base md:text-lg mb-8 leading-relaxed max-w-xl font-medium tracking-tight text-balance">
                        <RhythmicText text={slide.description} />
                      </p>
                    )}

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row gap-4 mt-8 flex-wrap">
                        <button
                          onClick={() => {
                            const programId = (slide as { programId?: string }).programId
                            if (programId) {
                              router.push(`/${campusPath}/${programId}`)
                            } else {
                              scroll('cta')
                            }
                          }}
                          className="rounded-full font-bold transition-all duration-300 bg-[#1D1D1F] text-white shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:bg-black hover:scale-105 active:scale-95 btn-fluid"
                        >
                          {slide.ctaLabel}
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
        <button
          onClick={() => goToSlide((current - 1 + slides.length) % slides.length)}
          aria-label="Previous slide"
          className="hidden md:flex w-10 h-10 rounded-full border border-black/10 text-[#1D1D1F] bg-white/80 backdrop-blur-md items-center justify-center hover:bg-white hover:border-black/20 hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition-all ease-out"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>

        {/* Dot indicators */}
        <div className="flex gap-2.5 items-center">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-[6px] rounded-full transition-all duration-300 ease-out ${
                i === current ? 'bg-[#1D1D1F] w-8' : 'bg-black/10 w-[6px] hover:bg-black/30'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => goToSlide((current + 1) % slides.length)}
          aria-label="Next slide"
          className="hidden md:flex w-10 h-10 rounded-full border border-black/10 text-[#1D1D1F] bg-white/80 backdrop-blur-md items-center justify-center hover:bg-white hover:border-black/20 hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition-all ease-out"
        >
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
    </section>
  )
}
