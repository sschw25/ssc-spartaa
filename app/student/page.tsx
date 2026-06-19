import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';

// 학생 포털 진입점: 이미 로그인했으면 본인 결과지로, 아니면 로그인으로.
export default async function StudentPage() {
  const sid = await getStudentSessionId();
  if (sid) {
    redirect(`/report/${sid}?audience=student`);
  }
  redirect('/student/login');
}
