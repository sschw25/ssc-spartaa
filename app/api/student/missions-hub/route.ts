import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getStudySessions, activeBackend } from '@/lib/store';
import { getSeoulDateKey, getDailyChecklistFromStudent, getPlanDailyCompletion } from '@/lib/student-activity';
import { computeAttendanceStreak } from '@/lib/streak';
import type { DetailedPlan } from '@/lib/types/student';

const WEEK_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function isPlanActiveOnDate(plan: DetailedPlan, dateKey: string) {
  return plan.startDate <= dateKey && dateKey <= plan.endDate;
}

function getDailyAmountLabel(plan: DetailedPlan) {
  const amount = plan.dailyAmount || Math.ceil((plan.targetAmount || 1) / 6);
  const range = plan.rangeText || '';
  const rangeWithoutPass = range.replace(/\d+회독/g, '');
  const unit =
    range.includes('문제') ? '문제' :
    range.includes('강') ? '강' :
    range.toLowerCase().includes('p') ? 'p' :
    rangeWithoutPass.includes('회') ? '회' :
    '';
  return `하루 ${amount}${unit}`;
}

// 학생 미션 허브(/student/missions) 전용 데이터 어드민터 — 오늘 계획/체크리스트/스트릭을 한 번에 집계.
// GET: 학생 세션 검증 후 오늘 계획 항목, 오늘 체크리스트, 출결 스트릭, 쿠폰 잔액을 반환.
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const now = new Date();
  const todayKey = getSeoulDateKey(now);
  const todayDow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now).toLowerCase();
  const dayKey = WEEK_DAY_KEYS.find((k) => todayDow.startsWith(k)) || 'mon';

  // 1) 오늘 계획(진도) 항목 — student.subjects 의 오늘 요일 배정 + 오늘 활성 구간(startDate~endDate)인 세부계획
  const todayPlanEntries = (student.subjects || [])
    .filter((subject) => {
      const days = subject.studyDays || [];
      return days.length === 0 || days.includes(dayKey as typeof WEEK_DAY_KEYS[number]);
    })
    .flatMap((subject) => {
      const lectures = (subject.lectures || []).flatMap((lecture) =>
        (lecture.detailedPlans || [])
          .filter((plan) => isPlanActiveOnDate(plan, todayKey))
          .map((plan) => {
            const completion = getPlanDailyCompletion(plan, todayKey);
            return {
              id: `${todayKey}_${subject.id}_${lecture.id}_${plan.id}`,
              subject: subject.name,
              title: lecture.name,
              type: '강의' as const,
              materialType: 'lecture' as const,
              materialId: lecture.id,
              planId: plan.id,
              dateKey: todayKey,
              isCompleted: completion.isCompleted,
              actualAmount: completion.actualAmount,
              dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
              dailyLabel: getDailyAmountLabel(plan),
              rangeText: plan.rangeText,
            };
          }),
      );
      const books = (subject.books || []).flatMap((book) =>
        (book.detailedPlans || [])
          .filter((plan) => isPlanActiveOnDate(plan, todayKey))
          .map((plan) => {
            const completion = getPlanDailyCompletion(plan, todayKey);
            return {
              id: `${todayKey}_${subject.id}_${book.id}_${plan.id}`,
              subject: subject.name,
              title: book.title,
              type: '교재' as const,
              materialType: 'book' as const,
              materialId: book.id,
              planId: plan.id,
              dateKey: todayKey,
              isCompleted: completion.isCompleted,
              actualAmount: completion.actualAmount,
              dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
              dailyLabel: getDailyAmountLabel(plan),
              rangeText: plan.rangeText,
            };
          }),
      );
      return [...lectures, ...books];
    });

  // 2) 오늘 체크리스트(휴대폰 제출/수면)
  const checklist = getDailyChecklistFromStudent(student, todayKey);

  // 3) 출결 스트릭 — 최근 90일 study_sessions(등원일) + 같은 기간 승인휴가(정당사유)일.
  // Supabase 미설정 로컬 환경에서는 study_sessions 조회가 불가하므로 방어적으로 빈 집합 처리.
  const sinceDate = getSeoulDateKey(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
  let attendedDateKeys = new Set<string>();
  if (activeBackend() === 'supabase') {
    try {
      const sessions = await getStudySessions(studentId, sinceDate);
      attendedDateKeys = new Set(sessions.map((s) => s.date));
    } catch {
      // 조회 실패 시 스트릭은 정당사유 데이터만으로 방어적으로 계산
    }
  }
  const justifiedDateKeys = new Set(
    (student.leaveRequests || [])
      .filter((r) => r.status === 'approved' && r.date >= sinceDate)
      .map((r) => r.date),
  );
  const streak = computeAttendanceStreak(attendedDateKeys, { today: now, justifiedDateKeys });

  return NextResponse.json({
    success: true,
    todayPlanEntries,
    checklist,
    streak,
    leaveCoupons: student.leaveCoupons ?? 0,
  });
}
