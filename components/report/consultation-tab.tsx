'use client';

import React from 'react';
import { Calendar, Trash2, MessageSquare } from 'lucide-react';
import { LeaveType, Student } from '@/lib/types/student';
import {
  COUPONS_PER_EXTRA_HALFDAY,
  LEAVE_TYPES,
  LEAVE_TYPE_ORDER,
  MONTHLY_FULLDAY_QUOTA,
  MONTHLY_HALFDAY_QUOTA,
  getLeaveTypeLabel,
  getMonthlyLeaveUsage,
  kstYearMonth,
  yearMonthOf,
} from '@/lib/leave';

interface ConsultationTabProps {
  student: Student;
  isStudentReport: boolean;
  leaveForm: {
    type: LeaveType;
    date: string;
    reason: string;
  };
  setLeaveForm: React.Dispatch<React.SetStateAction<{ type: LeaveType; date: string; reason: string }>>;
  leaveSubmitting: boolean;
  leaveError: string;
  submitLeave: (e: React.FormEvent) => Promise<void>;
  cancelLeave: (id: string) => Promise<void>;
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
  if (!isStudentReport) return null;

  const getTimelineStatusBadge = (status: string, adminReply?: string) => {
    if (status === 'approved') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          승인
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
              <Calendar className="h-3.5 w-3.5" /> 반차 신청
            </div>
            <h3 className="mt-2 text-xl font-black text-slate-900">
              반차 · 휴가 · 건의사항
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
        const halfLeft = Math.max(0, MONTHLY_HALFDAY_QUOTA - usage.halfday);
        const fullLeft = Math.max(0, MONTHLY_FULLDAY_QUOTA - usage.fullday);
        const selCat = LEAVE_TYPES[leaveForm.type]?.category;
        const overQuota = (selCat === 'halfday' && halfLeft <= 0) || (selCat === 'fullday' && fullLeft <= 0);
        const isSick = selCat === 'sick';
        const monthLabel = selMonth.replace('-', '. ') + '월';
        const leaveStatusBadge = (s: string, reply?: string) => getTimelineStatusBadge(s, reply);
        return (
          <div id="student-leave-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                <Calendar className="w-4 h-4" /> 휴가 · 반차 · 휴식권 신청
              </h4>
              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                신청하면 담당 코치가 검토 후 승인해요. 병가는 영수증을 밴드 채팅으로 따로 증빙해 주세요.
              </p>
            </div>

            {/* 이번 달(선택일 기준) 잔여 한도 + 병가 사용 + 쿠폰 */}
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">반차 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{halfLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">휴식권 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{fullLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">병가(이번달)</p>
                <p className="mt-0.5 text-sm font-black text-slate-700">🤒 {usage.sick}<span className="text-[10px] font-bold text-slate-400">건</span></p>
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
                    onClick={() => setLeaveForm((f) => ({ ...f, type: t }))}
                    className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] shadow-sm' : 'border-slate-200 bg-white hover:border-[#0071E3]/40'}`}
                  >
                    <span className="text-[12px] font-black text-slate-700">{info?.icon} {info?.label}</span>
                    <span className="text-[10px] font-bold text-slate-400">{info?.slot}</span>
                  </button>
                );
              })}
            </div>

            {/* 날짜 + 사유 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="shrink-0 text-[11px] font-black text-slate-500">사용일</label>
                <input
                  type="date"
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
            </div>

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
              type="button"
              onClick={submitLeave}
              disabled={leaveSubmitting || (!isSick && overQuota)}
              className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
            >
              {leaveSubmitting ? '신청 중...' : (!isSick && overQuota) ? '한도 초과 (밴드 채팅 문의)' : `${getLeaveTypeLabel(leaveForm.type)} 신청하기`}
            </button>
            {leaveError && <p className="text-[10px] font-bold text-red-500">{leaveError}</p>}

            {(() => {
              const pending = leaveRequests.filter(r => r.status === 'pending');
              const completed = leaveRequests.filter(r => r.status !== 'pending');
              return (
                (pending.length > 0 || completed.length > 0) && (
                  <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 휴가 신청 내역</p>
                    
                    {/* 대기중 휴가 */}
                    {pending.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{LEAVE_TYPES[r.type]?.icon} {getLeaveTypeLabel(r.type)}</span>
                            <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                            {leaveStatusBadge(r.status, r.adminReply)}
                          </span>
                          <button type="button" onClick={() => cancelLeave(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="신청 취소">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {r.reason && <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.reason}</p>}
                        {r.adminReply && (
                          <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                            💬 코치 답변: {r.adminReply}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 지난 휴가 내역 보기 */}
                    {completed.length > 0 && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowLeaveHistory(!showLeaveHistory)}
                          className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                        >
                          <span>지난 휴가 신청 보기 ({completed.length}건)</span>
                          <span className="text-[10px]">{showLeaveHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                        </button>

                        {showLeaveHistory && (
                          <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                            {completed.map((r) => (
                              <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 border border-slate-200">{LEAVE_TYPES[r.type]?.icon} {getLeaveTypeLabel(r.type)}</span>
                                    <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                                    {leaveStatusBadge(r.status, r.adminReply)}
                                  </span>
                                </div>
                                {r.reason && <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500">{r.reason}</p>}
                                {r.adminReply && (
                                  <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                    💬 코치 답변: {r.adminReply}
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
        );
      })()}

      {/* 건의사항 (관리자에게) */}
      <div id="student-suggestion-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            <MessageSquare className="w-4 h-4" /> 건의사항
          </h4>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            시설, 운영, 학습 환경에 대한 의견을 남기면 담당 코치가 확인해요.
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
                        💬 코치 답변: {r.adminReply}
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
                                💬 코치 답변: {r.adminReply}
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
