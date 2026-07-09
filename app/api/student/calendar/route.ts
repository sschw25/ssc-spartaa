import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getOtEvents, getMockExams, getCampusEvents } from '@/lib/store';
import { getSeoulDateKey } from '@/lib/student-activity';
import {
  buildStudentCalendar, countCalendarActionable,
  getDayStudyItems, summarizeDayStudy, shiftDateKey,
  CALENDAR_PAST_DAYS, CALENDAR_FUTURE_DAYS, type DayStudySummary,
} from '@/lib/student-calendar';
import type { OtEvent, MockExam, CampusEvent } from '@/lib/types/student';

// 학생: 통합 캘린더 항목 (OT·모의고사·행사/일정 + 본인 반차·상담).
// 각 마스터 테이블 미생성/오류는 빈 목록으로 graceful 처리해 화면이 깨지지 않게 한다.
export async function GET() {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  let otEvents: OtEvent[] = [];
  let mockExams: MockExam[] = [];
  let campusEvents: CampusEvent[] = [];
  try { otEvents = await getOtEvents(); } catch {}
  try { mockExams = await getMockExams(); } catch {}
  try { campusEvents = await getCampusEvents(); } catch {}

  const todayKey = getSeoulDateKey();
  const items = buildStudentCalendar({ student, otEvents, mockExams, campusEvents, todayKey });

  // 그날의 공부 계획·달성도 — 조회 창 각 날짜의 요약(목표 있는 날만). 순수 계산.
  const studyByDate: Record<string, DayStudySummary> = {};
  for (let off = -CALENDAR_PAST_DAYS; off <= CALENDAR_FUTURE_DAYS; off++) {
    const dateKey = shiftDateKey(todayKey, off);
    const summary = summarizeDayStudy(getDayStudyItems(student, dateKey));
    if (summary.planned > 0) studyByDate[dateKey] = summary;
  }

  return NextResponse.json({ success: true, items, studyByDate, actionableCount: countCalendarActionable(items), todayKey });
}
