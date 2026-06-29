import { redirect } from 'next/navigation';

// 날짜별 휴식·반차 → 학원 캘린더로 통합 이전됨. 기존 링크/북마크 호환용 리다이렉트.
export default function LegacyByDateRedirect() {
  redirect('/admin/calendar');
}
