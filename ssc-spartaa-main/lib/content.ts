"use server"

import { promises as fs } from 'fs'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'data', 'content.json')

export interface SiteContent {
  hero: {
    slides: Array<{
      id: number
      title: string
      subtitle: string
      description: string
      ctaLabel: string
      ctaSecondaryLabel?: string
    }>
  }
  trustBar: {
    stats: Array<{
      value: string
      label: string
    }>
  }
  contact: {
    phone: string
    address: string
    kakaoLink: string
  }
}

const defaultContent: SiteContent = {
  hero: {
    slides: [
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
        title: '원주 유일 커넥츠프랩(공단기) 파트너',
        subtitle: '합격자에게 물어보세요, 합격자는 스파르타 했습니다.',
        description: '',
        ctaLabel: '공무원 합격반 알아보기',
      },
      {
        id: 3,
        title: '임용에서 강합니다. 매년 합격자를 배출합니다',
        subtitle: '초등·중등·유아 임용 — 마지막 60일이 합격을 가릅니다',
        description: '',
        ctaLabel: '임용반 알아보기',
      },
      {
        id: 4,
        title: '합리적 프리미엄 독학재수',
        subtitle: '생활 리듬이 무너지면 강의도 소용없어요. 관리가 먼저입니다.',
        description: '',
        ctaLabel: '프리미엄 독학재수 알아보기',
      },
    ],
  },
  trustBar: {
    stats: [
      { value: '12', label: '년 운영' },
      { value: '3,200', label: '+ 누적 수강생' },
      { value: '56', label: '% 합격률' },
      { value: '4.9*', label: '합격생 만족도' },
    ],
  },
  contact: {
    phone: '033-766-7999',
    address: '강원특별자치도 원주시 치악로 1793 농협건물 4층',
    kakaoLink: 'https://pf.kakao.com',
  },
}

async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data')
  try {
    await fs.access(dataDir)
  } catch {
    await fs.mkdir(dataDir, { recursive: true })
  }
}

export async function getContent(): Promise<SiteContent> {
  try {
    await ensureDataDir()
    const data = await fs.readFile(DATA_FILE, 'utf-8')
    return JSON.parse(data) as SiteContent
  } catch {
    // Return default content if file doesn't exist
    return defaultContent
  }
}

export async function saveContent(content: SiteContent): Promise<void> {
  await ensureDataDir()
  await fs.writeFile(DATA_FILE, JSON.stringify(content, null, 2), 'utf-8')
}

export async function resetContent(): Promise<SiteContent> {
  await saveContent(defaultContent)
  return defaultContent
}
