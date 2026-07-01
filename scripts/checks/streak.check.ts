import { computeAttendanceStreak } from '../../lib/streak';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

// 기준일: 2026-07-01 = 수요일 (KST)
const today = new Date('2026-07-01T09:00:00+09:00');
const dk = (n: number) => {
  const d = new Date(today.getTime()); d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
};

// ── 1. 빈 입력 → 0 ──
{
  const r = computeAttendanceStreak([], { today });
  assert(r.current === 0, `빈 입력 → current 0 (got ${r.current})`);
}

// ── 2. 일요일을 건너뛰는 스트릭(일요일이 스트릭 구간에 포함) ──
// 2026-06-28(일) 포함 주: 06-29(월)~07-01(수) 3일 연속 출석 + 06-27(토) 출석.
// 일요일(06-28)은 결석 기록이 없어도(비어있어도) 끊지 않아야 한다.
{
  const attended = new Set([dk(0), dk(1), dk(2), dk(4)]); // 오늘(수,07-01), 어제(화,06-30), 월(06-29), 토(06-27)
  // dk(3) = 06-28(일) — 의도적으로 미포함(일요일은 출석 기록 자체가 없는 게 정상)
  const r = computeAttendanceStreak(attended, { today });
  assert(weekdayCheck(dk(3)) === 0, '검증용: dk(3)이 실제로 일요일인지 확인');
  assert(r.current === 4, `일요일 스킵 스트릭 → 월화수+토 4일 연속 (got ${r.current})`);
}

// ── 3. 승인휴가로 정당사유 처리된 날은 스트릭을 이어간다 ──
{
  const attended = new Set([dk(0), dk(2)]); // 오늘, 월요일만 실제 출석
  const justified = new Set([dk(1)]); // 어제(화)는 결석이지만 승인 휴가로 정당사유
  const r = computeAttendanceStreak(attended, { today, justifiedDateKeys: justified });
  assert(r.current === 3, `정당사유일 포함 3일 연속 (got ${r.current})`);
}

// ── 4. 평일 결석으로 스트릭이 끊긴다 ──
{
  const attended = new Set([dk(0)]); // 오늘만 출석
  // dk(1) = 화요일(평일), 출석도 정당사유도 없음 → 어제에서 끊김
  const r = computeAttendanceStreak(attended, { today });
  assert(r.current === 1, `평일 결석 시 오늘 1일만 카운트 (got ${r.current})`);
}

// ── 5. 오늘 아직 미출석이어도(일요일 아님) 어제까지의 스트릭은 보존 ──
// dk(1)=화(어제) dk(2)=월 dk(3)=일(스킵) dk(4)=토 → 어제/월/토 3일 연속(일요일 스킵 포함), 오늘(수)은 아직 미출석.
{
  const attended = new Set([dk(1), dk(2), dk(4)]); // 어제/월/토 출석, 오늘(dk(0))은 아직 미출석
  const r = computeAttendanceStreak(attended, { today });
  assert(r.current === 3, `오늘 미출석이어도 어제까지 스트릭 보존 (got ${r.current})`);
}

// ── 6. best: 관찰 범위 내 가장 긴 연속 구간 ──
// dk(10)=일(스킵, 카운트 안 함) dk(11)=토 dk(12)=금 dk(13)=목 dk(14)=수 → 4일 연속(일요일 스킵 포함, 카운트는 4일)
{
  const attended = new Set<string>([dk(0), dk(1)]); // 최근 2일 연속(오늘/어제), dk(2)=월요일 결석으로 끊김
  attended.add(dk(11));
  attended.add(dk(12));
  attended.add(dk(13));
  attended.add(dk(14));
  const r = computeAttendanceStreak(attended, { today });
  assert(r.current === 2, `현재 스트릭 2 (got ${r.current})`);
  assert((r.best ?? 0) >= 4, `best는 과거 4일 연속(일요일 스킵 포함)을 반영 (got ${r.best})`);
}

function weekdayCheck(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
if (failures) process.exit(1);
