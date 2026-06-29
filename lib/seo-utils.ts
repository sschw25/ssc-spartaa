import { Metadata } from 'next'
import { StreamId } from './stream-content'
import { CAMPUS_CONFIG, CampusKey } from './campus-config'
import { policeSeo, fireSeo } from './police-fire-content'

type SeoContent = {
  title: string
  description: string
  keywords: string[]
}

const SITE_URL = 'https://www.sscsparta.com'

const STREAM_SEO_CONFIG: Record<StreamId, (region: string) => SeoContent> = {
  gongmuwon: (region: string) => ({
    title: `${region} 공무원학원 | 2027 국가직·지방직 개편 대비 합격관리반 - SSC스파르타`,
    description: `${region} 공무원학원 대표 SSC스파르타. 2027 국가직·지방직 9급 개편 체제에 맞춰 한능검 대체, 과목당 25문항, 직무형 국어·영어를 관리하는 학원. 노량진 커넥츠프랩 전국 평가·2중 출결·순공시간 집계·면접 코칭까지 관리합니다.`,
    keywords: [`${region} 공무원학원`, `${region}공무원학원`, `${region} 경찰학원`, `${region} 소방학원`, `${region} 공무원준비`, `${region} 커넥츠프랩`, `${region} 공단기`, `${region} 스파르타`, `2027 공무원시험`, `공무원기숙학원`],
  }),
  suneung: (region: string) => ({
    title: `${region} 독학재수학원 | 2027 수능(통합수능 마지막) 생활·학습 통제 - SSC스파르타`,
    description: `${region} 독학재수학원 최강의 생활 관리. 통합수능 마지막 해인 2027학년도 수능(2026.11.19)을 실전 교시제로 끝까지 통제하는 SSC스파르타 독재관. N수생이 몰리는 시즌, 출결·순공·모의 분석으로 단번에 끝냅니다.`,
    keywords: [`${region} 독학재수학원`, `${region}독학재수학원`, `${region} 독학재수`, `${region} 재수학원`, `${region} 수능학원`, `${region} 수능준비`, `2027 수능`, `${region} 관리형독서실`, `${region} 관리형 스터디카페`],
  }),
  imyong: (region: string) => ({
    title: `${region} 임용고시학원 | 2027학년도 초등·중등·유아 임용 관리학습관 - SSC스파르타`,
    description: `2027학년도 초등·중등·유아 임용(1차 2026.11) 합격을 위한 밀착 관리. 절대 정숙 환경·교시제 회독·2차 수업실연 지원까지 제공하는 ${region} 임용 특화 SSC스파르타.`,
    keywords: [`${region} 임용고시`, `${region} 임용고시학원`, `${region} 임용준비`, `${region} 중등임용`, `${region} 초등임용`, `${region} 유아임용`, `2027 임용`, `${region} 관리형독서실`],
  }),
  professional: (region: string) => ({
    title: `${region} 자격증학원 | 2026 세무사·노무사·회계사 전문직 관리학습관 - SSC스파르타`,
    description: `2026 세무사·노무사·회계사 단기 합격. 자격별 1·2차 일정을 시스템으로 관리하고 100분 교시제로 성인 수험생의 몰입도를 극대화하는 ${region} 자격증 준비 학습관.`,
    keywords: [`${region} 자격증 준비`, `${region} 자격증 학원`, `${region} 자격증학원`, `${region} 세무사 준비`, `${region} 노무사 준비`, `${region} 회계사 준비`, `${region} 전문직 준비`, `${region} 성인독서실`],
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
  police: policeSeo,
  fire: fireSeo,
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

export function getInterviewMetadata(campus: CampusKey): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const canonical = `${SITE_URL}/${campus}/interview`

  let title = ''
  let description = ''
  let keywords: string[] = []

  if (campus === 'wonju') {
    title = '원주 공무원 면접학원 | 2026 지방직·교육행정직 대비반 - SSC스파르타'
    description = '원주 공무원 면접학원의 절대 기준 SSC스파르타. 원주, 강원, 삼척, 태백, 횡성 등 강원 및 인근 지역 지방직·교육행정직 필기합격자 대상 면접 전문 강사진 직강 4회 및 1:1 코칭 제공.'
    keywords = [
      '원주 공무원 면접학원',
      '원주공무원면접학원',
      '원주 공무원 면접',
      '원주공무원면접',
      '원주 면접학원',
      '원주면접학원',
      '강원 공무원 면접학원',
      '강원공무원면접학원',
      '강원 공무원 면접',
      '경기 공무원 면접',
      '삼척 공무원 면접',
      '태백 공무원 면접',
      '강릉 공무원 면접',
      '횡성 공무원 면접',
      '홍천 공무원 면접',
      '강원 교육행정 면접',
      '강원 교행 면접',
      '원주 면접스터디',
      '원주면접스터디',
    ]
  } else if (campus === 'chuncheon') {
    title = '춘천 공무원 면접학원 | 2026 지방직·교육행정직 대비반 - SSC스파르타'
    description = '춘천 공무원 면접학원의 절대 기준 SSC스파르타. 춘천, 강원, 홍천, 화천, 양구, 철원 등 강원 영서북부 지방직 및 교육행정직 필기합격자 대상 면접 전문 강사진 직강 4회 및 1:1 코칭 제공.'
    keywords = [
      '춘천 공무원 면접학원',
      '춘천공무원면접학원',
      '춘천 공무원 면접',
      '춘천공무원면접',
      '춘천 면접학원',
      '춘천면접학원',
      '강원 공무원 면접학원',
      '강원공무원면접학원',
      '강원 공무원 면접',
      '홍천 공무원 면접',
      '화천 공무원 면접',
      '양구 공무원 면접',
      '인제 공무원 면접',
      '철원 공무원 면접',
      '강원 교육행정 면접',
      '강원 교행 면접',
      '춘천 면접스터디',
      '춘천면접스터디',
    ]
  } else if (campus === 'chungju') {
    title = '충주 공무원 면접학원 | 2026 지방직·교육행정직 대비반 - SSC스파르타'
    description = '충주 공무원 면접학원의 절대 기준 SSC스파르타. 충주, 충북, 제천, 청주, 음성, 진천, 괴산 등 충북 전역 지방직 및 교육행정직 필기합격자 대상 면접 전문 강사진 직강 4회 및 1:1 코칭 제공.'
    keywords = [
      '충주 공무원 면접학원',
      '충주공무원면접학원',
      '충주 공무원 면접',
      '충주공무원면접',
      '충주 면접학원',
      '충주면접학원',
      '충북 공무원 면접학원',
      '충북공무원면접학원',
      '충북 공무원 면접',
      '충북 교행직 면접',
      '충북 교육행정 면접',
      '제천 공무원 면접',
      '단양 공무원 면접',
      '괴산 공무원 면접',
      '음성 공무원 면접',
      '진천 공무원 면접',
      '청주 공무원 면접',
      '충주 면접스터디',
      '충주면접스터디',
    ]
  }

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

