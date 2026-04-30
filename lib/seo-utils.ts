import { Metadata } from 'next'
import { StreamId } from './stream-content'
import { CAMPUS_CONFIG, CampusKey } from './campus-config'

type SeoContent = {
  title: string
  description: string
  keywords: string[]
}

const STREAM_SEO_CONFIG: Record<StreamId, (region: string) => SeoContent> = {
  gongmuwon: (region: string) => ({
    title: `${region} 공무원학원`,
    description: `${region} 경찰학원, ${region} 소방학원 등 모든 직렬 공무원 합격을 위한 관리형 학원. 노량진 커넥츠프랩 시스템을 ${region} SSC스파르타에서 그대로 경험하세요.`,
    keywords: [`${region} 공무원학원`, `${region} 경찰학원`, `${region} 소방학원`, `${region} 공무원준비`, `${region} 커넥츠프랩`, `${region} 공단기`, `${region} 스파르타`, `공무원기숙학원`],
  }),
  suneung: (region: string) => ({
    title: `${region} 독학재수학원 관리의 정석`,
    description: `${region} 독학재수학원보다 강력한 밀착 관리. 무너진 생활 리듬을 완벽히 통제하는 ${region} 수능 관리형 독서실 SSC스파르타입니다.`,
    keywords: [`${region} 독학재수학원`, `${region} 독학재수`, `${region} 재수학원`, `${region} 수능학원`, `${region} 수능준비`, `${region} 관리형독서실`, `${region} 관리형 스터디카페`],
  }),
  imyong: (region: string) => ({
    title: `${region} 임용고시 준비생 전용 학습관`,
    description: `초등, 중등, 유아 임용고시 합격을 위한 밀착 관리. 절대 정숙 환경과 교시제를 제공하는 ${region} 임용 특화 SSC스파르타.`,
    keywords: [`${region} 임용고시`, `${region} 임용준비`, `${region} 중등임용`, `${region} 초등임용`, `${region} 유아임용`, `${region} 관리형독서실`],
  }),
  professional: (region: string) => ({
    title: `${region} 자격증 준비 전문 관리반`,
    description: `세무사, 노무사, 회계사, 기사시험 단기 합격. 100분 교시제로 성인 수험생의 몰입도를 극대화하는 ${region} 자격증 준비 학습관.`,
    keywords: [`${region} 자격증 준비`, `${region} 자격증 학원`, `${region} 세무사 준비`, `${region} 노무사 준비`, `${region} 기사시험 준비`, `${region} 전문직 준비`, `${region} 성인독서실`],
  }),
  job: (region: string) => ({
    title: `${region} 취업준비 및 공기업 대비 관리반`,
    description: `공기업, 대기업 취업 성공을 위한 ${region} 취업준비 베이스캠프. NCS 대비 및 자소서 작성을 위한 최적의 학습 환경을 제공합니다.`,
    keywords: [`${region} 취업준비`, `${region} 취업학원`, `${region} 취업컨설팅`, `${region} 공기업 준비`, `${region} NCS준비`, `${region} 면접스터디`, `${region} 관리형독서실`],
  }),
  managed: (region: string) => ({
    title: `${region} 최고의 관리형독서실`,
    description: `수능, 공무원, 자격증 등 성인 수험생을 위한 ${region} 1등 관리형독서실. 완벽한 면학 분위기와 스마트폰 통제로 순공시간을 극대화합니다.`,
    keywords: [`${region} 관리형독서실`, `${region} 프리미엄 독서실`, `${region} 관리형 스터디카페`, `${region} 독서실`, `${region} 스파르타독서실`],
  }),
}

const CAMPUS_SEO_CONFIG: Record<CampusKey, SeoContent> = {
  wonju: {
    title: '원주 공무원학원 | 원주 독학재수학원 | SSC스파르타',
    description: '원주 공무원학원, 원주 독학재수 및 자격증 준비의 중심. 노량진 공단기 콘텐츠와 스파르타식 밀착 관리로 단기 합격을 완성하세요.',
    keywords: ['원주 공무원학원', '원주 독학재수학원', '원주 자격증 준비', '원주 관리형독서실', '원주 커넥츠프랩', '원주 공단기', 'SSC스파르타'],
  },
  chuncheon: {
    title: '춘천 공무원학원 | 춘천 독학재수학원 | SSC스파르타',
    description: '춘천 공무원학원, 춘천 독학재수 및 취업 준비생을 위한 최적의 관리형독서실. 철저한 생활 관리와 압도적인 면학 분위기.',
    keywords: ['춘천 공무원학원', '춘천 독학재수학원', '춘천 자격증 준비', '춘천 관리형독서실', '춘천 커넥츠프랩', '춘천 공단기', 'SSC스파르타'],
  },
  chungju: {
    title: '충주 공무원학원 | 충주 독학재수학원 | SSC스파르타',
    description: '충주 공무원학원, 충주 독학재수 및 전문직 합격의 성지. 1:1 밀착 코멘터 관리와 교시제로 당신의 합격을 앞당깁니다.',
    keywords: ['충주 공무원학원', '충주 독학재수학원', '충주 자격증 준비', '충주 관리형독서실', '충주 커넥츠프랩', '충주 공단기', 'SSC스파르타'],
  },
}

export function getStreamMetadata(campus: CampusKey, stream: StreamId): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const config = STREAM_SEO_CONFIG[stream](campusName)

  return {
    title: `${config.title} | SSC스파르타 ${campusName}`,
    description: config.description,
    keywords: config.keywords,
    openGraph: {
      title: `${config.title} | SSC스파르타 ${campusName}`,
      description: config.description,
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: '/apple-icon.png',
    },
  }
}

export function getCampusMetadata(campus: CampusKey): Metadata {
  const config = CAMPUS_SEO_CONFIG[campus]

  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    openGraph: {
      title: config.title,
      description: config.description,
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
      apple: '/apple-icon.png',
    },
  }
}
