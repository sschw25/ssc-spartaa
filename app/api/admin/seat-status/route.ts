import { NextResponse } from 'next/server';
import { getAdminSession, canAdminAccessStudent } from '@/lib/auth';
import { getStudentsSummary } from '@/lib/store';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const VALID_STATUSES = ['normal', 'lounge', 'away', 'unclear', 'packing', 'present', 'absent', 'A'] as const;
type SeatStatus = (typeof VALID_STATUSES)[number];
interface SeatStatusRow {
  date: string;
  seat_key: string;
  status: SeatStatus;
  updated_at: string;
}

function isSeatStatus(value: unknown): value is SeatStatus {
  return typeof value === 'string' && VALID_STATUSES.includes(value as SeatStatus);
}

function isSeatStatusRow(value: unknown): value is SeatStatusRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.date === 'string' &&
    typeof row.seat_key === 'string' &&
    isSeatStatus(row.status) &&
    typeof row.updated_at === 'string'
  );
}

const isSupabaseConfigured = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key);
};

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getLocalFilePath() {
  return path.join(process.cwd(), 'data', 'seat_statuses.json');
}

function readLocalStatuses(): SeatStatusRow[] {
  const p = getLocalFilePath();
  if (!fs.existsSync(p)) return [];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter(isSeatStatusRow) : [];
  } catch {
    return [];
  }
}

function writeLocalStatuses(data: SeatStatusRow[]) {
  const p = getLocalFilePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// seat_key는 "{studentId}:{periodIdx}" 또는 "{studentId}:phone_{block}" — 첫 콜론 앞이 학생 id.
// (lib/absence-stats.ts parseSeatPeriodKey 와 동일한 규칙. studentId엔 콜론이 없다.)
function seatKeyStudentId(seatKey: string): string | null {
  const i = seatKey.indexOf(':');
  return i > 0 ? seatKey.slice(0, i) : null;
}

// 캠퍼스 관리자 세션이 접근 가능한 학생 id 집합. super('all')는 호출하지 않는다.
async function getCampusStudentIdSet(campus: string): Promise<Set<string>> {
  const students = await getStudentsSummary();
  return new Set(students.filter((s) => s.campus === campus).map((s) => s.id));
}

// 단건 쓰기/삭제용 캠퍼스 스코프 검증: seatKey에서 학생 id를 파싱해 기존
// canAdminAccessStudent(students/[id] 라우트들과 동일 패턴)로 확인한다.
// 학생 id를 파싱할 수 없는 키(콜론 없음 — 현행 출결판은 만들지 않음)는 super만 허용.
async function canAccessSeatKey(seatKey: string, sessionCampus: string): Promise<boolean> {
  const studentId = seatKeyStudentId(seatKey);
  if (!studentId) return sessionCampus === 'all';
  return canAdminAccessStudent(studentId);
}

// GET /api/admin/seat-status?date=YYYY-MM-DD
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const statuses: Record<string, SeatStatus> = {};

    if (isSupabaseConfigured()) {
      const { data, error } = await getClient()
        .from('seat_statuses')
        .select('seat_key, status, updated_at')
        .eq('date', date);
      if (error) throw error;

      for (const row of data || []) {
        if (typeof row.seat_key === 'string' && isSeatStatus(row.status)) {
          statuses[row.seat_key] = row.status;
        }
      }
    } else {
      const data = readLocalStatuses();
      const filtered = data.filter((row) => row.date === date);
      for (const row of filtered) {
        statuses[row.seat_key] = row.status;
      }
    }

    // 캠퍼스 관리자는 본인 캠퍼스 소속 학생의 좌석 상태만 조회(super는 전체).
    if (session.campus !== 'all') {
      const allowed = await getCampusStudentIdSet(session.campus);
      for (const key of Object.keys(statuses)) {
        const studentId = seatKeyStudentId(key);
        if (!studentId || !allowed.has(studentId)) delete statuses[key];
      }
    }

    return NextResponse.json({ success: true, statuses });
  } catch (err) {
    console.error('[seat-status GET]', err);
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 });
  }
}

// POST /api/admin/seat-status  body: { date, seatKey, status }
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  let body: { date?: unknown; seatKey?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const date = String(body?.date ?? '').trim();
  const seatKey = String(body?.seatKey ?? '').trim();
  const status = String(body?.status ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!seatKey) {
    return NextResponse.json({ success: false, message: '좌석 키가 필요합니다.' }, { status: 400 });
  }
  if (!isSeatStatus(status)) {
    return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { status: 400 });
  }
  if (!(await canAccessSeatKey(seatKey, session.campus))) {
    return NextResponse.json({ success: false, message: '해당 학생의 좌석 상태를 변경할 권한이 없습니다.' }, { status: 403 });
  }

  try {
    if (isSupabaseConfigured()) {
      const { error } = await getClient()
        .from('seat_statuses')
        .upsert(
          { date, seat_key: seatKey, status, updated_at: new Date().toISOString() },
          { onConflict: 'date,seat_key' }
        );
      if (error) throw error;
    } else {
      const data = readLocalStatuses();
      const idx = data.findIndex((row) => row.date === date && row.seat_key === seatKey);
      const newRow: SeatStatusRow = { date, seat_key: seatKey, status, updated_at: new Date().toISOString() };
      if (idx > -1) {
        data[idx] = newRow;
      } else {
        data.push(newRow);
      }
      writeLocalStatuses(data);
    }
    return NextResponse.json({ success: true, seatKey, status });
  } catch (err) {
    console.error('[seat-status POST]', err);
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 });
  }
}

// DELETE /api/admin/seat-status?date=YYYY-MM-DD&seatKey=optional
export async function DELETE(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const seatKey = searchParams.get('seatKey')?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (seatKey && !(await canAccessSeatKey(seatKey, session.campus))) {
    return NextResponse.json({ success: false, message: '해당 학생의 좌석 상태를 삭제할 권한이 없습니다.' }, { status: 403 });
  }

  try {
    // 날짜 일괄 삭제(seatKey 없음)는 캠퍼스 관리자면 본인 캠퍼스 학생 키로만 제한한다
    // (기존 like '%:%' 는 타 캠퍼스 학생 마크까지 전량 삭제됐음). super는 전체 유지.
    const allowed = !seatKey && session.campus !== 'all' ? await getCampusStudentIdSet(session.campus) : null;

    if (isSupabaseConfigured()) {
      const client = getClient();
      if (seatKey) {
        const { error } = await client.from('seat_statuses').delete().eq('date', date).eq('seat_key', seatKey);
        if (error) throw error;
      } else if (allowed) {
        // 해당 날짜의 키를 조회해 캠퍼스 소속 학생 키만 골라 삭제.
        const { data, error } = await client.from('seat_statuses').select('seat_key').eq('date', date);
        if (error) throw error;
        const targets = (data || [])
          .map((row) => String(row.seat_key ?? ''))
          .filter((key) => {
            const studentId = seatKeyStudentId(key);
            return studentId !== null && allowed.has(studentId);
          });
        if (targets.length > 0) {
          const { error: delError } = await client.from('seat_statuses').delete().eq('date', date).in('seat_key', targets);
          if (delError) throw delError;
        }
      } else {
        const { error } = await client.from('seat_statuses').delete().eq('date', date).like('seat_key', '%:%');
        if (error) throw error;
      }
    } else {
      let data = readLocalStatuses();
      if (seatKey) {
        data = data.filter((row) => !(row.date === date && row.seat_key === seatKey));
      } else if (allowed) {
        data = data.filter((row) => {
          if (row.date !== date) return true;
          const studentId = seatKeyStudentId(row.seat_key);
          return studentId === null || !allowed.has(studentId);
        });
      } else {
        data = data.filter((row) => !(row.date === date && row.seat_key.includes(':')));
      }
      writeLocalStatuses(data);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[seat-status DELETE]', err);
    return NextResponse.json({ success: false, message: '삭제 실패' }, { status: 500 });
  }
}
