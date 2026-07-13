// 승인 후 첫진입 온보딩 단계 구성(순수). 화면 콘텐츠/문구는 컴포넌트가 담당하고,
// 여기서는 "어떤 단계를 어떤 순서로" 보여줄지만 결정한다.

export type WelcomeStepId =
  | 'welcome' | 'attendance' | 'report' | 'requests' | 'meal' | 'coupon' | 'mock' | 'finish';

// 모의고사 단계를 노출할 목표시험 키워드. contact(자유텍스트/표준 직렬 라벨)에 substring으로 매칭.
// '9급'·'군무원'은 표준 직렬 라벨(lib/streams.ts: '9급 일반행정' 등) 대응 — 라벨에 '공무원'이 없다.
export const MOCK_EXAM_KEYWORDS = ['공무원', '9급', '군무원', '경찰', '소방', '수능'];

export function shouldShowMockStep(contact?: string): boolean {
  if (!contact) return false;
  return MOCK_EXAM_KEYWORDS.some((kw) => contact.includes(kw));
}

export function buildWelcomeStepIds(showMock: boolean): WelcomeStepId[] {
  return [
    'welcome',
    'attendance',
    'report',
    'requests',
    'meal',
    'coupon',
    ...(showMock ? (['mock'] as const) : []),
    'finish',
  ];
}
