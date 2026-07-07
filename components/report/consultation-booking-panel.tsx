'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Trash2, CheckCircle2, MessageSquarePlus, Star, Wifi, UserCog, Clock, AlertTriangle } from 'lucide-react';
import { WEEKDAY_LABEL, type Weekday } from '@/lib/consultation-schedule';
import { CONSULT_SIGNAL, studentFacingConsultReason } from '@/lib/consultation-signals';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { ConsultationBooking } from '@/lib/types/student';

interface CalendarDay {
  date: string;
  weekday: Weekday;
  counselor: string;
  freeSlots: string[];
  takenSlots: string[];
  isToday: boolean;
  full: boolean;
}

interface WhyConsultation {
  subjectName: string;
  materialTitle: string;
  type: 'book' | 'lecture';
  planEndDate: string;
}

interface ConsultationHistoryItem {
  id: string;
  date: string;
  slot: string;
  status: 'done' | 'noshow';
  counselor: string;
  note?: string;
  digest?: { label: string; detail?: string }[];
}

interface ConsultationBookingPanelProps {
  studentId: string;
  campus: string;
  bookings: ConsultationBooking[];
  whyConsultation?: WhyConsultation | null;
  consultationHistory?: ConsultationHistoryItem[];
}

const weekdayLabel = (w?: Weekday) => (w ? WEEKDAY_LABEL[w] : '');
const isDeputy = (counselor: string) => counselor.includes('부원장');
// 'YYYY-MM-DD' → 'M/D'
const mdLabel = (date: string) => {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
};
// 해당 날짜가 속한 주의 월요일(UTC 자정 기준, TZ 무관)
const mondayOf = (date: string) => {
  const dt = new Date(`${date}T00:00:00Z`);
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
};

export function ConsultationBookingPanel({ whyConsultation, consultationHistory }: ConsultationBookingPanelProps) {
  const confirm = useConfirm();
  const history: ConsultationHistoryItem[] = consultationHistory || [];
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [myBooking, setMyBooking] = useState<ConsultationBooking | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 네트워크 오류(재시도 가능)와 서버 거절(슬롯 마감 등)을 구분해 낙관적 복구를 다르게 처리한다.
  const [errorRetryable, setErrorRetryable] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // 시간 변경 요청(reschedule)
  const [rsOpen, setRsOpen] = useState(false);
  const [rsDate, setRsDate] = useState('');
  const [rsSlot, setRsSlot] = useState('');
  const [rsBusy, setRsBusy] = useState(false);
  const [rsError, setRsError] = useState('');
  const [rsErrorRetryable, setRsErrorRetryable] = useState(false);

  // 추가·긴급 신청
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraReason, setExtraReason] = useState('');
  const [extraSubmitting, setExtraSubmitting] = useState(false);
  const [extraError, setExtraError] = useState('');
  const [extraErrorRetryable, setExtraErrorRetryable] = useState(false);
  const [extraSuccess, setExtraSuccess] = useState('');

  const NET_ERROR = '네트워크가 불안정해요. 잠시 후 다시 시도해 주세요.';

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/student/consultation-booking', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success && data?.available) {
        const days: CalendarDay[] = data.calendar ?? [];
        setCalendar(days);
        setMyBooking(data.myBooking ?? null);
        // 선택 날짜 유지(있으면), 없으면 빈 슬롯이 있는 첫 운영일 자동 선택
        setSelectedDate((prev) => {
          if (prev && days.some((d) => d.date === prev && !d.full)) return prev;
          return days.find((d) => !d.full)?.date ?? '';
        });
      } else {
        setCalendar([]);
        setMyBooking(null);
      }
    } catch {
      setError('상담 예약 정보를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 선택 날짜가 바뀌면 슬롯 선택 초기화
  useEffect(() => {
    setSelectedSlot('');
  }, [selectedDate]);

  // 변경요청 날짜가 바뀌면 슬롯 선택 초기화
  useEffect(() => {
    setRsSlot('');
  }, [rsDate]);

  // 이번 주 / 다음 주로 그룹핑
  const weekGroups = useMemo(() => {
    if (calendar.length === 0) return [] as { label: string; days: CalendarDay[] }[];
    // 기준: 첫 운영일이 속한 주를 '이번 주', 그 다음 주를 '다음 주'
    const thisMonday = mondayOf(calendar[0].date);
    const nextMonday = (() => {
      const dt = new Date(`${thisMonday}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + 7);
      return dt.toISOString().slice(0, 10);
    })();
    const thisWeek = calendar.filter((d) => d.date < nextMonday);
    const nextWeek = calendar.filter((d) => d.date >= nextMonday);
    const groups: { label: string; days: CalendarDay[] }[] = [];
    if (thisWeek.length) groups.push({ label: '이번 주', days: thisWeek });
    if (nextWeek.length) groups.push({ label: '다음 주', days: nextWeek });
    return groups;
  }, [calendar]);

  // 요일별 담당자 범례 — "월요일 · 부원장 / 화요일 · 센터장"처럼 상단에 먼저 안내한다.
  // 센터마다 부원장 요일이 다르므로(원주=월, 춘천=수, 충주=목) 캘린더 데이터에서 실제 매핑을 추출한다.
  const counselorLegend = useMemo(() => {
    const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const byWeekday = new Map<Weekday, string>();
    for (const d of calendar) {
      if (!byWeekday.has(d.weekday)) byWeekday.set(d.weekday, d.counselor);
    }
    return order
      .filter((w) => byWeekday.has(w))
      .map((w) => ({ weekday: w, counselor: byWeekday.get(w)!, deputy: isDeputy(byWeekday.get(w)!) }));
  }, [calendar]);

  const selectedDay = calendar.find((d) => d.date === selectedDate) || null;

  const submitBooking = async () => {
    if (!selectedDay || !selectedSlot) return;
    setSubmitting(true);
    setError('');
    setErrorRetryable(false);
    setSuccessMsg('');
    try {
      const res = await fetch('/api/student/consultation-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDay.date, slot: selectedSlot }),
      });
      const data = await res.json();
      if (data?.success) {
        setSuccessMsg('상담 예약이 완료됐어요.');
        setSelectedSlot('');
        await refresh();
      } else {
        // 서버 거절(예: 슬롯 마감) — 최신 가용 슬롯을 다시 불러와 보여준다.
        setError(data?.message || '방금 다른 학생이 예약했어요. 다른 시간을 골라 주세요.');
        setErrorRetryable(false);
        await refresh();
      }
    } catch {
      // 네트워크 오류 — 선택값을 보존하고 refresh하지 않아 즉시 재시도할 수 있게 한다.
      setError(NET_ERROR);
      setErrorRetryable(true);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async () => {
    if (!myBooking) return;
    if (!(await confirm({ title: '이 상담 예약을 취소할까요?', tone: 'danger', confirmText: '예약 취소' }))) return;
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/student/consultation-booking?id=${encodeURIComponent(myBooking.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data?.success) {
        await refresh();
      } else {
        setError(data?.message || '취소에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      setError('취소에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // 변경요청 공통 PATCH 호출
  const sendReschedule = async (payload: Record<string, unknown>) => {
    if (!myBooking) return false;
    setRsBusy(true);
    setRsError('');
    setRsErrorRetryable(false);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/student/consultation-booking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: myBooking.id, ...payload }),
      });
      const data = await res.json();
      if (data?.success) {
        await refresh();
        return true;
      }
      // 서버 거절 — 최신 슬롯을 다시 불러온다(선택값은 사라질 수 있음).
      setRsError(data?.message || '방금 다른 학생이 예약했어요. 다른 시간을 골라 주세요.');
      setRsErrorRetryable(false);
      await refresh();
      return false;
    } catch {
      // 네트워크 오류 — 선택값 보존, refresh하지 않고 재시도 가능 상태 유지.
      setRsError(NET_ERROR);
      setRsErrorRetryable(true);
      return false;
    } finally {
      setRsBusy(false);
    }
  };

  const openReschedule = () => {
    setRsError('');
    setRsSlot('');
    setRsDate((prev) => (prev && calendar.some((d) => d.date === prev && !d.full) ? prev : calendar.find((d) => !d.full)?.date ?? ''));
    setRsOpen(true);
  };

  const submitReschedule = async () => {
    if (!rsDate || !rsSlot) return;
    const ok = await sendReschedule({ action: 'request', date: rsDate, slot: rsSlot });
    if (ok) { setRsOpen(false); setSuccessMsg('시간 변경을 요청했어요. 관리자 승인 후 확정돼요.'); }
  };

  const cancelReschedule = async () => {
    await sendReschedule({ action: 'cancel' });
  };

  const respondAdminReschedule = async (accept: boolean) => {
    const ok = await sendReschedule({ action: accept ? 'approve' : 'reject' });
    if (ok && accept) setSuccessMsg('변경된 시간으로 예약이 확정됐어요.');
  };

  const submitExtra = async () => {
    const reason = extraReason.trim();
    if (!reason) {
      setExtraError('신청 사유를 입력해 주세요.');
      return;
    }
    setExtraSubmitting(true);
    setExtraError('');
    setExtraErrorRetryable(false);
    setExtraSuccess('');
    try {
      const res = await fetch('/api/student/consultation-extra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data?.success) {
        setExtraSuccess('추가·긴급 상담 신청이 접수됐어요. 담당 선생님이 확인 후 연락드릴게요.');
        setExtraReason('');
        setExtraOpen(false);
      } else {
        // 서버 거절 — 입력한 사유는 보존해 그대로 다시 시도할 수 있게 한다.
        setExtraError(data?.message || '신청에 실패했어요. 다시 시도해 주세요.');
        setExtraErrorRetryable(false);
      }
    } catch {
      // 네트워크 오류 — 사유 보존, 재시도 가능 상태 유지.
      setExtraError(NET_ERROR);
      setExtraErrorRetryable(true);
    } finally {
      setExtraSubmitting(false);
    }
  };

  const hasAnyOpen = calendar.some((d) => !d.full);

  // D-1 배너: 내일(KST) 예약이 있으면 표시
  const tomorrowKst = (() => {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const soonBooking =
    myBooking?.status === 'booked' && myBooking.date === tomorrowKst ? myBooking : null;

  return (
    <div className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
      {/* D-1 리마인더 배너 */}
      {soonBooking && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-[12px] font-bold text-sky-800 shadow-sm">
          내일 {soonBooking.slot} 상담이 있어요 ({soonBooking.counselor})
        </div>
      )}
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0071E3]">
          <CalendarClock className="h-3.5 w-3.5" /> 클리닉 상담 예약
        </div>
        <h4 className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#0071E3]">
          원하는 날짜·시간을 직접 예약해요
        </h4>
        <p className="mt-1 text-[10px] font-semibold leading-5 text-slate-400">
          이번 주와 다음 주 상담일이 모두 열려 있어요. 날짜를 고르고 원하는 시간을 선택하세요.{' '}
          <span className="inline-flex items-center gap-0.5 text-[#0071E3]"><Star className="h-3 w-3" /> 표시는 부원장 상담일</span>이에요. 한 번에 한 건만 예약할 수 있어요.
        </p>
        {counselorLegend.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {counselorLegend.map((c) => (
              <span
                key={c.weekday}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                  c.deputy
                    ? 'border-[#0071E3]/25 bg-[#0071E3]/[0.06] text-[#0071E3]'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400'
                }`}
              >
                {c.deputy && <Star className="h-2.5 w-2.5 fill-current" />}
                {WEEKDAY_LABEL[c.weekday]}요일 · {c.counselor}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 왜 상담 예정인지 */}
      {whyConsultation && (
        <div className="rounded-2xl border border-[#0071E3]/15 bg-white px-3.5 py-3 text-[11px] font-semibold leading-5 text-slate-600 dark:bg-[#1c1c1e] dark:text-slate-400">
          <span className="font-semibold text-[#0071E3]">{whyConsultation.subjectName}</span> 과목의{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">『{whyConsultation.materialTitle}』</span>{' '}
          {whyConsultation.type === 'book' ? '교재' : '강의'} 학습 계획이{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">{whyConsultation.planEndDate}</span>에 끝날 예정이라,
          그 즈음 클리닉 상담이 필요해요.
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-6 text-center text-[11px] font-bold text-slate-400 dark:border-white/10 dark:bg-[#1c1c1e]">
          상담 예약 정보를 불러오는 중...
        </div>
      ) : myBooking ? (
        /* 예약 완료 카드 + 시간 변경 흐름 */
        <div className={`rounded-2xl border p-4 ${CONSULT_SIGNAL.confirmed.wrap}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[12px] font-semibold text-emerald-800 break-keep">
                  {myBooking.date}({weekdayLabel(myBooking.weekday)}) {myBooking.slot} 예약 완료
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-emerald-700">담당: {myBooking.counselor}</p>
                {/* E2: 출처 분기 — 관리자가 잡아준 예약이면 안심 톤으로 이중부호화(아이콘+텍스트) */}
                {myBooking.source === 'admin' && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold text-sky-700 break-keep">
                    <UserCog className="h-2.5 w-2.5 shrink-0" /> 선생님이 잡아준 상담이에요
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={cancelBooking}
              disabled={submitting || rsBusy}
              className="shrink-0 text-emerald-400 transition-colors hover:text-red-500 disabled:opacity-50"
              aria-label="예약 취소"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* 관리자가 변경을 제안한 경우 → 학생이 승인/거절 */}
          {myBooking.reschedule?.by === 'admin' ? (
            <div className={`mt-3 rounded-xl border px-3.5 py-3 ${CONSULT_SIGNAL.adminProposed.wrap}`}>
              <p className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold break-keep ${CONSULT_SIGNAL.adminProposed.badge}`}>
                <CalendarClock className="h-2.5 w-2.5 shrink-0" /> {CONSULT_SIGNAL.adminProposed.label}
              </p>
              <p className="mt-1.5 text-[11px] font-bold text-sky-800 break-keep">
                관리자가 시간 변경을 제안했어요
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                {myBooking.date}({weekdayLabel(myBooking.weekday)}) {myBooking.slot}
                {' → '}
                <span className="font-bold text-sky-700">
                  {mdLabel(myBooking.reschedule.date)}({weekdayLabel(myBooking.reschedule.weekday)}) {myBooking.reschedule.slot}
                </span>
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500 break-keep">
                {studentFacingConsultReason(myBooking.reschedule.reason, myBooking.kind)}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => respondAdminReschedule(true)}
                  disabled={rsBusy}
                  className="flex-1 rounded-lg bg-[#0071E3] py-2 text-[11px] font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
                >
                  {rsBusy ? '처리 중...' : '이 시간으로 변경 수락'}
                </button>
                <button
                  type="button"
                  onClick={() => respondAdminReschedule(false)}
                  disabled={rsBusy}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1c1c1e] dark:hover:bg-white/5"
                >
                  거절
                </button>
              </div>
            </div>
          ) : myBooking.reschedule?.by === 'student' ? (
            /* 학생이 변경을 요청한 상태 → 관리자 승인 대기 */
            <div className={`mt-3 rounded-xl border px-3.5 py-3 ${CONSULT_SIGNAL.studentPending.wrap}`}>
              <p className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold break-keep ${CONSULT_SIGNAL.studentPending.badge}`}>
                <Clock className="h-2.5 w-2.5 shrink-0" /> {CONSULT_SIGNAL.studentPending.label}
              </p>
              <p className="mt-1.5 text-[11px] font-bold text-amber-800 break-keep">시간 변경 요청 — 관리자 승인 대기중</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                {myBooking.slot}
                {' → '}
                <span className="font-bold text-amber-700">
                  {mdLabel(myBooking.reschedule.date)}({weekdayLabel(myBooking.reschedule.weekday)}) {myBooking.reschedule.slot}
                </span>
              </p>
              <button
                type="button"
                onClick={cancelReschedule}
                disabled={rsBusy}
                className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1c1c1e] dark:hover:bg-white/5"
              >
                {rsBusy ? '처리 중...' : '요청 취소'}
              </button>
            </div>
          ) : !rsOpen ? (
            /* 변경 진행 없음 → 변경 요청 시작 */
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-emerald-700/80">시간이 안 맞으면 변경을 요청할 수 있어요.</p>
              <button
                type="button"
                onClick={openReschedule}
                disabled={!hasAnyOpen}
                className="shrink-0 rounded-lg border border-[#0071E3]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#0071E3] transition hover:bg-[#0071E3]/[0.04] disabled:opacity-40"
              >
                시간 변경 요청
              </button>
            </div>
          ) : (
            /* 변경 요청 날짜·시간 선택 */
            <div className="mt-3 rounded-xl border border-[#0071E3]/15 bg-white px-3 py-3 space-y-3 dark:bg-[#1c1c1e]">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">변경할 시간 선택</p>
                <button type="button" onClick={() => setRsOpen(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">닫기</button>
              </div>
              {weekGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {group.days.map((day) => {
                      const active = rsDate === day.date;
                      const deputy = isDeputy(day.counselor);
                      return (
                        <button
                          key={day.date}
                          type="button"
                          disabled={day.full}
                          onClick={() => setRsDate(day.date)}
                          className={`relative flex flex-col items-center rounded-xl border px-1.5 py-2 transition active:scale-[0.97] ${
                            day.full
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 dark:border-white/10 dark:bg-white/5'
                              : active
                              ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400'
                          }`}
                        >
                          {deputy && !day.full && (
                            <Star className="absolute right-1 top-1 h-2.5 w-2.5 fill-current text-[#0071E3]" />
                          )}
                          <span className="text-[12px] font-semibold">{mdLabel(day.date)}({weekdayLabel(day.weekday)})</span>
                          <span className="text-[9px] font-bold">{day.counselor}</span>
                          <span className={`mt-0.5 text-[9px] font-bold ${day.full ? 'text-slate-300' : 'text-emerald-600'}`}>
                            {day.full ? '마감' : `${day.freeSlots.length}자리`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(() => {
                const rsDay = calendar.find((d) => d.date === rsDate);
                if (!rsDay || rsDay.full) return null;
                return (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">시간 선택</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {rsDay.freeSlots.map((slot) => {
                        const active = rsSlot === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setRsSlot(slot)}
                            className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400'}`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={submitReschedule}
                disabled={rsBusy || !rsDate || !rsSlot}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {rsBusy ? '요청 중...' : rsSlot ? `${mdLabel(rsDate)} ${rsSlot}로 변경 요청` : '시간을 선택해 주세요'}
              </button>
            </div>
          )}
          {rsError && (
            <p className={`mt-2 flex items-center gap-1 text-[10px] font-bold break-keep ${rsErrorRetryable ? 'text-amber-600' : 'text-rose-500'}`}>
              {rsErrorRetryable && <Wifi className="h-3 w-3 shrink-0" />}
              {rsError}
            </p>
          )}
          {successMsg && <p className="mt-2 text-[10px] font-bold text-emerald-600">{successMsg}</p>}
        </div>
      ) : hasAnyOpen ? (
        /* 캘린더: 날짜 선택 → 시간 선택 */
        <div className="space-y-4">
          {weekGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {group.days.map((day) => {
                  const active = selectedDate === day.date;
                  const deputy = isDeputy(day.counselor);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={day.full}
                      onClick={() => setSelectedDate(day.date)}
                      className={`relative flex flex-col items-center rounded-xl border px-1.5 py-2 transition active:scale-[0.97] ${
                        day.full
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 dark:border-white/10 dark:bg-white/5'
                          : active
                          ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400'
                      }`}
                    >
                      {deputy && !day.full && (
                        <Star className="absolute right-1 top-1 h-2.5 w-2.5 fill-current text-[#0071E3]" />
                      )}
                      <span className="text-[12px] font-semibold">
                        {mdLabel(day.date)}({weekdayLabel(day.weekday)})
                      </span>
                      <span className="text-[9px] font-bold">{day.counselor}</span>
                      <span className={`mt-0.5 text-[9px] font-bold ${day.full ? 'text-slate-300' : 'text-emerald-600'}`}>
                        {day.full ? '마감' : `${day.freeSlots.length}자리`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedDay && !selectedDay.full && (
            <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-[#1c1c1e]">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {mdLabel(selectedDay.date)}({weekdayLabel(selectedDay.weekday)}) · 담당 {selectedDay.counselor}
                {isDeputy(selectedDay.counselor) ? ' (부원장 상담)' : ''}
              </p>
              <p className="mt-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">시간 선택</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {selectedDay.freeSlots.map((slot) => {
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400'}`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={submitBooking}
                disabled={submitting || !selectedSlot}
                className="mt-3 w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {submitting
                  ? '예약 중...'
                  : selectedSlot
                  ? `${mdLabel(selectedDay.date)}(${weekdayLabel(selectedDay.weekday)}) ${selectedSlot} 상담 신청하기`
                  : '시간을 선택해 주세요'}
              </button>
            </div>
          )}
          {successMsg && <p className="text-[10px] font-bold text-emerald-600">{successMsg}</p>}
          {error && (
            <p className={`flex items-center gap-1 text-[10px] font-bold break-keep ${errorRetryable ? 'text-amber-600' : 'text-rose-500'}`}>
              {errorRetryable && <Wifi className="h-3 w-3 shrink-0" />}
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/10 px-3.5 py-4 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
          이번 주와 다음 주 상담이 모두 마감됐어요. 아래 추가·긴급 상담 신청을 이용해 주세요.
        </div>
      )}

      {/* 지난 상담 타임라인 */}
      {history.length > 0 && (
        <div className="border-t border-[#0071E3]/10 pt-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">지난 상담</p>
          {history.map((h) => {
            const sig = h.status === 'noshow' ? CONSULT_SIGNAL.noshow : CONSULT_SIGNAL.done;
            return (
            <div
              key={h.id}
              className={`rounded-2xl border px-3.5 py-3 space-y-1.5 ${sig.wrap}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold break-keep ${sig.badge}`}>
                  {h.status === 'noshow' ? <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> : <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                  {sig.label}
                </span>
                <span className="text-[11px] font-bold text-slate-700">
                  {h.date} {h.slot}
                </span>
                {h.counselor && (
                  <span className="text-[10px] font-semibold text-slate-400">{h.counselor}</span>
                )}
              </div>
              {h.note && (
                <p className="text-[11px] font-semibold text-slate-700 leading-5">{h.note}</p>
              )}
              {Array.isArray(h.digest) && h.digest.length > 0 && (
                <ul className="space-y-0.5 mt-1">
                  {h.digest.map((d, i) => (
                    <li key={i} className="text-[10px] font-semibold text-slate-500 leading-4">
                      · {d.label}{d.detail ? ` (${d.detail})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* 추가·긴급 상담 신청 */}
      <div className="border-t border-[#0071E3]/10 pt-3">
        {!extraOpen ? (
          <button
            type="button"
            onClick={() => { setExtraOpen(true); setExtraError(''); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-400"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> 추가·긴급 상담 신청
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400">
              슬롯이 모두 찼거나 급한 사정이 있을 때 신청해요. 담당 선생님이 직접 확인 후 일정을 조율해요.
            </p>
            <textarea
              value={extraReason}
              onChange={(e) => setExtraReason(e.target.value)}
              placeholder="신청 사유를 적어 주세요. 예) 모의고사 결과 상담이 급해요"
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-slate-200 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setExtraOpen(false); setExtraError(''); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#1c1c1e] dark:hover:bg-white/5"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={submitExtra}
                disabled={extraSubmitting}
                className="flex-1 rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {extraSubmitting ? '신청 중...' : '추가·긴급 상담 신청하기'}
              </button>
            </div>
            {extraError && (
              <p className={`flex items-center gap-1 text-[10px] font-bold break-keep ${extraErrorRetryable ? 'text-amber-600' : 'text-rose-500'}`}>
                {extraErrorRetryable && <Wifi className="h-3 w-3 shrink-0" />}
                {extraError}
              </p>
            )}
          </div>
        )}
        {extraSuccess && <p className="mt-2 text-[10px] font-bold text-emerald-600">{extraSuccess}</p>}
      </div>
    </div>
  );
}
