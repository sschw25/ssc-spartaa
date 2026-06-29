import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import {
  deleteMealRoutineTemplate,
  getMealRoutineTemplates,
  saveMealRoutineTemplate,
} from '@/lib/meal-routines';

// 센터 범위 관리자는 자기 센터 + 전체센터 템플릿만 접근 가능
function canAccessCampus(sessionCampus: string, templateCampus?: string): boolean {
  return sessionCampus === 'all' || !templateCampus || templateCampus === 'all' || templateCampus === sessionCampus;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const all = await getMealRoutineTemplates();
    const templates = session.campus === 'all'
      ? all
      : all.filter((t) => canAccessCampus(session.campus, t.campus));
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '템플릿 조회 실패' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 센터 범위 관리자는 자기 센터로 강제 (body.campus 신뢰 금지)
  if (session.campus !== 'all') {
    body = { ...body, campus: session.campus };
  }

  try {
    const template = await saveMealRoutineTemplate(body);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '템플릿 저장 실패' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400 });
  }

  try {
    // 센터 범위 관리자가 타 센터 템플릿을 삭제하지 못하도록 소유 검증
    if (session.campus !== 'all') {
      const target = (await getMealRoutineTemplates()).find((t) => t.id === id);
      if (target && !canAccessCampus(session.campus, target.campus)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });
      }
    }
    await deleteMealRoutineTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '템플릿 삭제 실패' },
      { status: 500 },
    );
  }
}

