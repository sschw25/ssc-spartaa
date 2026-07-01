import { NextResponse } from 'next/server';
import { canViewStudent, isAdmin, getStudentSessionId } from '@/lib/auth';
import { activeBackend, getStudents } from '@/lib/store';
import {
  collectEntries, filterSeriousCohort, buildAggregate, buildPersonalComparison,
  DEFAULT_ABANDON_DAYS, MaterialType,
} from '@/lib/learning-benchmark';

// 부하가 문제되면 materialKey별 TTL(약 10분) 인메모리 캐시를 aggregate에 도입한다(personal은 제외).

const MIN_LEARNERS = 4;

// 학습 벤치마크(전체 학원 통합) — 같은 교재/강의를 진행 중인 성실 진행자 코호트와 비교.
// materialId 파라미터는 클라이언트가 함께 넘기지만 조회에는 사용하지 않는다(교재 식별은 type+subject+name).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') as MaterialType | null;
  const subject = url.searchParams.get('subject') || '';
  const name = url.searchParams.get('name') || '';
  const studentId = url.searchParams.get('studentId') || '';

  if (type !== 'book' && type !== 'lecture') {
    return NextResponse.json({ success: false, message: 'type은 book|lecture' }, { status: 400 });
  }
  if (!subject || !name) {
    return NextResponse.json({ success: false, message: 'subject·name 필요' }, { status: 400 });
  }

  // 인증: 관리자이거나, studentId가 본인일 때만
  let meId = '';
  if (studentId) {
    if (!(await canViewStudent(studentId))) {
      return NextResponse.json({ success: false, message: '열람 권한이 없습니다.' }, { status: 401 });
    }
    meId = studentId;
  } else {
    const sid = await getStudentSessionId();
    if (!sid && !(await isAdmin())) {
      return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
    }
    meId = sid || '';
  }

  if (activeBackend() !== 'supabase') {
    return NextResponse.json({ success: true, configured: false });
  }

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const students = await getStudents(); // 전체 학원 통합(campus 필터 없음)
    const cohort = filterSeriousCohort(
      collectEntries(students, type, subject, name, today), today, DEFAULT_ABANDON_DAYS,
    );

    if (cohort.length < MIN_LEARNERS) {
      return NextResponse.json({ success: true, configured: true, eligible: false, learnerCount: cohort.length });
    }

    const aggregate = buildAggregate(cohort, type, name, subject);
    // 완료자 4명 미만이면 완료자 전용 지표 숨김
    if (aggregate.completerCount < MIN_LEARNERS) {
      aggregate.avgDurationWeeks = null;
      aggregate.targetDeltaDaysAvg = null;
    }

    let personal = null;
    if (meId) {
      const me = cohort.find((e) => e.studentId === meId)
        ?? collectEntries(students, type, subject, name, today).find((e) => e.studentId === meId);
      if (me) personal = buildPersonalComparison(cohort, me, aggregate, today);
    }

    return NextResponse.json({ success: true, configured: true, eligible: true, aggregate, personal });
  } catch (e: any) {
    console.error('learning-benchmark error:', e);
    return NextResponse.json({ success: false, message: e?.message || '벤치마크 조회 실패' }, { status: 500 });
  }
}
