'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardList, CalendarClock, Calendar, Armchair, UserPlus,
  Utensils, Gift, MessageSquare, CheckCircle2, RefreshCw, ChevronRight, Loader2,
} from 'lucide-react';
import type { Student, SeatMoveRequest, ConsultationBooking } from '@/lib/types/student';

// 오늘의 작업 큐 — 대시보드에서 놓치기 쉬운 "처리 대기" 항목을 유형별로 모아 딥링크한다.
// 휴가/변경/건의/불참/리워드/도시락은 대시보드가 이미 들고 있는 students에서 파생(추가 fetch 없음),
// 자리이동·가입신청·상담예약만 인박스/출결판이 쓰는 기존 API를 그대로 재호출한다. (새 라우트 없음)
interface Props {
  students: Student[];      // 대시보드가 캠퍼스 스코프로 이미 거른 목록
  campusFilter: string;     // 'all' | 'wonju' | 'chuncheon' | 'chungju'
  studentsLoading?: boolean; // 대시보드 학생 로딩 중 — 섣부른 "모두 처리했어요" 방지
}

interface FetchedCounts {
  signup: number;         // 가입신청 대기
  seatMoves: number;      // 자리이동 신청 대기
  consultPending: number; // 상담 추가신청 + 학생 변경요청 대기
  consultToday: number;   // 오늘 예정 상담 (booked)
}

interface QueueRow {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: 'amber' | 'blue';
  icon: React.ComponentType<{ className?: string }>;
}

const CAMPUS_KEYS = ['wonju', 'chuncheon', 'chungju'];

export function WorkQueueWidget({ students, campusFilter, studentsLoading }: Props) {
  const router = useRouter();
  const [fetched, setFetched] = useState<FetchedCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [partialError, setPartialError] = useState(false);

  const campusQuery = CAMPUS_KEYS.includes(campusFilter) ? campusFilter : '';

  const load = useCallback(async () => {
    setLoading(true);
    setPartialError(false);
    const next: FetchedCounts = { signup: 0, seatMoves: 0, consultPending: 0, consultToday: 0 };
    const results = await Promise.allSettled([
      // 1) 가입신청 (인박스와 동일 엔드포인트) — 응답은 세션 스코프, 캠퍼스 필터는 클라이언트에서.
      (async () => {
        const res = await fetch('/api/admin/applications', { cache: 'no-store', credentials: 'same-origin' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error('applications');
        const apps: Array<{ campus?: string }> = json.data || [];
        next.signup = apps.filter((a) => !campusQuery || !a.campus || a.campus === campusQuery).length;
      })(),
      // 2) 자리이동 신청 (출결판 패널과 동일 엔드포인트)
      (async () => {
        const res = await fetch(`/api/admin/seat-moves${campusQuery ? `?campus=${campusQuery}` : ''}`, {
          cache: 'no-store', credentials: 'same-origin',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error('seat-moves');
        const reqs: SeatMoveRequest[] = json.requests || [];
        next.seatMoves = reqs.filter((r) => r.status === 'pending').length;
      })(),
      // 3) 상담예약 (상담 관리 페이지와 동일 엔드포인트) — 대기=추가신청+학생 변경요청, 오늘 예정=booked
      (async () => {
        const res = await fetch(`/api/admin/consultation-bookings${campusQuery ? `?campus=${campusQuery}` : ''}`, {
          cache: 'no-store', credentials: 'same-origin',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw new Error('consultation-bookings');
        const bookings: ConsultationBooking[] = json.bookings || [];
        const today: string = json.today || '';
        next.consultPending = bookings.filter((b) =>
          b.status === 'booked' && (b.kind === 'extra' || (b.kind === 'regular' && b.reschedule?.by === 'student'))
        ).length;
        next.consultToday = bookings.filter((b) =>
          b.status === 'booked' && b.kind === 'regular' && !!today && b.date === today
        ).length;
      })(),
    ]);
    setFetched(next);
    setPartialError(results.some((r) => r.status === 'rejected'));
    setLoading(false);
  }, [campusQuery]);

  useEffect(() => { load(); }, [load]);

  // 대시보드가 이미 로드한 students에서 파생 — 인박스 집계와 동일 판정 기준.
  const derived = useMemo(() => {
    let leave = 0, change = 0, suggestion = 0, absence = 0, reward = 0, mealAdd = 0;
    students.forEach((s) => {
      leave += (s.leaveRequests || []).filter((r) => r.status === 'pending').length;
      change += (s.consultationLogs || []).filter((l) => l.type === 'request' && l.status === 'pending').length;
      suggestion += (s.consultationLogs || []).filter((l) => l.type === 'suggestion' && l.status === 'pending').length;
      absence += (s.otEvents || []).filter((e) => e.status === 'absent_requested').length;
      absence += (s.mockExams || []).filter((e) => e.status === 'absent_requested').length;
      reward += (s.rewardRedemptions || []).filter((r) => r.status === 'requested' || r.status === 'pending').length;
      mealAdd += (s.mealOrders || []).reduce(
        (acc, o) => acc + (o.addRequests || []).filter((r) => r.status === 'pending').length, 0);
    });
    return { leave, change, suggestion, absence, reward, mealAdd };
  }, [students]);

  const rows: QueueRow[] = [
    { key: 'leave', label: '휴가/반차 신청', count: derived.leave, href: '/admin/inbox', tone: 'amber', icon: CalendarClock },
    { key: 'change', label: '학습 변경 요청', count: derived.change, href: '/admin/inbox', tone: 'amber', icon: ClipboardList },
    { key: 'suggestion', label: '건의사항', count: derived.suggestion, href: '/admin/inbox', tone: 'amber', icon: ClipboardList },
    { key: 'absence', label: 'OT·모의고사 불참', count: derived.absence, href: '/admin/inbox', tone: 'amber', icon: CalendarClock },
    { key: 'reward', label: '리워드 요청', count: derived.reward, href: '/admin/inbox', tone: 'amber', icon: Gift },
    { key: 'mealAdd', label: '도시락 추가신청', count: derived.mealAdd, href: '/admin/meals', tone: 'amber', icon: Utensils },
    { key: 'signup', label: '가입신청', count: fetched?.signup ?? 0, href: '/admin/applications', tone: 'amber', icon: UserPlus },
    { key: 'seatMoves', label: '자리이동 신청', count: fetched?.seatMoves ?? 0, href: '/admin/seat-board', tone: 'amber', icon: Armchair },
    { key: 'consultPending', label: '상담예약 대기', count: fetched?.consultPending ?? 0, href: '/admin/consultation-bookings', tone: 'amber', icon: MessageSquare },
    { key: 'consultToday', label: '오늘 상담 예정', count: fetched?.consultToday ?? 0, href: '/admin/consultation-bookings', tone: 'blue', icon: Calendar },
  ];
  const visibleRows = rows.filter((r) => r.count > 0);
  const pendingTotal = rows.filter((r) => r.tone === 'amber').reduce((acc, r) => acc + r.count, 0);
  const initialLoading = (loading && !fetched) || (!!studentsLoading && students.length === 0);
  const allClear = !loading && !initialLoading && visibleRows.length === 0;

  return (
    <div
      id="work-queue"
      className="rounded-3xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.025)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          <ClipboardList className="w-4 h-4 text-[#0071E3]" /> 오늘의 작업 큐
          {!loading && pendingTotal > 0 && (
            <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              대기 {pendingTotal}건
            </span>
          )}
        </h3>
        <button
          onClick={load}
          title="새로고침"
          className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-[#F5F5F7] dark:hover:bg-white/5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {initialLoading ? (
        // 첫 로딩 스켈레톤
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[52px] rounded-2xl bg-black/[0.03] dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : allClear ? (
        <div className="py-8 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">모두 처리했어요</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleRows.map((row) => {
            const Icon = row.icon;
            const amber = row.tone === 'amber';
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => router.push(row.href)}
                className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ${
                  amber
                    ? 'bg-amber-500/[0.07] hover:bg-amber-500/[0.14] dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
                    : 'bg-[#0071E3]/[0.06] hover:bg-[#0071E3]/[0.12] dark:bg-[#0071E3]/10 dark:hover:bg-[#0071E3]/15'
                }`}
              >
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  amber ? 'bg-amber-500/12' : 'bg-[#0071E3]/12'
                }`}>
                  <Icon className={`w-4 h-4 ${amber ? 'text-amber-600 dark:text-amber-400' : 'text-[#0071E3]'}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">{row.label}</span>
                  <span className={`block text-[11px] font-medium ${
                    amber ? 'text-amber-700 dark:text-amber-400' : 'text-[#0071E3]'
                  }`}>
                    {row.count}건 {amber ? '대기' : '예정'}
                  </span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              </button>
            );
          })}
          {loading && (
            <div className="flex items-center justify-center rounded-2xl bg-black/[0.02] dark:bg-white/5 px-3.5 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-[#0071E3]" />
            </div>
          )}
        </div>
      )}

      {partialError && !loading && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-red-500/[0.06] dark:bg-red-500/10 px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
            일부 항목(자리이동·가입·상담)을 불러오지 못했어요.
          </p>
          <button
            type="button"
            onClick={load}
            className="shrink-0 rounded-full bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 transition-colors"
          >
            재시도
          </button>
        </div>
      )}
    </div>
  );
}
