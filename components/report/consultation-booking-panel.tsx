'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Trash2, CheckCircle2, MessageSquarePlus, Star } from 'lucide-react';
import { WEEKDAY_LABEL, type Weekday } from '@/lib/consultation-schedule';
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
  const history: ConsultationHistoryItem[] = consultationHistory || [];
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [myBooking, setMyBooking] = useState<ConsultationBooking | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 추가·긴급 신청
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraReason, setExtraReason] = useState('');
  const [extraSubmitting, setExtraSubmitting] = useState(false);
  const [extraError, setExtraError] = useState('');
  const [extraSuccess, setExtraSuccess] = useState('');

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

  const selectedDay = calendar.find((d) => d.date === selectedDate) || null;

  const submitBooking = async () => {
    if (!selectedDay || !selectedSlot) return;
    setSubmitting(true);
    setError('');
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
        setError(data?.message || '예약에 실패했어요. 다시 시도해 주세요.');
        await refresh();
      }
    } catch {
      setError('예약에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async () => {
    if (!myBooking) return;
    if (!window.confirm('이 상담 예약을 취소할까요?')) return;
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

  const submitExtra = async () => {
    const reason = extraReason.trim();
    if (!reason) {
      setExtraError('신청 사유를 입력해 주세요.');
      return;
    }
    setExtraSubmitting(true);
    setExtraError('');
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
        setExtraError(data?.message || '신청에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      setExtraError('신청에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setExtraSubmitting(false);
    }
  };

  const hasAnyOpen = calendar.some((d) => !d.full);

  return (
    <div className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
          <CalendarClock className="h-3.5 w-3.5" /> 클리닉 상담 예약
        </div>
        <h4 className="mt-2 flex items-center gap-2 text-sm font-black text-[#0071E3]">
          원하는 날짜·시간을 직접 예약해요
        </h4>
        <p className="mt-1 text-[10px] font-semibold leading-5 text-slate-400">
          이번 주와 다음 주 상담일이 모두 열려 있어요. 날짜를 고르고 원하는 시간을 선택하세요.{' '}
          <span className="inline-flex items-center gap-0.5 text-[#0071E3]"><Star className="h-3 w-3" /> 표시는 부원장 상담일</span>이에요. 한 번에 한 건만 예약할 수 있어요.
        </p>
      </div>

      {/* 왜 상담 예정인지 */}
      {whyConsultation && (
        <div className="rounded-2xl border border-[#0071E3]/15 bg-white px-3.5 py-3 text-[11px] font-semibold leading-5 text-slate-600">
          <span className="font-black text-[#0071E3]">{whyConsultation.subjectName}</span> 과목의{' '}
          <span className="font-black text-slate-800">『{whyConsultation.materialTitle}』</span>{' '}
          {whyConsultation.type === 'book' ? '교재' : '강의'} 학습 계획이{' '}
          <span className="font-black text-slate-800">{whyConsultation.planEndDate}</span>에 끝날 예정이라,
          그 즈음 클리닉 상담이 필요해요.
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-6 text-center text-[11px] font-bold text-slate-400">
          상담 예약 정보를 불러오는 중...
        </div>
      ) : myBooking ? (
        /* 예약 완료 카드 */
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[12px] font-black text-emerald-800">
                  {myBooking.date}({weekdayLabel(myBooking.weekday)}) {myBooking.slot} 예약 완료
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-emerald-700">담당: {myBooking.counselor}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={cancelBooking}
              disabled={submitting}
              className="shrink-0 text-emerald-400 transition-colors hover:text-red-500 disabled:opacity-50"
              aria-label="예약 취소"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] font-semibold text-emerald-700/80">
            시간 변경이 필요하면 예약을 취소한 뒤 다시 예약해 주세요.
          </p>
        </div>
      ) : hasAnyOpen ? (
        /* 캘린더: 날짜 선택 → 시간 선택 */
        <div className="space-y-4">
          {weekGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">{group.label}</p>
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
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                          : active
                          ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40'
                      }`}
                    >
                      {deputy && !day.full && (
                        <Star className="absolute right-1 top-1 h-2.5 w-2.5 fill-current text-[#0071E3]" />
                      )}
                      <span className="text-[12px] font-black">
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
            <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-3">
              <p className="text-[11px] font-black text-slate-700">
                {mdLabel(selectedDay.date)}({weekdayLabel(selectedDay.weekday)}) · 담당 {selectedDay.counselor}
                {isDeputy(selectedDay.counselor) ? ' (부원장 상담)' : ''}
              </p>
              <p className="mt-2 mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">시간 선택</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {selectedDay.freeSlots.map((slot) => {
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40'}`}
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
          {error && <p className="text-[10px] font-bold text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 py-4 text-[11px] font-semibold text-amber-800">
          이번 주와 다음 주 상담이 모두 마감됐어요. 아래 추가·긴급 상담 신청을 이용해 주세요.
        </div>
      )}

      {/* 지난 상담 타임라인 */}
      {history.length > 0 && (
        <div className="border-t border-[#0071E3]/10 pt-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">지난 상담</p>
          {history.map((h) => (
            <div
              key={h.id}
              className={`rounded-2xl border px-3.5 py-3 space-y-1.5 ${
                h.status === 'noshow'
                  ? 'border-rose-200 bg-rose-50/60'
                  : 'border-emerald-200 bg-emerald-50/60'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black ${
                  h.status === 'noshow'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {h.status === 'noshow' ? '미참석' : '완료'}
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
          ))}
        </div>
      )}

      {/* 추가·긴급 상담 신청 */}
      <div className="border-t border-[#0071E3]/10 pt-3">
        {!extraOpen ? (
          <button
            type="button"
            onClick={() => { setExtraOpen(true); setExtraError(''); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-600 transition hover:border-[#0071E3]/40 hover:text-[#0071E3]"
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
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setExtraOpen(false); setExtraError(''); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50"
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
            {extraError && <p className="text-[10px] font-bold text-red-500">{extraError}</p>}
          </div>
        )}
        {extraSuccess && <p className="mt-2 text-[10px] font-bold text-emerald-600">{extraSuccess}</p>}
      </div>
    </div>
  );
}
