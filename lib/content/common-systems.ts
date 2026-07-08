import type { StreamSystem } from '../stream-content'

/**
 * 전 직렬 공용 시스템 카드.
 * stream-content.ts와 각 직렬 콘텐츠 모듈이 공유하는 리프 모듈(순환참조 방지).
 */
export const COMMON_SYSTEMS: StreamSystem[] = [
  { icon: 'Clock', title: '교시제 집중 자습', description: '7교시 · 12시간 순공 시스템으로\n흔들리지 않는 집중력을 유지합니다.' },
  { icon: 'CheckSquare', title: '코멘터 출결 2중 관리', description: '카드와 태블릿 2중 출결 시스템으로\n자리 이탈까지 빠짐없이 기록합니다.' },
  { icon: 'BarChart2', title: '다양한 학습 공간', description: '컨디션에 맞춰 선택할 수 있는\n3가지 타입의 프리미엄 공간을 제공합니다.' },
  { icon: 'Heart', title: '정기 조회 및 멘탈 관리', description: '매달 성취감을 공유하고 슬럼프를 예방하는\n정기 멘탈 케어 세션을 진행합니다.' },
  { icon: 'Home', title: '스터디 및 라운지 무상 지원', description: '개별 학습 외에도 개방형 라운지 등\n휴게 공간을 자유롭게 이용 가능합니다.' }
]
