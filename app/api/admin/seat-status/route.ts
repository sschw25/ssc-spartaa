import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const VALID_STATUSES = ['normal', 'lounge', 'away', 'unclear', 'packing', 'present', 'absent'] as const;
type SeatStatus = (typeof VALID_STATUSES)[number];

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// GET /api/admin/seat-status?date=YYYY-MM-DD
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    const { data, error } = await getClient()
      .from('seat_statuses')
      .select('seat_key, status, updated_at')
      .eq('date', date);
    if (error) throw error;

    const statuses: Record<string, SeatStatus> = {};
    for (const row of data || []) {
      statuses[row.seat_key] = row.status as SeatStatus;
    }
    return NextResponse.json({ success: true, statuses });
  } catch (err) {
    console.error('[seat-status GET]', err);
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 });
  }
}

// POST /api/admin/seat-status  body: { date, seatKey, status }
export async function POST(request: Request) {
  if (!(await isAdmin())) {
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
  if (!VALID_STATUSES.includes(status as SeatStatus)) {
    return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { status: 400 });
  }

  try {
    const { error } = await getClient()
      .from('seat_statuses')
      .upsert(
        { date, seat_key: seatKey, status, updated_at: new Date().toISOString() },
        { onConflict: 'date,seat_key' }
      );
    if (error) throw error;
    return NextResponse.json({ success: true, seatKey, status });
  } catch (err) {
    console.error('[seat-status POST]', err);
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 });
  }
}

// DELETE /api/admin/seat-status?date=YYYY-MM-DD&seatKey=optional
export async function DELETE(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const seatKey = searchParams.get('seatKey')?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: '날짜 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  try {
    let query = getClient()
      .from('seat_statuses')
      .delete()
      .eq('date', date);

    query = seatKey ? query.eq('seat_key', seatKey) : query.like('seat_key', '%:%');

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[seat-status DELETE]', err);
    return NextResponse.json({ success: false, message: '삭제 실패' }, { status: 500 });
  }
}
