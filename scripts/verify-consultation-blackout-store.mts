import assert from 'node:assert';
import { getConsultationBlackouts, setConsultationBlackouts } from '../lib/store';
import type { BlackoutEntry } from '../lib/types/student';

async function main() {
  const campus = '__verify_blackout__';
  const entries: BlackoutEntry[] = [
    { date: '2026-07-01', scope: 'fullday', reason: '부원장 출장' },
    { date: '2026-07-02', scope: ['16:00', '16:30'], reason: '오후 회의' },
  ];
  await setConsultationBlackouts(campus, entries);
  const read = await getConsultationBlackouts(campus);
  assert.deepStrictEqual(read, entries, '라운드트립 불일치');

  await setConsultationBlackouts(campus, []);
  const empty = await getConsultationBlackouts(campus);
  assert.deepStrictEqual(empty, [], '빈 배열 저장 실패');

  console.log('PASS: blackout store 라운드트립');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
