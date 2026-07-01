import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getAppSetting } from '@/lib/store';
import type { CampusDigest, DailyDigestResult } from '@/lib/daily-digest';

const VALID_CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const DAILY_DIGEST_KEY = 'daily_digest';

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const campusFilter = url.searchParams.get('campus');

  // 센터 스코프: campus_admin은 자기 센터, master는 전체(?campus로 단일 필터).
  let allowedCampuses: string[] | null = null; // null = 전체 허용
  if (session.campus !== 'all') {
    allowedCampuses = [session.campus];
  } else if (campusFilter) {
    if (!VALID_CAMPUSES.includes(campusFilter)) {
      return NextResponse.json({ success: false, message: '센터가 올바르지 않습니다.' }, { status: 400 });
    }
    allowedCampuses = [campusFilter];
  }

  try {
    const stored = (await getAppSetting(DAILY_DIGEST_KEY)) as DailyDigestResult | null;
    if (!stored) {
      return NextResponse.json({ success: true, data: { generatedDate: '', campuses: {} } });
    }

    const campuses: Record<string, CampusDigest> = {};
    for (const [campus, digest] of Object.entries(stored.campuses || {})) {
      if (allowedCampuses && !allowedCampuses.includes(campus)) continue;
      campuses[campus] = digest;
    }

    return NextResponse.json({ success: true, data: { generatedDate: stored.generatedDate, campuses } });
  } catch (err) {
    console.error('[daily-digest GET]', err);
    return NextResponse.json({ success: false, message: '브리핑 조회에 실패했습니다.' }, { status: 500 });
  }
}
