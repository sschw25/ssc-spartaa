// 임의 학생 60명 + 다양한 출결/순공 세션 시드 (실 Supabase).
// 재실행 안전: 기존 seed_* 학생을 cascade 삭제 후 새로 생성.
// 실행: npx tsx --env-file=.env.local scripts/seed-students.mts
// 정리: npx tsx --env-file=.env.local scripts/seed-students.mts --purge
import { getStudents, saveStudent, deleteStudent } from '../lib/store';
import { checkInSupabase, checkOutSupabase } from '../lib/supabase';

const N = 60;
const DAYS = 10; // 최근 10일 이력
const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIV = ['서연', '민준', '지우', '하준', '서윤', '도윤', '예준', '시우', '주원', '하은', '지호', '준서', '지유', '건우', '수아', '유진', '현우', '예은', '지훈', '소율'];

const nameOf = (i: number) => `${SUR[i % SUR.length]}${GIV[(i * 7) % GIV.length]}`;
const seoulDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);

async function purge() {
  const studs = await getStudents();
  const seeds = studs.filter((s) => s.id.startsWith('seed_'));
  for (const s of seeds) await deleteStudent(s.id);
  return seeds.length;
}

(async () => {
  const purgeOnly = process.argv.includes('--purge');
  const removed = await purge();
  console.log(`기존 seed 학생 ${removed}명 정리`);
  if (purgeOnly) { console.log('✅ purge 완료'); process.exit(0); }

  const iso = new Date().toISOString();
  // 1) 학생 60명 생성
  for (let i = 0; i < N; i++) {
    const id = `seed_${String(i + 1).padStart(3, '0')}`;
    await saveStudent({
      id, name: nameOf(i), campus: CAMPUSES[i % 3], manager: ['김코치', '이코치', '박코치'][i % 3],
      contact: '', books: [], lectures: [], consultationLogs: [], grades: [], subjects: [],
      speedMultiplier: 1.0, createdAt: iso, updatedAt: iso,
    } as any);
  }
  console.log(`학생 ${N}명 생성`);

  // 2) 출결 세션: 학생별 '성실도' factor로 일별 순공/출석 분포 생성
  const now = new Date();
  let sessionCount = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const dayBase = new Date(now.getTime() - d * 86400000);
    const isSunday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(dayBase) === 'Sun';
    if (isSunday) continue; // 일요일 휴원

    const kstDate = seoulDate(dayBase);
    // 등원시각 3종 분포 → 지각 분류(정시 08:20이내 / 08:20지각 / 09:00지각) 다양화
    const ARRIVALS = ['08:10', '08:40', '09:30'];
    await Promise.all(Array.from({ length: N }, async (_, i) => {
      const diligence = ((i * 37) % 100) / 100; // 0~0.99 결정론적
      // 성실한 학생일수록 출석 확률↑ (결석으로 streak/랭킹 분포 다양화)
      const attendProb = 0.45 + diligence * 0.5;
      const seedRand = ((i * 131 + d * 17) % 100) / 100;
      if (seedRand > attendProb) return; // 결석

      const minutes = Math.round(120 + diligence * 300); // 120~420분
      const arrival = ARRIVALS[(i + d) % 3];
      const inAt = new Date(`${kstDate}T${arrival}:00+09:00`);
      const outAt = new Date(inAt.getTime() + minutes * 60000);

      // 오늘(d===0)이고 일부 학생은 '현재 등원중'(미퇴실)으로 남김 → present 버킷
      if (d === 0 && i % 6 === 0) {
        await checkInSupabase(`seed_${String(i + 1).padStart(3, '0')}`, 'qr', inAt);
        sessionCount++;
        return;
      }
      const sess = await checkInSupabase(`seed_${String(i + 1).padStart(3, '0')}`, 'qr', inAt);
      await checkOutSupabase(sess, outAt);
      sessionCount++;
    }));
    process.stdout.write(`  ${seoulDate(dayBase)} 처리(${isSunday ? '휴원' : '운영'})\n`);
  }
  console.log(`✅ 세션 ${sessionCount}건 생성 완료 (학생 ${N}명 × 최근 ${DAYS}일)`);
  process.exit(0);
})().catch((e) => { console.error('❌ 실패:', e?.message || e); process.exit(1); });
