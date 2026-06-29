import { policeContent, fireContent } from './police-fire-content'
import { gongmuwonContent } from './content/gongmuwon-content'
import { suneungContent } from './content/suneung-content'
import { imyongContent } from './content/imyong-content'
import { professionalContent } from './content/professional-content'
import { jobContent } from './content/job-content'
import { managedContent } from './content/managed-content'

export type StreamId =
  | 'gongmuwon'
  | 'suneung'
  | 'imyong'
  | 'professional'
  | 'job'
  | 'managed'
  | 'police'
  | 'fire'

export interface FAQItem {
  q: string
  a: string
}

export interface StreamSystem {
  icon: string
  title: string
  description: string
}

export interface TestimonialItem {
  name: string
  result: string
  quote: string
}

/** 2026 시험 정보 카드 (경찰·소방 직렬 전용) */
export interface ExamFact {
  label: string
  value: string
  note?: string
}

export interface ExamTimelineItem {
  date: string
  label: string
}

export interface ExamInfo {
  title: string
  subtitle: string
  facts: ExamFact[]
  timeline: ExamTimelineItem[]
}

/** 수험생 걱정 → 우리의 해결 (경찰·소방 직렬 전용) */
export interface WorrySolution {
  icon: string
  worry: string
  worryDetail: string
  solution: string
  solutionDetail: string
}

export interface WorriesSection {
  title: string
  subtitle: string
  items: WorrySolution[]
}

/** 학습관리 프로그램 쇼케이스 (경찰·소방 직렬 전용) */
export interface ManagementFeature {
  icon: string
  title: string
  desc: string
  metric?: string
}

export interface ManagementSection {
  title: string
  subtitle: string
  features: ManagementFeature[]
}

/** 데이터 시각화 섹션 (StreamDataViz) — 직렬별 데이터 구동. 색은 의미색 이름만(보라 금지). */
export type VizColor = 'blue' | 'green' | 'amber' | 'red'
export interface VizSeg {
  label: string
  value: number
  color: VizColor
}
/** 270° 게이지 + 비교막대 카드 (예: 경찰 체력 통과율) */
export interface VizGaugeBlock {
  kind: 'gauge'
  label: string
  alert?: boolean
  gauge: { value: number; label: string; sub: string; color: VizColor }
  bars?: VizSeg[]
  note?: string
}
/** 단일 도넛 + 범례 카드 (예: 경찰 반영비율) */
export interface VizDonutBlock {
  kind: 'donut'
  label: string
  segments: VizSeg[]
  centerTop: string
  centerBottom: string
  note?: string
}
/** Before/After 도넛 비교 카드 (예: 소방 반영비율 변화) */
export interface VizCompareBlock {
  kind: 'compare'
  beforeLabel: string
  afterLabel: string
  midLabel: string
  before: VizSeg[]
  after: VizSeg[]
  beforeCenterTop: string
  beforeCenterBottom: string
  afterCenterTop: string
  afterCenterBottom: string
  note?: string
}
export type VizBlock = VizGaugeBlock | VizDonutBlock | VizCompareBlock
/** 블록이 1개면 풀폭, 2개 이상이면 2열 그리드로 렌더 */
export interface StreamVizData {
  eyebrow: string
  title: string
  subtitle: string
  accent: VizColor
  blocks: VizBlock[]
}

/** 직렬별 1년 학습 로드맵 — 대략적·상대적 단계(특정 날짜 비유지보수). */
export interface RoadmapPhase {
  /** 상대적 시기 라벨 (예: '입문기', '필기 D-DAY') — 절대 날짜 금지 */
  period: string
  /** 단계명 */
  title: string
  /** 한 줄 설명 */
  focus: string
  /** 시험/평가 시점 강조 */
  exam?: boolean
}
export interface StreamRoadmap {
  title: string
  subtitle: string
  phases: RoadmapPhase[]
}

export interface StreamContent {
  id: StreamId
  name: string
  hero: {
    title: string
    subtitle: string
    description?: string
  }
  differentiation: {
    title: string
    items: {
      title: string
      desc: string
    }[]
  }
  systems: StreamSystem[]
  faqs: FAQItem[]
  testimonials: TestimonialItem[]
  /** 직렬 특화 추가 섹션 (경찰·소방) — 있을 때만 렌더링 */
  examInfo?: ExamInfo
  worries?: WorriesSection
  management?: ManagementSection
  /** 데이터 시각화 섹션 (게이지·도넛·비교막대) — 있을 때만 렌더링 */
  viz?: StreamVizData
  /** 1년 학습 로드맵 — 있을 때만 렌더링 */
  roadmap?: StreamRoadmap
}

// 공용 시스템 카드는 리프 모듈에서 관리(순환참조 방지). 기존 import 경로 호환을 위해 재export.
export { COMMON_SYSTEMS } from './content/common-systems'

export const streamContents: Record<StreamId, StreamContent> = {
  gongmuwon: gongmuwonContent,
  suneung: suneungContent,
  imyong: imyongContent,
  professional: professionalContent,
  job: jobContent,
  managed: managedContent,
  police: policeContent,
  fire: fireContent,
}
