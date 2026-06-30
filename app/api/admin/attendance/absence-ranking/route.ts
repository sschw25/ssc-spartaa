import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getStudents, getSeatAbsenceMarks, getAttendedDays } from '@/lib/store';
import { buildAbsenceRanking } from '@/lib/absence-stats';

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
function monthStart(): string {
  return kstToday().slice(0, 8) + '01';
}
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || monthStart();
  const to = url.searchParams.get('to') || kstToday();
  const campusFilter = url.searchParams.get('campus');
  if (!YMD.test(from) || !YMD.test(to) || from > to) {
    return NextResponse.json({ success: false, message: '기간이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const [marks, attended, allStudents] = await Promise.all([
      getSeatAbsenceMarks(from, to),
      getAttendedDays(from, to),
      getStudents(),
    ]);

    // 센터 스코프: campus_admin은 자기 센터, master는 전체(?campus로 단일 필터).
    let students = allStudents;
    if (session.campus !== 'all') {
      students = students.filter((s) => s.campus === session.campus);
    } else if (campusFilter) {
      students = students.filter((s) => s.campus === campusFilter);
    }

    const rows = buildAbsenceRanking(marks, attended, students);
    return NextResponse.json({ success: true, rows, from, to });
  } catch (err) {
    console.error('[absence-ranking GET]', err);
    return NextResponse.json({ success: false, message: '집계에 실패했습니다.', rows: [] }, { status: 500 });
  }
}
