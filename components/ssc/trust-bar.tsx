'use client'

import { useCountUp } from '@/hooks/use-count-up'
import useSWR from 'swr'
import type { SiteContent } from '@/lib/content'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function StatItem({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const numericMatch = value.match(/^([\d,]+)/)
  const numericValue = numericMatch ? parseInt(numericMatch[1].replace(/,/g, ''), 10) : 0
  const suffix = value.replace(/^[\d,]+/, '')

  const { count, ref } = useCountUp(numericValue, 1600)

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        className="text-4xl md:text-5xl font-semibold text-white tracking-tighter tabular-nums"
      >
        {count.toLocaleString()}
        {suffix}
      </span>
      <span className="text-[13px] sm:text-sm text-[#86868B] text-center font-medium">{label}</span>
    </div>
  )
}

const defaultStats = [
  { value: '12', label: '년 운영' },
  { value: '3,200', label: '+ 누적 수강생' },
  { value: '56', label: '% 합격률' },
  { value: '4.9*', label: '합격생 만족도' },
]

export function TrustBar() {
  const { data } = useSWR<SiteContent>('/api/content', fetcher)
  const stats = data?.trustBar?.stats ?? defaultStats

  return (
    <section className="bg-[#1D1D1F] py-16 md:py-24 border-y border-black">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-white/10">
          {stats.map((stat, index) => (
            <StatItem key={index} value={stat.value} label={stat.label} />
          ))}
        </div>
      </div>
    </section>
  )
}
