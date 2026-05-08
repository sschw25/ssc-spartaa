'use client'

export function Hero() {
  const scrollTo = (id: string) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center dot-grid bg-background overflow-hidden"
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-accent-blue" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-32 md:py-40">
        <div className="max-w-3xl">
          {/* Eyebrow tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-blue/30 bg-background-blue-soft mb-8 fade-in-up">
            <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
            <span className="text-xs font-semibold text-accent-blue tracking-wide uppercase">
              원주 · 춘천 · 충주 3개 캠퍼스 운영 중
            </span>
          </div>

          {/* H1 */}
          <h1 className="text-4xl sm:text-5xl md:text-[52px] font-bold leading-tight text-navy dark:text-foreground text-balance mb-6 fade-in-up delay-100">
            공부 의지에만 맡기지 않습니다.
            <br />
            환경·시간·생활까지 함께 관리합니다.
          </h1>

          {/* Sub-headline */}
          <p className="text-base sm:text-lg text-text-secondary leading-relaxed mb-10 max-w-xl fade-in-up delay-200">
            원주 · 춘천 · 충주 — 여러분의 합격 파트너 SSC스파르타
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 fade-in-up delay-300">
            <button
              onClick={() => scrollTo('#cta')}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-navy text-text-on-navy font-semibold text-sm hover:bg-navy/90 transition-colors dark:bg-accent-blue"
            >
              무료 상담 신청하기
            </button>
            <button
              onClick={() => scrollTo('#programs')}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl border border-navy text-navy font-semibold text-sm hover:bg-navy/5 transition-colors dark:border-accent-blue dark:text-accent-blue dark:hover:bg-accent-blue/10"
            >
              프로그램 둘러보기
            </button>
          </div>

          {/* Micro-trust row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 fade-in-up delay-400">
            {[
              '누적 합격생 600명+',
              '강원 합격률 1위',
              '커넥츠프랩(공단기) 파트너',
            ].map((item) => (
              <span
                key={item}
                className="flex items-center gap-1.5 text-xs text-text-secondary font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-blue flex-shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Decorative side panel — desktop only */}
      <div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[36%] bg-navy/5 dark:bg-navy/40 items-center justify-center">
        <div className="grid grid-cols-2 gap-4 p-10 w-full">
          {[
            { label: '합격생', value: '600+', sub: '누적 합격' },
            { label: '합격률', value: '1위', sub: '강원 지역' },
            { label: '캠퍼스', value: '3개', sub: '원주·춘천·충주' },
            { label: '프로그램', value: '3개', sub: '공무원·취업·재수' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[12px] border border-border-color bg-background p-5 flex flex-col gap-1"
            >
              <span className="text-2xl font-bold text-navy dark:text-accent-blue font-sans">
                {stat.value}
              </span>
              <span className="text-xs font-semibold text-text-primary">{stat.label}</span>
              <span className="text-xs text-text-secondary">{stat.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
