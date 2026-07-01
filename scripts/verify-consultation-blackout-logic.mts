import assert from 'node:assert';
import { availableSlotsForDate, getBookableCalendar, findBlackout } from '../lib/consultation-schedule';
import type { BlackoutEntry } from '../lib/types/student';

// 충주는 월~금 운영, 목요일은 부원장 15:30 캡(slotsForDay가 6칸 반환).
// 충주 평일(목 제외) 전 슬롯 9칸: 14:00..16:30.
const FULL_DAY = 9;

function nextWeekday(target: number): string {
  // 2026-07-06(월)부터 검색 — 미래 고정일로 충분.
  const d = new Date('2026-07-06T00:00:00Z');
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const monday = nextWeekday(1); // 충주 월요일(센터장, 전 슬롯)
  const blackouts: BlackoutEntry[] = [
    { date: monday, scope: ['16:00', '16:30'], reason: '회의' },
  ];

  // findBlackout
  assert.ok(findBlackout(blackouts, monday), 'findBlackout 매칭 실패');
  assert.strictEqual(findBlackout(blackouts, '2099-01-01'), undefined, 'findBlackout 오매칭');

  // 슬롯 일부 차단
  const partial = availableSlotsForDate('chungju', 'mon', monday, blackouts);
  assert.strictEqual(partial.length, FULL_DAY - 2, '부분 차단 개수 불일치');
  assert.ok(!partial.includes('16:00') && !partial.includes('16:30'), '차단 슬롯이 남음');

  // fullday 차단
  const fullBo: BlackoutEntry[] = [{ date: monday, scope: 'fullday' }];
  assert.strictEqual(availableSlotsForDate('chungju', 'mon', monday, fullBo).length, 0, 'fullday 차단 실패');

  // 차단 없으면 전 슬롯
  assert.strictEqual(availableSlotsForDate('chungju', 'mon', monday, []).length, FULL_DAY, '무차단 기본 불일치');

  // 캘린더 반영: fullday 차단일은 freeSlots 0 + full=true
  const cal = getBookableCalendar('chungju', monday, '00:00', [], fullBo);
  const day = cal.find((d) => d.date === monday);
  assert.ok(day && day.full && day.freeSlots.length === 0, '캘린더 fullday 차단 미반영');

  console.log('PASS: blackout 순수로직');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
