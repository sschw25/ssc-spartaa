// 지각 기준(등원 마감) 시각 유틸 — HH:MM 커스텀 시각 지원, 기본 08:20.
// 과거엔 '08:20' | '09:00' 두 값만 허용했으나, 학생별 수동 시각(예: 09:40)을 지원하도록 일반화.

export const DEFAULT_ARRIVAL = '08:20';

/** 임의 문자열을 유효한 HH:MM 으로 정규화(아니면 기본 08:20) */
export function normalizeArrival(value?: string | null): string {
  if (typeof value === 'string') {
    const v = value.trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h >= 0 && h < 24 && min >= 0 && min < 60) {
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
    }
  }
  return DEFAULT_ARRIVAL;
}

/** 등원 마감 시각을 분 단위(0~1439)로 변환 */
export function arrivalDeadlineMin(value?: string | null): number {
  const [h, m] = normalizeArrival(value).split(':').map(Number);
  return h * 60 + m;
}

/** 표준 알림 체크포인트(고정) 외에 커스텀 시각인지 판별 — 09:00 이후 수동 시각 식별용 */
export function isCustomArrival(value?: string | null): boolean {
  const v = normalizeArrival(value);
  return v !== '08:20' && v !== '09:00';
}
