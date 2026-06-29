import { NextResponse } from 'next/server';
import { isAdmin, getAdminSession } from '@/lib/auth';
import { getAppSetting, setAppSetting } from '@/lib/store';

const KEY = 'message_templates';

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  createdBy?: string;
  createdAt: string;
}

async function readTemplates(): Promise<MessageTemplate[]> {
  const raw = await getAppSetting(KEY);
  return Array.isArray(raw) ? (raw as MessageTemplate[]) : [];
}

// 자주 쓰는 문자 템플릿 목록 (모든 관리자 공유)
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const templates = await readTemplates();
    return NextResponse.json({ success: true, templates });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 });
  }
}

// 템플릿 추가
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  let body: { title?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }
  const title = String(body?.title ?? '').trim().slice(0, 40);
  const text = String(body?.body ?? '').trim().slice(0, 500);
  if (!title) return NextResponse.json({ success: false, message: '템플릿 이름을 입력해주세요.' }, { status: 400 });
  if (!text) return NextResponse.json({ success: false, message: '템플릿 내용을 입력해주세요.' }, { status: 400 });

  try {
    const templates = await readTemplates();
    const item: MessageTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      body: text,
      createdBy: session.username,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...templates].slice(0, 100);
    await setAppSetting(KEY, next);
    return NextResponse.json({ success: true, template: item, templates: next });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 });
  }
}

// 템플릿 삭제
export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400 });
  try {
    const templates = await readTemplates();
    const next = templates.filter((t) => t.id !== id);
    await setAppSetting(KEY, next);
    return NextResponse.json({ success: true, templates: next });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 });
  }
}
