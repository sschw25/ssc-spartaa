import type { Student } from '@/lib/types/student';
import { isPeriodCoveredByApprovedLeave } from '@/lib/leave-blocks';

// 운영 교시 수: seat-board PERIODS idx 0~6 = 1~7교시. 8교시 'A'(idx 7)는 수기 비대상.
export const OPERATING_PERIODS = 7;

export interface AbsenceRankRow {
  studentId: string;
  name: string;
  campus: string;
  absentDays: number; // 결석일(등원없음 OR 일괄X)
  leftDays: number;   // 이탈일(등원+부분X)
  totalMarks: number; // 정당사유 제외 후 남은 X 마크 수
  lastDate: string;
}

// seat_key "{studentId}:{idx}" 파싱. 콜론 첫 위치 기준(studentId엔 콜론 없음).
// phone_·숫자아님 → null.
export function parseSeatPeriodKey(seatKey: string): { studentId: string; periodIdx: number } | null {
  const i = seatKey.indexOf(':');
  if (i < 0) return null;
  const studentId = seatKey.slice(0, i);
  const tail = seatKey.slice(i + 1);
  if (!/^\d+$/.test(tail)) return null; // phone_D 등 제외
  return { studentId, periodIdx: Number(tail) };
}

// studentId -> date -> 그 날의 판정("absent"|"left")과 정당사유 제외 후 마크 수(effectiveCount)
export type DailyMarkKind = 'absent' | 'left';
export interface DailyMark { kind: DailyMarkKind; effectiveCount: number }
export type DailyMarkMap = Map<string, Map<string, DailyMark>>;

// rawMarks를 (학생,날짜)별 결석/이탈 판정으로 그룹핑. buildAbsenceRanking과 연속결석/
// 이탈급증(daily-digest) 계산이 동일한 원시 로직을 공유하도록 분리한 내부 빌더.
function buildDailyMarkMap(
  rawMarks: { date: string; seatKey: string }[],
  attendedDays: Set<string>,
  studentMap: Map<string, Pick<Student, 'id' | 'name' | 'campus' | 'leaveRequests'>>,
): DailyMarkMap {
  // studentId -> date -> Set<periodIdx>(0~6)
  const grouped = new Map<string, Map<string, Set<number>>>();
  for (const m of rawMarks) {
    const p = parseSeatPeriodKey(m.seatKey);
    if (!p) continue;
    if (p.periodIdx < 0 || p.periodIdx > OPERATING_PERIODS - 1) continue; // 0~6만
    if (!studentMap.has(p.studentId)) continue;
    let byDate = grouped.get(p.studentId);
    if (!byDate) { byDate = new Map(); grouped.set(p.studentId, byDate); }
    let idxs = byDate.get(m.date);
    if (!idxs) { idxs = new Set(); byDate.set(m.date, idxs); }
    idxs.add(p.periodIdx);
  }

  const result: DailyMarkMap = new Map();
  for (const [studentId, byDate] of grouped) {
    const student = studentMap.get(studentId)!;
    let byDateResult: Map<string, DailyMark> | null = null;
    for (const [date, idxs] of byDate) {
      // 정당사유(승인휴가) 덮인 교시 제외
      const effective = [...idxs].filter((idx) => !isPeriodCoveredByApprovedLeave(student, date, idx));
      if (effective.length === 0) continue; // 전부 정당사유 → 그 날 카운트 안 함
      const isBulk = idxs.size === OPERATING_PERIODS; // 7교시 전부 마크 = 일괄(하루종일)
      const hasSession = attendedDays.has(`${studentId}|${date}`);
      const kind: DailyMarkKind = (isBulk || !hasSession) ? 'absent' : 'left';
      if (!byDateResult) { byDateResult = new Map(); result.set(studentId, byDateResult); }
      byDateResult.set(date, { kind, effectiveCount: effective.length });
    }
  }
  return result;
}

export function buildAbsenceRanking(
  rawMarks: { date: string; seatKey: string }[],
  attendedDays: Set<string>,
  students: Pick<Student, 'id' | 'name' | 'campus' | 'leaveRequests'>[],
): AbsenceRankRow[] {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const dailyMap = buildDailyMarkMap(rawMarks, attendedDays, studentMap);

  const rows: AbsenceRankRow[] = [];
  for (const [studentId, byDate] of dailyMap) {
    const student = studentMap.get(studentId)!;
    let absentDays = 0, leftDays = 0, totalMarks = 0, lastDate = '';
    for (const [date, mark] of byDate) {
      totalMarks += mark.effectiveCount;
      if (mark.kind === 'absent') absentDays++; else leftDays++;
      if (date > lastDate) lastDate = date;
    }
    if (absentDays + leftDays > 0) {
      rows.push({ studentId, name: student.name, campus: student.campus, absentDays, leftDays, totalMarks, lastDate });
    }
  }

  rows.sort((a, b) =>
    b.absentDays - a.absentDays ||
    b.leftDays - a.leftDays ||
    b.totalMarks - a.totalMarks ||
    a.name.localeCompare(b.name, 'ko'),
  );
  return rows;
}

// 일별 결석/이탈 판정 맵을 외부(daily-digest 등)에 노출 — 연속결석·기간별 이탈 추세 계산용.
export function buildDailyAbsenceMap(
  rawMarks: { date: string; seatKey: string }[],
  attendedDays: Set<string>,
  students: Pick<Student, 'id' | 'name' | 'campus' | 'leaveRequests'>[],
): DailyMarkMap {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  return buildDailyMarkMap(rawMarks, attendedDays, studentMap);
}
