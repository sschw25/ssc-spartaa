'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { MapPin, Phone, Clock } from 'lucide-react'
import { CAMPUS_CONFIG } from '@/lib/campus-config'

const campuses = Object.values(CAMPUS_CONFIG)

export function Campus({ filter }: { filter?: string } = {}) {
  const [active, setActive] = useState(filter ?? '원주')
  const ref = useScrollReveal()
  const campus = campuses.find((c) => c.name === active)!

  return (
    <section id="campus" className="bg-background-subtle py-20 md:py-28" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-10 fade-in-up">
          <h2 className="text-3xl md:text-5xl font-semibold text-[#1D1D1F] tracking-tighter mb-4">
            {filter ? `${filter} 캠퍼스` : '가까운 캠퍼스에서 시작하세요'}
          </h2>
        </div>

        {/* Tab switcher — only shown when not filtered to a single campus */}
        {!filter && (
          <div className="w-full grid grid-cols-3 md:inline-flex p-1 bg-background rounded-lg border border-border-color mb-8 fade-in-up delay-100">
            {campuses.map((c) => (
              <button
                key={c.name}
                onClick={() => setActive(c.name)}
                className={`py-2 rounded-md text-sm font-semibold transition-colors ${
                  active === c.name
                    ? 'bg-[#1D1D1F] text-white shadow-sm'
                    : 'bg-white border text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Campus detail */}
        <div className="grid md:grid-cols-2 gap-6 fade-in-up delay-200">
          {/* Info card */}
          <div
            className="rounded-[12px] border border-border-color bg-background p-8 flex flex-col gap-5"
            style={{ borderWidth: '0.5px' }}
          >
            <h3 className="text-2xl font-semibold text-[#1D1D1F] tracking-tight">
              {campus.name} 캠퍼스
            </h3>
            <ul className="flex flex-col gap-4">
              <li className="flex items-start gap-3">
                <MapPin size={16} className="text-accent-blue mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm text-text-secondary leading-relaxed">{campus.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={16} className="text-accent-blue flex-shrink-0" strokeWidth={1.5} />
                <a
                  href={`tel:${campus.phone}`}
                  className="text-sm text-text-secondary hover:text-accent-blue transition-colors"
                >
                  {campus.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock size={16} className="text-accent-blue mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm text-text-secondary leading-relaxed">{campus.hours}</span>
              </li>
            </ul>
          </div>

          {/* Naver map link — with optional building photo background */}
          <a
            href={campus.naverMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative rounded-[12px] border border-border-color overflow-hidden flex flex-col items-center justify-center min-h-56 gap-4 hover:opacity-90 transition-opacity group"
            style={{ borderWidth: '0.5px' }}
          >
            {/* Building photo */}
            <Image
              src={campus.image}
              alt={`${campus.name} 캠퍼스`}
              fill
              className="object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60" />
            {/* Content */}
            <div className="relative z-10 text-center">
              <MapPin size={36} className="text-white mx-auto mb-2 group-hover:scale-110 transition-transform" strokeWidth={1.2} />
              <p className="text-sm font-bold text-white">{campus.name} 캠퍼스</p>
              <p className="text-xs text-white/80 font-semibold mt-1">📍 네이버 지도에서 보기 →</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  )
}
