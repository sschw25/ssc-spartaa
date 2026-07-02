'use client';

import React from 'react';
import { toast } from 'sonner';
import { usePrompt } from '@/components/ui/confirm-dialog';
import { Calendar, Trash2, MessageSquare } from 'lucide-react';
import { LeaveType, Student } from '@/lib/types/student';
import {
  COUPONS_PER_EXTRA_HALFDAY,
  LEAVE_TYPES,
  LEAVE_TYPE_ORDER,
  LEAVE_SLOT_OPTIONS,
  LEAVE_SLOT_LABELS,
  MONTHLY_FULLDAY_QUOTA,
  MONTHLY_HALFDAY_QUOTA,
  getLeaveTypeLabel,
  formatLeaveLabel,
  leaveNeedsSlot,
  getMonthlyLeaveUsage,
  getLeaveCredits,
  isAutoApprovedLeave,
  kstToday,
  kstYearMonth,
  yearMonthOf,
} from '@/lib/leave';

type LeaveSlotValue = 'morning' | 'afternoon' | 'night' | 'fullday';

interface ConsultationTabProps {
  student: Student;
  isStudentReport: boolean;
  leaveForm: {
    type: LeaveType;
    slot?: LeaveSlotValue;
    date: string;
    reason: string;
  };
  setLeaveForm: React.Dispatch<React.SetStateAction<{ type: LeaveType; slot?: LeaveSlotValue; date: string; reason: string }>>;
  leaveSubmitting: boolean;
  leaveError: string;
  submitLeave: (e: React.FormEvent) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
  reappealLeave: (id: string, note: string) => Promise<boolean>;
  showLeaveHistory: boolean;
  setShowLeaveHistory: (show: boolean) => void;
  suggestionMessage: string;
  setSuggestionMessage: (msg: string) => void;
  suggestionSubmitting: boolean;
  suggestionError: string;
  submitSuggestion: (e: React.FormEvent) => Promise<void>;
  cancelSuggestion: (id: string) => Promise<void>;
  showSuggestionHistory: boolean;
  setShowSuggestionHistory: (show: boolean) => void;
  activeTab: string;
  homeHalfLeft: number;
  homeFullLeft: number;
  homeLeaveCoupons: number;
}

export function ConsultationTab({
  student,
  isStudentReport,
  leaveForm,
  setLeaveForm,
  leaveSubmitting,
  leaveError,
  submitLeave,
  cancelLeave,
  reappealLeave,
  showLeaveHistory,
  setShowLeaveHistory,
  suggestionMessage,
  setSuggestionMessage,
  suggestionSubmitting,
  suggestionError,
  submitSuggestion,
  cancelSuggestion,
  showSuggestionHistory,
  setShowSuggestionHistory,
  activeTab,
  homeHalfLeft,
  homeFullLeft,
  homeLeaveCoupons,
}: ConsultationTabProps) {
  const prompt = usePrompt();
  if (!isStudentReport) return null;

  const getTimelineStatusBadge = (status: string, adminReply?: string, autoApproved?: boolean) => {
    if (status === 'approved') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          {autoApproved ? '⚡ 자동 승인' : '승인'}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-black text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          반려
        </span>
      );
    }
    if (status === 'resolved' || status === 'completed') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          처리완료
        </span>
      );
    }
    if (adminReply && adminReply.trim()) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 px-2.5 py-0.5 text-[10px] font-black text-[#0071E3]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
          처리중
        </span>
      );
    }
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        접수중
      </span>
    );
  };

  return (
    <section id="student-requests" className={`scroll-mt-24 space-y-5 print-card ${activeTab === 'student-requests' ? '' : 'hidden print:block'}`}>
      <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
              <Calendar className="h-3.5 w-3.5" /> 휴식신청
            </div>
            <h3 className="mt-2 text-xl font-black text-slate-900">
              휴식신청 · 건의사항
            </h3>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
              이번달 반차 <span className="font-black text-[#0071E3]">{homeHalfLeft}회</span> · 휴식권 <span className="font-black text-[#0071E3]">{homeFullLeft}회</span> 남음 · 쿠폰 {homeLeaveCoupons}개
            </p>
          </div>
        </div>
      </div>

      {/* 휴가/반차/휴식권/병가 신청 (관리자에게) */}
      {(() => {
        const leaveRequests = student.leaveRequests || [];
        const leaveCoupons = student.leaveCoupons ?? 0;
        const selMonth = yearMonthOf(leaveForm.date) || kstYearMonth();
        const usage = getMonthlyLeaveUsage(leaveRequests, selMonth);
        const credits = getLeaveCredits(student.rewardRedemptions, leaveRequests);
        const halfLeft = Math.max(0, MONTHLY_HALFDAY_QUOTA - usage.halfday);
        const fullLeft = Math.max(0, MONTHLY_FULLDAY_QUOTA - usage.fullday);
        const selCat = LEAVE_TYPES[leaveForm.type]?.category;
        // 추가권(교환 반차권/휴식권)이 남아 있으면 기본 한도를 넘어도 신청 가능
        const overQuota = (selCat === 'halfday' && halfLeft <= 0 && credits.halfday <= 0) || (selCat === 'fullday' && fullLeft <= 0 && credits.fullday <= 0);
        const isSick = selCat === 'sick';
        const [y, m] = selMonth.split('-');
        const monthLabel = `${y}년 ${parseInt(m)}월`;
        const leaveStatusBadge = (s: string, reply?: string, auto?: boolean) => getTimelineStatusBadge(s, reply, auto);
        return (
          <div id="student-leave-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                <Calendar className="w-4 h-4" /> 휴식 · 반차 · 병가 신청
              </h4>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                반차는 잔여 한도 내에서 <span className="font-black text-emerald-600">신청 즉시 자동 승인</span>돼요(아래 내역에서 확인). 휴식권·개인사정·병가는 코멘터 검토 후 승인되며, 병가는 영수증을 밴드 채팅으로 따로 증빙해 주세요.
              </p>
            </div>

            {/* 이번 달(선택일 기준) 잔여 한도 + 병가 사용 + 쿠폰 */}
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">반차 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{halfLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
                {credits.halfday > 0 && <p className="text-[9px] font-black text-amber-600">+{credits.halfday} 추가권</p>}
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">휴식권 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{fullLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
                {credits.fullday > 0 && <p className="text-[9px] font-black text-amber-600">+{credits.fullday} 추가권</p>}
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">병가(이번달)</p>
                <p className="mt-0.5 text-sm font-black text-slate-700">{usage.sick}<span className="text-[10px] font-bold text-slate-400">건</span></p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">쿠폰</p>
                <p className="mt-0.5 text-sm font-black text-slate-700">🎟️ {leaveCoupons}</p>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 -mt-1.5">{monthLabel} 기준 · 병가는 한도 무관(영수증 밴드 증빙) · 반차 추가는 쿠폰 {COUPONS_PER_EXTRA_HALFDAY}개 필요</p>

            {/* 종류 선택 */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LEAVE_TYPE_ORDER.map((t) => {
                const info = LEAVE_TYPES[t];
                const active = leaveForm.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLeaveForm((f) => ({
                      ...f,
                      type: t,
                      // 시간대 선택이 필요한 종류로 바꾸면 기본 시간대(첫 옵션)를 자동 지정, 아니면 해제
                      slot: leaveNeedsSlot(t) ? (LEAVE_SLOT_OPTIONS[t]![0]) : undefined,
                    }))}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] shadow-sm' : 'border-slate-200 bg-white hover:border-[#0071E3]/40'}`}
                  >
                    <span className="text-[12px] font-black text-slate-700">{info?.icon} {info?.label}</span>
                    <span className="text-[10px] font-bold text-slate-400">{info?.slot}</span>
                  </button>
                );
              })}
            </div>

            {/* 시간대 선택 — 개인사정 반차(오전/오후/야간) · 병가(오전/오후/야간/하루종일) */}
            {leaveNeedsSlot(leaveForm.type) && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">시간대 선택</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(LEAVE_SLOT_OPTIONS[leaveForm.type] || []).map((s) => {
                    const sActive = leaveForm.slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLeaveForm((f) => ({ ...f, slot: s }))}
                        className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition active:scale-[0.97] ${sActive ? 'border-[#0071E3] bg-[#0071E3]/[0.06] text-[#0071E3] shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-[#0071E3]/40'}`}
                      >
                        {LEAVE_SLOT_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 날짜 + 사유 */}
            <form onSubmit={submitLeave} className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-[11px] font-black text-slate-500">사용일</label>
                <input
                  type="date"
                  required
                  value={leaveForm.date}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                />
              </div>
              <textarea
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={isSick ? '병가 사유를 적어 주세요. 영수증은 밴드 채팅으로 따로 보내 주세요.' : '사유 (선택) — 예) 병원 진료, 가족 행사'}
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
              />

              {/* 안내/경고 */}
              {isSick && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  🤒 병가는 월 한도와 무관하지만, <b>영수증/진단서를 밴드 채팅으로 반드시 증빙</b>해 주세요.
                </div>
              )}
              {!isSick && overQuota && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  이번 달 {selCat === 'halfday' ? '반차' : '휴식권'}를 모두 사용했어요.
                  {selCat === 'halfday' ? ` 추가가 필요하면 쿠폰 ${COUPONS_PER_EXTRA_HALFDAY}개로 신청 가능합니다 — 밴드 채팅으로 문의 후 쿠폰을 제출해 주세요.` : ' 추가가 필요하면 밴드 채팅으로 문의해 주세요.'}
                </div>
              )}

              <button
                type="submit"
                disabled={leaveSubmitting || (!isSick && overQuota) || !leaveForm.date}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {leaveSubmitting ? '신청 중...' : (!isSick && overQuota) ? '한도 초과 (밴드 채팅 문의)' : `${getLeaveTypeLabel(leaveForm.type)} 신청하기`}
              </button>
              {leaveError && <p className="text-[10px] font-bold text-red-500">{leaveError}</p>}
            </form>

            {(() => {
              const today = kstToday();
              // 날짜(사용일) 기준 분리: 오늘 이후=예정/진행 중, 오늘 이전=지난 내역.
              // 자동 승인된 반차도 사용일이 지나기 전까지는 예정 내역에 그대로 노출되어
              // 학생이 '자동 승인됨'을 바로 확인할 수 있다.
              const upcoming = leaveRequests
                .filter((r) => r.date >= today)
                .sort((a, b) => a.date.localeCompare(b.date));
              const past = leaveRequests
                .filter((r) => r.date < today)
                .sort((a, b) => b.date.localeCompare(a.date));

              const reappealBtn = (r: typeof leaveRequests[number]) => (
                <button
                  type="button"
                  onClick={async () => {
                    const note = await prompt({
                      title: '재승인 요청 사유',
                      description: '코멘터에게 함께 전달됩니다.',
                      placeholder: '예) 병원 예약이 확정되어 증빙을 첨부할 수 있어요.',
                      multiline: true,
                      confirmText: '재승인 요청',
                    });
                    if (note === null) return;
                    const ok = await reappealLeave(r.id, note.trim());
                    if (ok) toast.success('재승인 요청이 접수되었어요.', { description: '코멘터 확인 후 다시 안내드릴게요.' });
                    else toast.error('재승인 요청에 실패했어요. 잠시 후 다시 시도해 주세요.');
                  }}
                  className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black text-amber-700 transition hover:bg-amber-100"
                >
                  ↻ 재승인 요청하기
                </button>
              );

              const renderItem = (r: typeof leaveRequests[number], muted: boolean) => {
                const auto = isAutoApprovedLeave(r);
                return (
                  <div key={r.id} className={`rounded-2xl border border-slate-100 p-3 text-[11px] ${muted ? 'bg-slate-50/50' : 'bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black text-slate-500 ${muted ? 'border border-slate-200 bg-white' : 'bg-slate-100'}`}>{LEAVE_TYPES[r.type]?.icon} {formatLeaveLabel(r.type, r.slot)}</span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                        {leaveStatusBadge(r.status, r.adminReply, auto)}
                      </span>
                      {r.status === 'pending' && (
                        <button type="button" onClick={() => cancelLeave(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="신청 취소">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {r.reason && <p className={`mt-1.5 whitespace-pre-wrap break-words font-semibold ${muted ? 'text-slate-500' : 'text-slate-600'}`}>{r.reason}</p>}
                    {r.adminReply && (
                      <div className={`mt-2 rounded-xl border border-[#0071E3]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3] ${muted ? 'bg-white' : 'bg-[#0071E3]/[0.05]'}`}>
                        코멘터 답변: {r.adminReply}
                      </div>
                    )}
                    {r.status === 'rejected' && reappealBtn(r)}
                  </div>
                );
              };

              return (
                (upcoming.length > 0 || past.length > 0) && (
                  <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 휴가 신청 내역</p>

                    {/* 예정·진행 중 (사용일이 오늘 이후) — 자동 승인된 반차 포함 */}
                    {upcoming.map((r) => renderItem(r, false))}
                    {upcoming.length === 0 && past.length > 0 && (
                      <p className="text-[10px] font-semibold text-slate-400">예정된 휴가 신청이 없어요.</p>
                    )}

                    {/* 지난 휴가 신청 (사용일이 지남) */}
                    {past.length > 0 && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowLeaveHistory(!showLeaveHistory)}
                          className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                        >
                          <span>지난 휴가 신청 보기 ({past.length}건)</span>
                          <span className="text-[10px]">{showLeaveHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                        </button>

                        {showLeaveHistory && (
                          <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                            {past.map((r) => renderItem(r, true))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              );
            })()}
          </div>
        );
      })()}

      {/* 건의사항 (관리자에게) */}
      <div id="student-suggestion-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            <MessageSquare className="w-4 h-4" /> 건의사항
          </h4>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            시설, 운영, 학습 환경에 대한 의견을 남기면 담당 코멘터가 확인해요.
          </p>
        </div>
        <div className="space-y-2">
          <textarea
            value={suggestionMessage}
            onChange={(e) => setSuggestionMessage(e.target.value)}
            placeholder="건의 내용을 적어 주세요. 예) 자습실 조명이 조금 어두워요"
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
          />
          <button
            id="btn-submit-suggestion"
            type="button"
            onClick={submitSuggestion}
            disabled={suggestionSubmitting}
            className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
          >
            {suggestionSubmitting ? '등록 중...' : '건의사항 등록'}
          </button>
          {suggestionError && <p className="text-[10px] font-bold text-red-500">{suggestionError}</p>}
        </div>

        {(() => {
          const suggestions = student.suggestionRequests || [];
          const pending = suggestions.filter(r => r.status !== 'resolved');
          const resolved = suggestions.filter(r => r.status === 'resolved');
          return (
            (pending.length > 0 || resolved.length > 0) && (
              <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 건의사항 내역</p>
                
                {/* 대기중 건의사항 */}
                {pending.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">건의사항</span>
                        {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                      </span>
                      <button type="button" onClick={() => cancelSuggestion(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="건의사항 취소">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.content}</p>
                    {r.adminReply && (
                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                        코멘터 답변: {r.adminReply}
                      </div>
                    )}
                  </div>
                ))}

                {/* 지난 건의 내역 보기 */}
                {resolved.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowSuggestionHistory(!showSuggestionHistory)}
                      className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                    >
                      <span>지난 건의 내역 보기 ({resolved.length}건)</span>
                      <span className="text-[10px]">{showSuggestionHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                    </button>

                    {showSuggestionHistory && (
                      <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                        {resolved.map((r) => (
                          <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 border border-slate-200">건의사항</span>
                                {getTimelineStatusBadge(r.status || 'resolved', r.adminReply)}
                                <span className="shrink-0 text-[10px] font-bold text-slate-400">{r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</span>
                              </span>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500">{r.content}</p>
                            {r.adminReply && (
                              <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                코멘터 답변: {r.adminReply}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          );
        })()}
      </div>
    </section>
  );
}
