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
    description: `${region} 경찰공무원학원, ${region} 소방공무원학원 준비 및 행정직 합격의 선두주자. 공단기 파트너 SSC스파르타의 철저한 관리 시스템이 성공을 이끕니다.`,
    keywords: [`${region} 공무원학원`, `${region} 경찰학원`, `${region} 소방학원`, `${region} 경찰공무원학원`, `${region} 소방공무원학원`, `${region} 커넥츠프랩`, `${region} 스파르타`, `${region} SSC스파르타`],
  }),
  suneung: (region: string) => ({
    title: `${region} 독학재수보다 더 강한 관리`,
    description: `${region} 독학재수 SSC스파르타. 무너진 생활 리듬을 잡고 진짜 공부에 집중하는 관리형 독서실.`,
    keywords: [`${region} 독학재수`, `${region} 수능`, `${region} 스파르타`, `${region} 관리형독서실`, `${region} 독서실`, `${region} 커넥츠프랩`],
  }),
  imyong: (region: string) => ({
    title: `${region} 임용준비의 시작과 끝`,
    description: `초등·중등·유아 임용 합격을 위한 밀착 관리. 매년 합격자를 배출하는 ${region} SSC스파르타.`,
    keywords: [`${region} 임용`, `${region} 관리형독서실`, `${region} ${region}임용`, `${region} 임용준비`],
  }),
  professional: (region: string) => ({
    title: `${region} 전문자격준비는 역시`,
    description: `세무사·노무사·기사시험 단기 합격 관리. 교시제 시간표로 완성하는 ${region} 전문자격 합격반.`,
    keywords: [`${region} 세무사준비`, `${region} 노무사준비`, `${region} 전문자격준비`, `${region} 관리형 독서실`],
  }),
  job: (region: string) => ({
    title: `취업성공을 위한 최고의 선택`,
    description: `${region} 취업준비 관리형 독서실. 공기업·대기업 취업을 위한 최적의 학습 환경과 루틴 관리.`,
    keywords: [`${region} 취업준비`, `${region} 관리형독서실`, `${region} 취업성공`],
  }),
  managed: (region: string) => ({
    title: `${region} 관리형독서실의 표본`,
    description: `수능, 공무원, 전문자격 등 모든 성인 수험생을 위한 ${region} 관리형독서실. 최적의 학습 환경과 엄격한 생활 관리.`,
    keywords: [`${region} 관리형독서실`, `${region} 독서실`, `${region} 스터디카페`, `${region} 스파르타`, `${region} 독학`],
  }),
}

const CAMPUS_SEO_CONFIG: Record<CampusKey, SeoContent> = {
  wonju: {
    title: '원주 공무원학원 | SSC스파르타',
    description: '원주 공무원학원, 경찰·소방·공무원 시험 준비의 중심. 노량진 공단기 콘텐츠와 스파르타식 밀착 관리로 단기 합격을 완성하세요.',
    keywords: ['원주 공무원학원', '원주 경찰학원', '원주 소방학원', '원주 공무원준비', '원주 커넥츠프랩', '원주 공단기', 'SSC스파르타'],
  },
  chuncheon: {
    title: '춘천 공무원학원 | SSC스파르타',
    description: '춘천 공무원학원, 경찰·소방·공무원 시험 준비의 중심. 노량진 공단기 콘텐츠와 스파르타식 밀착 관리로 단기 합격을 완성하세요.',
    keywords: ['춘천 공무원학원', '춘천 경찰학원', '춘천 소방학원', '춘천 공무원준비', '춘천 커넥츠프랩', '춘천 공단기', 'SSC스파르타'],
  },
  chungju: {
    title: '충주 공무원학원 | SSC스파르타',
    description: '충주 공무원학원, 경찰·소방·공무원 시험 준비의 중심. 노량진 공단기 콘텐츠와 스파르타식 밀착 관리로 단기 합격을 완성하세요.',
    keywords: ['충주 공무원학원', '충주 경찰학원', '충주 소방학원', '충주 공무원준비', '충주 커넥츠프랩', '충주 공단기', 'SSC스파르타'],
  },
}

export function getStreamMetadata(campus: CampusKey, stream: StreamId): Metadata {
  const campusName = CAMPUS_CONFIG[campus].name
  const config = STREAM_SEO_CONFIG[stream](campusName)
  const title = `${config.title} | SSC스파르타`

  return {
    title,
    description: config.description,
    keywords: config.keywords,
    openGraph: {
      title,
      description: config.description,
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
  }
}
