import { NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { getStudentById, getOtEvents, getMockExams, getCampusEvents } from '@/lib/store';
import { getSeoulDateKey } from '@/lib/student-activity';
import {
  buildStudentCalendar, countCalendarActionable,
  getDayStudyItems, summarizeDayStudy, shiftDateKey, buildMaterialSummaries,
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

  const now = new Date();
  const todayKey = getSeoulDateKey(now);

  // 각 파생 계산은 독립적으로 graceful 처리한다 — 한 학생의 특정 데이터가 하나를 throw 시켜도
  // 캘린더(월 그리드·todayKey)는 반드시 뜨게 한다. (과거: 여기서 throw 하면 500 → 클라 viewYm null → 빈 캘린더)
  let items: ReturnType<typeof buildStudentCalendar> = [];
  try { items = buildStudentCalendar({ student, otEvents, mockExams, campusEvents, todayKey }); }
  catch (e) { console.error('calendar buildStudentCalendar failed:', e); }

  // 과목별(자료별) 진행 요약 — 기간 목표 단일 소스(deriveDeadlineGoals) 투영. 마감 마커·진행 패널용.
  let materialSummaries: ReturnType<typeof buildMaterialSummaries> = [];
  try { materialSummaries = buildMaterialSummaries(student, now, todayKey); }
  catch (e) { console.error('calendar buildMaterialSummaries failed:', e); }

  // 그날의 공부 계획·달성도 — 조회 창 각 날짜의 요약(목표 있는 날만). 순수 계산.
  const studyByDate: Record<string, DayStudySummary> = {};
  try {
    for (let off = -CALENDAR_PAST_DAYS; off <= CALENDAR_FUTURE_DAYS; off++) {
      const dateKey = shiftDateKey(todayKey, off);
      const summary = summarizeDayStudy(getDayStudyItems(student, dateKey));
      if (summary.planned > 0) studyByDate[dateKey] = summary;
    }
  } catch (e) { console.error('calendar studyByDate failed:', e); }

  let actionableCount = 0;
  try { actionableCount = countCalendarActionable(items); } catch {}

  return NextResponse.json({ success: true, items, studyByDate, materialSummaries, actionableCount, todayKey });
}
