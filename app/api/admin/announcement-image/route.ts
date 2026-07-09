import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { uploadAnnouncementImage } from '@/lib/store';

const CAMPUSES = ['wonju', 'chuncheon', 'chungju'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — 클라이언트에서 압축 후 업로드되므로 상한
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// 관리자: 공지 이미지 업로드 → 공개 URL 반환. 이미지 압축은 클라이언트(브라우저)에서 수행.
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: '이미지 파일이 필요합니다.' }, { status: 400 });
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ success: false, message: 'JPEG/PNG/WebP 이미지만 업로드할 수 있습니다.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, message: '이미지 용량이 너무 큽니다(5MB 이하).' }, { status: 400 });
  }

  const dateRaw = String(form.get('date') ?? '').trim();
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().slice(0, 10);

  // 센터: 범위 관리자는 자기 센터로 강제, 전체 관리자는 폼 값(미지정=all)
  let campus = 'all';
  if (session.campus !== 'all') {
    campus = session.campus;
  } else {
    const raw = String(form.get('campus') ?? '').trim();
    campus = CAMPUSES.includes(raw) ? raw : 'all';
  }

  try {
    const buffer = await file.arrayBuffer();
    const { url, path } = await uploadAnnouncementImage(campus, dateKey, buffer, file.type, ext);
    return NextResponse.json({ success: true, url, path });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : '업로드에 실패했습니다.' },
      { status: 500 },
    );
  }
}
