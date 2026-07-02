import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { getSeatMoveRequests, getSeatMoveRequestsForCampuses } from '@/lib/store';
import { canReadCampusScopedResource } from '@/lib/campus-scope';
import { CAMPUS_LABELS, isCampusKey } from '@/lib/seat-layouts';

// 자리이동 신청 목록 (캠퍼스 스코프). ?campus= 지정 시 해당 캠퍼스만,
// 미지정 시 세션 범위 전체(마스터=3개 캠퍼스, 센터 관리자=본인 캠퍼스).
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const campusParam = req.nextUrl.searchParams.get('campus');
  let requests;
  if (campusParam) {
    if (!isCampusKey(campusParam) || !canReadCampusScopedResource(session.campus, campusParam)) {
      return NextResponse.json({ success: false, message: '접근 권한이 없는 캠퍼스입니다.' }, { status: 403 });
    }
    requests = await getSeatMoveRequests(campusParam);
  } else {
    const campuses = session.campus === 'all' ? Object.keys(CAMPUS_LABELS) : [session.campus];
    requests = await getSeatMoveRequestsForCampuses(campuses);
  }

  // pending 우선, 최신순.
  requests.sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return NextResponse.json({ success: true, requests });
}
