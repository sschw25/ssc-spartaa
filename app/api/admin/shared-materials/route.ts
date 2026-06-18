import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readSharedMaterials, saveSharedMaterial } from '@/lib/store';
import { SharedMaterial } from '@/lib/types/student';

const normalizeSearchText = (value: string) => {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/수학\s*i\b/g, '수학1')
    .replace(/수\s*i\b/g, '수1')
    .replace(/수학\s*ii\b/g, '수학2')
    .replace(/수\s*ii\b/g, '수2')
    .replace(/[Ⅰⅰ]/g, '1')
    .replace(/[Ⅱⅱ]/g, '2')
    .replace(/[\s\-_()[\]{}·.,:;|/\\]+/g, '');
};

const buildSearchText = (material: SharedMaterial) => {
  return [
    material.name,
    material.subject,
    material.publisher || '',
    material.author || '',
  ].join(' ');
};

const getQueryVariants = (query: string) => {
  const variants = new Set([query]);
  variants.add(query.replace(/^수(\d)/, '수학$1'));
  variants.add(query.replace(/^수학(\d)/, '수$1'));
  return Array.from(variants).filter(Boolean);
};

// 인증 상태 헬퍼 함수
async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('admin-session')?.value;
  return sessionToken === 'ssc-admin-authorized-token-2026';
}

// 1. 공유 교재/강의 목록 조회 (필터링 지원)
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || ''; // 'book' | 'lecture'
  const subject = searchParams.get('subject') || ''; // 과목명 (예: '국어', '수학' 등)
  const queryTokens = q
    .split(/\s+/)
    .map(token => normalizeSearchText(token))
    .filter(Boolean);
  const normalizedQuery = normalizeSearchText(q);
  const queryVariants = getQueryVariants(normalizedQuery);

  try {
    let materials = await readSharedMaterials();

    if (type) {
      materials = materials.filter(m => m.type === type);
    }
    if (normalizedQuery) {
      materials = materials.filter(m => {
        const searchable = buildSearchText(m);
        const normalizedSearchable = normalizeSearchText(searchable);
        return queryVariants.some(variant => normalizedSearchable.includes(variant))
          || queryTokens.every(token => normalizedSearchable.includes(token));
      });
    }

    materials = materials.sort((a, b) => {
      const aSubjectRank = subject && a.subject === subject ? 0 : 1;
      const bSubjectRank = subject && b.subject === subject ? 0 : 1;
      const aText = normalizeSearchText(buildSearchText(a));
      const bText = normalizeSearchText(buildSearchText(b));
      const aStartsWith = normalizedQuery && aText.startsWith(normalizedQuery) ? 0 : 1;
      const bStartsWith = normalizedQuery && bText.startsWith(normalizedQuery) ? 0 : 1;
      return aSubjectRank - bSubjectRank || aStartsWith - bStartsWith || a.name.localeCompare(b.name, 'ko');
    });

    return NextResponse.json({ success: true, data: materials.slice(0, 12) });
  } catch (error) {
    console.error('API GET /shared-materials error:', error);
    return NextResponse.json({ success: false, message: '공유 데이터 조회에 실패했습니다.' }, { status: 500 });
  }
}

// 2. 신규 교재/강의 공유 DB에 등록
export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  try {
    const data = await request.json() as Partial<SharedMaterial>;
    if (!data.name || !data.type || !data.subject || !data.totalPagesOrLectures) {
      return NextResponse.json({ success: false, message: '이름, 종류(type), 과목, 분량은 필수 필드입니다.' }, { status: 400 });
    }

    const existingMaterials = await readSharedMaterials();
    const existingMaterial = existingMaterials.find((material) => (
      material.type === data.type
      && normalizeSearchText(material.subject || '') === normalizeSearchText(data.subject || '')
      && normalizeSearchText(material.name || '') === normalizeSearchText(data.name || '')
    ));

    if (existingMaterial) {
      return NextResponse.json({ success: true, data: existingMaterial, duplicate: true });
    }

    const material: SharedMaterial = {
      id: data.id || `mat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: data.type as 'book' | 'lecture',
      name: data.name,
      subject: data.subject,
      publisher: data.publisher || '',
      author: data.author || '',
      totalPagesOrLectures: Number(data.totalPagesOrLectures),
      createdAt: new Date().toISOString()
    };

    const saved = await saveSharedMaterial(material);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('API POST /shared-materials error:', error);
    return NextResponse.json({ success: false, message: '공유 데이터 등록에 실패했습니다.' }, { status: 500 });
  }
}
