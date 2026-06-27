import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { getMissionConfig, saveMissionConfig } from '@/lib/mission-engine';
import { normalizeMissionConfig } from '@/lib/missions';

// 미션 설정 조회
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const config = await getMissionConfig();
    return NextResponse.json({ success: true, config });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정 조회 실패' },
      { status: 500 },
    );
  }
}

// 미션 설정 저장
export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  try {
    const config = normalizeMissionConfig(body?.config ?? body);
    await saveMissionConfig(config);
    return NextResponse.json({ success: true, config });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정 저장 실패' },
      { status: 500 },
    );
  }
}
