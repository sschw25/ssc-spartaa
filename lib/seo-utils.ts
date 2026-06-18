import { Metadata } from 'next'
import { StreamId } from './stream-content'
import { CAMPUS_CONFIG, CampusKey } from './campus-config'

type SeoContent = {
  title: string
  description: string
  keywords: string[]
}

const SITE_URL = 'https://www.sscsparta.com'

const STREAM_SEO_CONFIG: Record<StreamId, (region: string) => SeoContent> = {
  gongmuwon: (region: string) => ({
    title: `${region} 공무원학원 | SSC스파르타 ${region} 공무원 합격관리반`,
    description: `${region} 공무원학원 대표 SSC스파르타! ${region} 경찰·소방·행정직 등 공무원 시험 합격을 위한 독한 관리형 학원. 노량진 커넥츠프랩의 전국 평가 시스템을 그대로 제공합니다.`,
    keywords: [`${region} 공무원학원`, `${region}공무원학원`, `${region} 경찰학원`, `${region} 소방학원`, `${region} 공무원준비`, `${region} 커넥츠프랩`, `${region} 공단기`, `${region} 스파르타`, `공무원기숙학원`],
  }),
  suneung: (region: string) => ({
    title: `${region} 독학재수학원 | 수능 등급을 바꾸는 생활·학습 철저 통제 - SSC스파르타`,
    description: `${region} 독학재수학원 최강의 생활 관리. 무너진 공부 리듬을 수능 실전 시간표에 맞춰 완벽히 통제하는 SSC스파르타 독재관입니다.`,
    keywords: [`${region} 독학재수학원`, `${region}독학재수학원`, `${region} 독학재수`, `${region} 재수학원`, `${region} 수능학원`, `${region} 수능준비`, `${region} 관리형독서실`, `${region} 관리형 스터디카페`],
  }),
  imyong: (region: string) => ({
    title: `${region} 임용고시학원 | 초등·중등·유아 임용고시 관리학습관 - SSC스파르타`,
    description: `초등, 중등, 유아 임용고시 합격을 위한 밀착 관리. 절대 정숙 환경과 교시제를 제공하는 ${region} 임용 특화 SSC스파르타.`,
    keywords: [`${region} 임용고시`, `${region} 임용고시학원`, `${region} 임용준비`, `${region} 중등임용`, `${region} 초등임용`, `${region} 유아임용`, `${region} 관리형독서실`],
  }),
  professional: (region: string) => ({
    title: `${region} 자격증학원 | 세무사·노무사 전문직 시험 관리학습관 - SSC스파르타`,
    description: `세무사, 노무사, 회계사, 기사시험 단기 합격. 100분 교시제로 성인 수험생의 몰입도를 극대화하는 ${region} 자격증 준비 학습관.`,
    keywords: [`${region} 자격증 준비`, `${region} 자격증 학원`, `${region} 자격증학원`, `${region} 세무사 준비`, `${region} 노무사 준비`, `${region} 기사시험 준비`, `${region} 전문직 준비`, `${region} 성인독서실`],
  }),
  job: (region: string) => ({
    title: `${region} 취업준비학원 | 공기업·NCS 관리학습관 - SSC스파르타`,
    description: `공기업, 대기업 취업 성공을 위한 ${region} 취업준비 베이스캠프. NCS 대비 및 자소서 작성을 위한 최적의 학습 환경을 제공합니다.`,
    keywords: [`${region} 취업준비`, `${region} 취업학원`, `${region} 취업준비학원`, `${region} 공기업 준비`, `${region} NCS준비`, `${region} 면접스터디`, `${region} 관리형독서실`],
  }),
  managed: (region: string) => ({
    title: `${region} 관리형독서실 | 성인 수험생 순공시간 극대화 집중관리 - SSC스파르타`,
    description: `${region} 관리형독서실 1등 학습 환경. 완벽한 면학 분위기 유지, 스마트폰 통제 및 학습 스케줄 밀착 케어로 순공시간을 완성합니다.`,
    keywords: [`${region} 관리형독서실`, `${region}관리형독서실`, `${region} 프리미엄 독서실`, `${region} 관리형 스터디카페`, `${region} 독서실`, `${region} 스파르타독서실`],
  }),
}

const CAMPUS_SEO_CONFIG: Record<CampusKey, SeoContent> = {
  wonju: {
    title: 'SSC스파르타 원주캠퍼스 | 원주 관리형학습관',
    description: '원주에서 공부하는 수험생을 위한 시간 관리형 학습관 SSC스파르타 원주캠퍼스. 철저한 통제, 교시제 자습, 스마트폰 관리로 순공시간을 극대화합니다.',
    keywords: ['SSC스파르타 원주캠퍼스', '원주 독학재수', '원주 관리형독서실', '원주 관리형 학습관', '원주 스파르타'],
  },
  chuncheon: {
    title: 'SSC스파르타 춘천캠퍼스 | 시간 관리형 성인/수험생 전문 학습관',
    description: '춘천에서 공부하는 수험생을 위한 시간 관리형 학습관 SSC스파르타 춘천캠퍼스. 철저한 통제, 교시제 자습, 스마트폰 관리로 순공시간을 극대화합니다.',
    keywords: ['SSC스파르타 춘천캠퍼스', '춘천 독학재수', '춘천 관리형독서실', '춘천 관리형 학습관', '춘천 스파르타'],
  },
  chungju: {
    title: 'SSC스파르타 충주캠퍼스 | 시간 관리형 성인/수험생 전문 학습관',
    description: '충주에서 공부하는 수험생을 위한 시간 관리형 학습관 SSC스파르타 충주캠퍼스. 철저한 통제, 교시제 자습, 스마트폰 관리로 순공시간을 극대화합니다.',
    keywords: ['SSC스파르타 충주캠퍼스', '충주 독학재수', '충주 관리형독서실', '충주 관리형 학습관', '충주 스파르타'],
  },
}

export function getStreamMetadata(campus: CampusKey, stream: StreamId): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const config = STREAM_SEO_CONFIG[stream](campusName)
  const canonical = `${SITE_URL}/${campus}/${stream}`

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: canonical,
      type: 'website',
    },
    icons: {
      icon: '/icon.png',
      shortcut: '/icon.png',
      apple: '/icon.png',
    },
  }
}

export function getCampusMetadata(campus: CampusKey): Metadata {
  const config = CAMPUS_SEO_CONFIG[campus]
  const canonical = `${SITE_URL}/${campus}`

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: canonical,
      type: 'website',
    },
    icons: {
      icon: '/icon.png',
      shortcut: '/icon.png',
      apple: '/icon.png',
    },
  }
}

export function getSummerMetadata(campus: CampusKey): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const title = `${campusName} 썸머스쿨 초격차 몰입 캠프 | SSC스파르타`
  const description = `${campusName} 썸머스쿨 완벽한 생활 관리와 압도적인 면학 분위기 속에서 여름방학을 순공 12시간으로 채우는 초격차 몰입 캠프.`
  const keywords = [`${campusName} 썸머스쿨`, `${campusName} 여름방학 특강`, `${campusName} 방학 몰입`, `${campusName} 독학재수`, `${campusName} 관리형독서실`, '썸머스쿨', '방학캠프']
  const canonical = `${SITE_URL}/${campus}/summer`

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
    icons: {
      icon: '/icon.png',
      shortcut: '/icon.png',
      apple: '/icon.png',
    },
  }
}

export function getCampusSubpageMetadata(
  campus: CampusKey,
  page: 'programs' | 'interior',
): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const isPrograms = page === 'programs'
  const title = isPrograms
    ? `SSC스파르타 ${campusName}캠퍼스 프로그램 | 모집·학습 안내`
    : `SSC스파르타 ${campusName}캠퍼스 시설 | 관리형 학습 공간`
  const description = isPrograms
    ? `${campusName} SSC스파르타에서 운영하는 공무원·임용·전문자격·독학재수 프로그램과 최신 모집 안내를 확인하세요.`
    : `${campusName} SSC스파르타의 지정석 자습실, 스터디 공간과 수험생의 장시간 몰입을 위한 관리형 학습 시설을 확인하세요.`
  const canonical = `${SITE_URL}/${campus}/${page}`

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  }
}
