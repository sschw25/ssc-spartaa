import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';

// 미션 허브는 리포트의 '미션' 탭으로 통합됨 — 구 주소는 해당 탭으로 리다이렉트한다(북마크 호환).
export default async function StudentMissionsPage() {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);
  if (!onboarded) redirect('/student/welcome');

  redirect(`/report/${sid}?audience=student&tab=student-missions`);
}
