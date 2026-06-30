import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';

// 학생 포털 진입점: 로그인 + 온보딩 여부에 따라 분기.
export default async function StudentPage() {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);
  if (!onboarded) redirect('/student/welcome');
  redirect(`/report/${sid}?audience=student`);
}
