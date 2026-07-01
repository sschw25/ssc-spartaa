import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudents, getSeatAbsenceMarks, getAttendedDays, getAppSetting } from '@/lib/store';
import { buildAbsenceRanking } from '@/lib/absence-stats';
import { buildHealthSignals } from '@/lib/health-signals';
import { computeHealthScore, DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from '@/lib/health-score';

const VALID_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const HEALTH_WEIGHTS_KEY = 'health_score_weights';

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const campusFilter = url.searchParams.get('campus');
  const days = Math.min(30, Math.max(7, Number(url.searchParams.get('days')) || 14));

  const to = kstToday();
  const fromDate = new Date(`${to}T00:00:00+09:00`);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(fromDate);

  try {
    const [marks, attended, allStudents, rawWeights] = await Promise.all([
      getSeatAbsenceMarks(from, to),
      getAttendedDays(from, to),
      getStudents(),
      getAppSetting(HEALTH_WEIGHTS_KEY),
    ]);

    // 센터 스코프: campus_admin은 자기 센터, master는 전체(?campus로 단일 필터).
    let students = allStudents;
    if (session.campus !== 'all') {
      students = students.filter((s) => s.campus === session.campus);
    } else if (campusFilter) {
      if (!VALID_CAMPUSES.includes(campusFilter)) {
        return NextResponse.json({ success: false, message: '센터가 올바르지 않습니다.', data: [] }, { status: 400 });
      }
      students = students.filter((s) => s.campus === campusFilter);
    }

    const weights: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...(rawWeights || {}) };

    // 결석집계를 studentId로 인덱싱해 재사용
    const absenceRows = buildAbsenceRanking(marks, attended, students);
    const absenceById = new Map(absenceRows.map((r) => [r.studentId, r]));

    const data = students.map((s) => {
      const a = absenceById.get(s.id);
      const signals = buildHealthSignals(s, a ? { absentDays: a.absentDays, leftDays: a.leftDays } : null);
      const result = computeHealthScore(signals, weights);
      return {
        studentId: s.id,
        name: s.name,
        campus: s.campus,
        score: result.score,
        band: result.band,
        factors: result.factors,
      };
    });

    data.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name, 'ko'));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[health-score GET]', err);
    return NextResponse.json({ success: false, message: '건강지수 계산에 실패했습니다.', data: [] }, { status: 500 });
  }
}
