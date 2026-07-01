// 상담 상태 시각 신호 규약(단일 소스).
// - 의미색만 사용(iOS26 Liquid Glass): emerald=확정/완료, sky=관리자 제안, amber=학생 대기,
//   slate=취소/지난, rose=노쇼. 보라/인디고 금지.
// - 색 단독 사용 금지 → 각 신호는 label(텍스트) + icon 힌트를 함께 제공해 이중부호화한다.
// 리포트 패널(components/report/consultation-booking-panel.tsx)에서 import해 재사용한다.

import type { ConsultationBooking } from './types/student';

// lucide-react 아이콘 컴포넌트 이름 힌트(문자열). 소비 측에서 실제 아이콘에 매핑한다.
export type ConsultSignalIcon =
  | 'check' // 확정/완료 (CheckCircle2)
  | 'admin' // 관리자 제안 (CalendarClock)
  | 'wait' // 학생 요청 대기 (Clock)
  | 'muted' // 취소/지난 (CircleSlash)
  | 'noshow'; // 노쇼 (AlertTriangle)

export interface ConsultSignal {
  // 카드/배지 감쌈용 테두리+배경 클래스
  wrap: string;
  // 배지(pill) 클래스
  badge: string;
  // 강조 텍스트 색 클래스
  text: string;
  // 사람이 읽는 라벨(세로깨짐 방지 위해 소비 측에서 break-keep 적용)
  label: string;
  // 아이콘 힌트
  icon: ConsultSignalIcon;
}

export const CONSULT_SIGNAL = {
  confirmed: {
    wrap: 'border-emerald-200 bg-emerald-50/70',
    badge: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-700',
    label: '예약 확정',
    icon: 'check',
  },
  done: {
    wrap: 'border-emerald-200 bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-700',
    text: 'text-emerald-700',
    label: '완료',
    icon: 'check',
  },
  adminProposed: {
    wrap: 'border-sky-200 bg-sky-50',
    badge: 'bg-sky-100 text-sky-700',
    text: 'text-sky-700',
    label: '관리자 제안',
    icon: 'admin',
  },
  studentPending: {
    wrap: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    text: 'text-amber-700',
    label: '승인 대기',
    icon: 'wait',
  },
  past: {
    wrap: 'border-slate-200 bg-slate-50',
    badge: 'bg-slate-100 text-slate-600',
    text: 'text-slate-500',
    label: '지난 상담',
    icon: 'muted',
  },
  cancelled: {
    wrap: 'border-slate-200 bg-slate-50',
    badge: 'bg-slate-100 text-slate-600',
    text: 'text-slate-500',
    label: '취소됨',
    icon: 'muted',
  },
  noshow: {
    wrap: 'border-rose-200 bg-rose-50/60',
    badge: 'bg-rose-100 text-rose-700',
    text: 'text-rose-700',
    label: '미참석',
    icon: 'noshow',
  },
} as const satisfies Record<string, ConsultSignal>;

export type ConsultSignalKey = keyof typeof CONSULT_SIGNAL;

// 관리자 내부 사유(변경/제안 메모)를 학생용 중립·성장 톤 1문장으로 순화한다.
// 내부 사유에 부정 어휘가 섞여도 학생 리포트에는 담백하게 노출되도록 방어한다.
// 값이 비어 있으면 kind에 맞는 기본 안내 문장을 반환한다.
export function studentFacingConsultReason(
  internalReason?: string,
  kind?: ConsultationBooking['kind'],
): string {
  const raw = (internalReason || '').trim();
  if (!raw) {
    return kind === 'extra'
      ? '담당 선생님이 일정을 확인한 뒤 조율해 드릴 거예요.'
      : '더 좋은 시간에 상담하기 위해 시간을 조정했어요.';
  }
  // 내부 운영 어휘가 그대로 노출되지 않도록 중립 표현으로 감싼다.
  const negative = /(불참|노쇼|안\s*옴|무단|지각|취소|블랙|blackout|출장)/i;
  if (negative.test(raw)) {
    return '일정 사정으로 시간을 조정했어요. 편한 시간을 함께 정해요.';
  }
  return raw;
}
