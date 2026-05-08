'use client'

import { useState, useEffect } from 'react'
import { Save, RotateCcw, Plus, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { SiteContent } from '@/lib/content'

export default function AdminPage() {
  const [content, setContent] = useState<SiteContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchContent()
  }, [])

  const fetchContent = async () => {
    try {
      const res = await fetch('/api/content')
      const data = await res.json()
      setContent(data)
    } catch (error) {
      console.error('Failed to fetch content:', error)
      setMessage({ type: 'error', text: '콘텐츠를 불러오는데 실패했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!content) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: '저장되었습니다!' })
      } else {
        throw new Error('Save failed')
      }
    } catch (error) {
      console.error('Failed to save:', error)
      setMessage({ type: 'error', text: '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('정말 기본값으로 초기화하시겠습니까?')) return
    setLoading(true)
    try {
      const res = await fetch('/api/content', { method: 'DELETE' })
      const data = await res.json()
      setContent(data)
      setMessage({ type: 'success', text: '초기화되었습니다.' })
    } catch (error) {
      console.error('Failed to reset:', error)
      setMessage({ type: 'error', text: '초기화에 실패했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const updateSlide = (index: number, field: string, value: string) => {
    if (!content) return
    const newSlides = [...content.hero.slides]
    newSlides[index] = { ...newSlides[index], [field]: value }
    setContent({ ...content, hero: { ...content.hero, slides: newSlides } })
  }

  const addSlide = () => {
    if (!content) return
    const newSlide = {
      id: content.hero.slides.length + 1,
      title: '새 슬라이드 제목',
      subtitle: '새 슬라이드 부제목',
      description: '',
      ctaLabel: '버튼 텍스트',
    }
    setContent({
      ...content,
      hero: { ...content.hero, slides: [...content.hero.slides, newSlide] },
    })
  }

  const removeSlide = (index: number) => {
    if (!content || content.hero.slides.length <= 1) return
    const newSlides = content.hero.slides.filter((_, i) => i !== index)
    setContent({ ...content, hero: { ...content.hero, slides: newSlides } })
  }

  const updateStat = (index: number, field: 'value' | 'label', value: string) => {
    if (!content) return
    const newStats = [...content.trustBar.stats]
    newStats[index] = { ...newStats[index], [field]: value }
    setContent({ ...content, trustBar: { ...content.trustBar, stats: newStats } })
  }

  const updateContact = (field: keyof SiteContent['contact'], value: string) => {
    if (!content) return
    setContent({ ...content, contact: { ...content.contact, [field]: value } })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">로딩 중...</div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-red-500">콘텐츠를 불러올 수 없습니다.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-navy text-white border-b border-border-color">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
              <ArrowLeft size={20} />
              <span className="hidden sm:inline">사이트로 돌아가기</span>
            </Link>
            <h1 className="text-lg sm:text-xl font-bold">SSC스파르타 관리자</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RotateCcw size={16} />
              <span className="hidden sm:inline">초기화</span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-navy hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </header>

      {/* Message */}
      {message && (
        <div
          className={`max-w-6xl mx-auto px-4 sm:px-6 py-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {/* Hero Slides */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-navy dark:text-white">메인 슬라이드</h2>
            <button
              onClick={addSlide}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
            >
              <Plus size={16} />
              슬라이드 추가
            </button>
          </div>

          <div className="space-y-4">
            {content.hero.slides.map((slide, index) => (
              <div
                key={slide.id}
                className="p-5 rounded-xl border border-border-color bg-background-subtle space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-secondary">
                    슬라이드 {index + 1}
                  </span>
                  {content.hero.slides.length > 1 && (
                    <button
                      onClick={() => removeSlide(index)}
                      className="text-red-500 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-text-primary">제목</label>
                    <textarea
                      value={slide.title}
                      onChange={(e) => updateSlide(index, 'title', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium text-text-primary">부제목</label>
                    <input
                      type="text"
                      value={slide.subtitle}
                      onChange={(e) => updateSlide(index, 'subtitle', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">설명 (선택)</label>
                    <input
                      type="text"
                      value={slide.description}
                      onChange={(e) => updateSlide(index, 'description', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">버튼 텍스트</label>
                    <input
                      type="text"
                      value={slide.ctaLabel}
                      onChange={(e) => updateSlide(index, 'ctaLabel', e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trust Bar Stats */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-navy dark:text-white">신뢰 지표 (숫자 통계)</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.trustBar.stats.map((stat, index) => (
              <div
                key={index}
                className="p-4 rounded-xl border border-border-color bg-background-subtle space-y-3"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">숫자</label>
                  <input
                    type="text"
                    value={stat.value}
                    onChange={(e) => updateStat(index, 'value', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border-color bg-background text-text-primary text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-primary">라벨</label>
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => updateStat(index, 'label', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border-color bg-background text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact Info */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-navy dark:text-white">연락처 정보</h2>
          <div className="p-5 rounded-xl border border-border-color bg-background-subtle">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">전화번호</label>
                <input
                  type="text"
                  value={content.contact.phone}
                  onChange={(e) => updateContact('phone', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">주소</label>
                <input
                  type="text"
                  value={content.contact.address}
                  onChange={(e) => updateContact('address', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">카카오톡 링크</label>
                <input
                  type="text"
                  value={content.contact.kakaoLink}
                  onChange={(e) => updateContact('kakaoLink', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border-color bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
