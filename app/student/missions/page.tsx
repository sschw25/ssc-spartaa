import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';

// 미션 허브는 해체됨(연속출석→홈, 쿠폰 미션→쿠폰 탭). 구 주소는 쿠폰 탭으로 리다이렉트한다(북마크 호환).
// 주의: tab 값은 use-report-state STUDENT_TAB_IDS 화이트리스트에 있는 유효 id 여야 함
// (없는 id는 조용히 홈으로 폴백됨). 'student-missions'는 더 이상 유효하지 않다.
export default async function StudentMissionsPage() {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);
  if (!onboarded) redirect('/student/welcome');

  redirect(`/report/${sid}?audience=student&tab=student-coupons`);
}
