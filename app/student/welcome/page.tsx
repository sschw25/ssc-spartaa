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

  // 직렬 기반으로 과목이 미리 생성돼 있으면 마지막 카드에서 계획수립(교재·강의 신청)으로 유도.
  const hasPreparedSubjects = (student.subjects?.length ?? 0) > 0;

  return (
    <WelcomeCarousel
      studentId={sid}
      name={student.name}
      campus={student.campus}
      enrollStartDate={student.enrollStartDate}
      showMock={shouldShowMockStep(student.contact)}
      hasPreparedSubjects={hasPreparedSubjects}
      replay={isReplay}
    />
  );
}
