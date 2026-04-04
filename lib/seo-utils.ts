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
    description: `${region} 경찰·소방·행정 합격의 선두주자. 공단기 파트너 SSC스파르타의 철저한 관리 시스템.`,
    keywords: [`${region} 공무원학원`, `${region} 경찰학원`, `${region} 소방학원`, `${region} 커넥츠프랩`, `${region} 스파르타`, `${region} SSC스파르타`],
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
}

const CAMPUS_SEO_CONFIG: Record<CampusKey, SeoContent> = {
  wonju: {
    title: '원주 공무원학원 | 원주 관리형 독서실 SSC스파르타',
    description: '원주 공무원·독학재수 합격의 성지. 노량진 본원과 동일한 관리 시스템과 공단기 콘텐츠를 원주에서 그대로 경험하세요.',
    keywords: ['원주 공무원학원', '원주 관리형 독서실', '원주 독학재수', '원주 커넥츠프랩', '원주 공단기'],
  },
  chuncheon: {
    title: '춘천 공무원학원 | 춘천 관리형 독서실 SSC스파르타',
    description: '춘천 공무원·독학재수 합격의 지름길. 철저한 생활 관리와 최적의 학습 환경으로 단기 합격을 완성합니다.',
    keywords: ['춘천 공무원학원', '춘천 관리형 독서실', '춘천 독학재수', '춘천 커넥츠프랩', '춘천 공단기'],
  },
  chungju: {
    title: '충주 공무원학원 | 충주 관리형 독서실 SSC스파르타',
    description: '충주 공무원·독학재수 합격 시스템. 1:1 밀착 관리와 정기적인 테스트로 합격까지 함께합니다.',
    keywords: ['충주 공무원학원', '충주 관리형 독서실', '충주 독학재수', '충주 커넥츠프랩', '충주 공단기'],
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
