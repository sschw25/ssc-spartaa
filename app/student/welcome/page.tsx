import { redirect } from 'next/navigation';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById } from '@/lib/store';
import { shouldShowMockStep } from '@/lib/onboarding';
import { WelcomeCarousel } from '@/components/student/welcome-carousel';

export default async function StudentWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}) {
  const sid = await getStudentSessionId();
  if (!sid) redirect('/student/login');

  const student = await getStudentById(sid);
  if (!student) redirect('/student/login');

  const { replay } = await searchParams;
  const isReplay = replay === '1';
  const onboarded = Boolean((student.studentState as Record<string, unknown> | undefined)?.onboardedAt);

  // 이미 온보딩했고 재열람이 아니면 리포트로.
  if (onboarded && !isReplay) {
    redirect(`/report/${sid}?audience=student`);
  }

  return (
    <WelcomeCarousel
      studentId={sid}
      name={student.name}
      campus={student.campus}
      enrollStartDate={student.enrollStartDate}
      showMock={shouldShowMockStep(student.contact)}
      replay={isReplay}
    />
  );
}
