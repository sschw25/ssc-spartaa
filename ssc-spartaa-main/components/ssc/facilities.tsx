'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { BookOpen, Users, Box, Coffee, type LucideIcon } from 'lucide-react'
import { RhythmicText } from '@/components/ui/rhythmic-text'
import { type FacilityItem, defaultFacilities } from './facilities-data'

export type { FacilityItem }
export { defaultFacilities }

const iconMap: Record<string, LucideIcon> = {
  BookOpen,
  Users,
  Box,
  Coffee,
}

function FacilityCard({ facility, index }: { facility: FacilityItem; index: number }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const Icon = iconMap[facility.icon] ?? BookOpen

  return (
    <div
      className={`fade-in-up delay-${(index + 1) * 100} rounded-[12px] border border-border-color bg-background-subtle flex flex-col overflow-hidden`}
      style={{ borderWidth: '0.5px' }}
    >
      {/* Photo area */}
      <div className="relative w-full aspect-[4/3] bg-navy/10">
        <Image
          src={facility.image}
          alt={facility.title}
          fill
          className="object-cover"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* Fallback icon — hidden once image loads */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-lg bg-navy/10 dark:bg-accent-blue/10 flex items-center justify-center">
              <Icon size={20} className="text-navy dark:text-accent-blue" strokeWidth={1.5} />
            </div>
          </div>
        )}
      </div>

      {/* Text */}
      <div className="p-5 flex flex-col gap-2">
        <h3 className="text-sm font-bold text-navy dark:text-foreground leading-snug">
          {facility.title}
        </h3>
        <p className="hidden md:block text-sm text-text-secondary leading-relaxed">
          {facility.description}
        </p>
      </div>
    </div>
  )
}

export function Facilities({ facilities }: { facilities?: FacilityItem[] } = {}) {
  const items = facilities ?? defaultFacilities
  const ref = useScrollReveal()

  return (
    <section id="facilities" className="bg-white py-24 md:py-32" ref={ref}>
      <div className="max-w-[72rem] mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-16 text-center fade-in-up">
          <p className="text-[#0071E3] text-xs font-bold tracking-[0.3em] uppercase mb-4">World-Class Environment</p>
          <h2 className="section-title mb-8 leading-tight">
            <RhythmicText text={"공부가 유지될 수밖에 없는\n압도적 몰입의 공간"} />
          </h2>
          <div className="text-[#86868B] font-medium max-w-2xl mx-auto leading-relaxed break-keep" style={{ fontSize: 'var(--font-size-body-lg)' }}>
            <RhythmicText text={"의지에만 맡기지 않습니다.\n완벽하게 설계된 환경이 당신을 합격으로\n이끄는 가장 강력한 엔진이 됩니다."} />
          </div>
        </div>

        {/* Facility Gallery Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {items.map((facility, i) => {
            const Icon = iconMap[facility.icon] ?? BookOpen
            return (
              <div
                key={facility.id}
                className={`group relative h-[400px] md:h-[500px] rounded-[32px] overflow-hidden bg-[#F5F5F7] border border-black/[0.04] fade-in-up delay-${(i + 1) * 100}`}
              >
                {/* Image Background */}
                <div className="absolute inset-0 transition-transform duration-[2s] ease-out group-hover:scale-105">
                  <Image
                    src={facility.image}
                    alt={facility.title}
                    fill
                    className="object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80' }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                </div>

                {/* Content Overlay */}
                <div className="absolute inset-0 p-8 md:p-12 flex flex-col justify-end">
                   <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-6 text-white group-hover:scale-110 transition-transform duration-500">
                      <Icon size={24} strokeWidth={1.5} />
                   </div>
                   <h3 className="text-white text-2xl md:text-3xl font-semibold tracking-tight mb-3">
                      {facility.title}
                   </h3>
                   <p className="text-white/60 text-[15px] md:text-base font-medium leading-relaxed max-w-sm group-hover:text-white/90 transition-colors duration-300">
                      {facility.description}
                   </p>
                </div>

                {/* Hover States: Nano-texture glow */}
                <div className="absolute inset-0 border-[0.5px] border-white/0 group-hover:border-white/20 rounded-[32px] transition-all duration-500 pointer-events-none" />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
