import { NextRequest, NextResponse } from 'next/server';
import { getStudentSessionId } from '@/lib/auth';
import { updateStudentById } from '@/lib/store';
import type { BookProgress, ConsultationLog, LectureProgress } from '@/lib/types/student';

// 학생 자료(교재/인강) 이름 변경 — 색상/교시 셀프서비스와 같은 즉시 반영(승인 불필요).
// 진도·계획·시작점 조정 등 모든 참조가 자료 id 기반이라 이름 변경은 데이터에 안전하다
// (벤치마크 집계만 이름 기반 그룹이 바뀌는데, 익명 통계라 무해).
// 변경 사실은 consultationLogs 에 처리완료(resolved) 신청으로 남겨 관리자 인박스 이력에 보인다 — 승인 절차 없음.
export async function POST(req: NextRequest) {
  const studentId = await getStudentSessionId();
  if (!studentId) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { materialType?: unknown; materialId?: unknown; newTitle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const materialType = body?.materialType === 'lecture' ? 'lecture' : body?.materialType === 'book' ? 'book' : null;
  const materialId = typeof body?.materialId === 'string' ? body.materialId : '';
  // 트림 + 연속 공백 정규화, 1~40자만 허용.
  const newTitle = typeof body?.newTitle === 'string' ? body.newTitle.trim().replace(/\s+/g, ' ') : '';

  if (!materialType || !materialId) {
    return NextResponse.json({ success: false, message: '대상 자료 정보가 올바르지 않습니다.' }, { status: 400 });
  }
  if (!newTitle || newTitle.length > 40) {
    return NextResponse.json({ success: false, message: '자료 이름은 1~40자로 입력해 주세요.' }, { status: 400 });
  }

  let errorResponse: NextResponse | null = null;
  const result = await updateStudentById(studentId, (student) => {
    // 대상 자료(최상위 레거시 + subjects) 전부 — 진도 PATCH 경로들과 동일한 매칭 규칙.
    const materials: Array<BookProgress | LectureProgress> = materialType === 'book'
      ? [
          ...((student.books || []).filter((b) => b.id === materialId)),
          ...((student.subjects || []).flatMap((s) => (s.books || []).filter((b) => b.id === materialId))),
        ]
      : [
          ...((student.lectures || []).filter((l) => l.id === materialId)),
          ...((student.subjects || []).flatMap((s) => (s.lectures || []).filter((l) => l.id === materialId))),
        ];
    if (materials.length === 0) {
      errorResponse = NextResponse.json({ success: false, message: '해당 학습 자료를 찾을 수 없습니다.' }, { status: 404 });
      return false;
    }

    const oldTitle = materialType === 'book'
      ? (materials[0] as BookProgress).title
      : (materials[0] as LectureProgress).name;
    if (oldTitle === newTitle) {
      // 변경 없음 — 저장·로그 생략하고 성공으로 응답.
      errorResponse = NextResponse.json({ success: true, title: newTitle });
      return false;
    }

    const nowIso = new Date().toISOString();
    materials.forEach((m) => {
      if (materialType === 'book') (m as BookProgress).title = newTitle;
      else (m as LectureProgress).name = newTitle;
      m.updatedAt = nowIso;
    });

    // 관리자 이력 로그 — 즉시완료(resolved) 신청 형태. 인박스 처리 내역에 기록만 남고 승인 대기는 생기지 않는다.
    const log: ConsultationLog = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
      manager: '🙋 학생 신청',
      content: `자료명 변경(${materialType === 'book' ? '교재' : '인강'}): ${oldTitle} → ${newTitle}`,
      type: 'request',
      requestType: 'etc',
      status: 'resolved',
      createdAt: nowIso,
      resolvedAt: nowIso,
    };
    student.consultationLogs = [...(student.consultationLogs || []), log];
  });

  if (errorResponse) return errorResponse;
  if (result === 'not_found') {
    return NextResponse.json({ success: false, message: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (typeof result === 'string') {
    return NextResponse.json({ success: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' }, { status: 409 });
  }

  return NextResponse.json({ success: true, title: newTitle });
}
