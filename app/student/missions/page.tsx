import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { MissionsHub } from '@/components/student/missions-hub';

// 학생 미션 허브 — "오늘 할 일"을 한 화면에: 연속출석 스트릭 + 오늘 계획 + 체크리스트 + 쿠폰 미션.
export default async function StudentMissionsPage() {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);
  if (!onboarded) redirect('/student/welcome');

  return <MissionsHub studentId={sid} studentName={student.name} />;
}
