'use client';

import React from 'react';
import { toast } from 'sonner';
import { usePrompt } from '@/components/ui/confirm-dialog';
import { SeatMoveCard } from '@/components/report/seat-move-card';
import { CouponExchangeCard } from '@/components/report/coupon-exchange-card';
import { MealPlanNotice, type MealPlanWithOrder } from '@/components/report/meal-plan-notice';
import { Armchair, Calendar, CalendarClock, ClipboardList, GraduationCap, MessageSquare, Thermometer, Ticket, Trash2, Utensils, Zap } from 'lucide-react';
import { LeaveType, MealOrder, Student } from '@/lib/types/student';
import { LEAVE_TYPE_ICON } from '@/components/leave-type-icon';
import {
  COUPONS_PER_EXTRA_HALFDAY,
  LEAVE_TYPES,
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
  leaveNeedsProof,
  kstToday,
  kstYearMonth,
  yearMonthOf,
} from '@/lib/leave';
import { LeaveProofAttach } from '@/components/report/leave-proof-attach';

type LeaveSlotValue = 'morning' | 'afternoon' | 'night' | 'fullday';
export type ApplicationSubTab = 'learning-request' | 'leave' | 'seat' | 'coupon' | 'suggestion' | 'consultation' | 'meal';

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
  requestSubTab: ApplicationSubTab;
  setRequestSubTab: (tab: ApplicationSubTab) => void;
  consultationAvailable?: boolean;
  homeHalfLeft: number;
  homeFullLeft: number;
  homeLeaveCoupons: number;
  onCouponsChange?: (coupons: number) => void;
  // 도시락 신청 — 홈/알림에 이어 '신청' 탭에서도 신청할 수 있게 서브탭으로 노출.
  mealPlans?: MealPlanWithOrder[];
  onMealSaved?: (planId: string, order: MealOrder) => void;
  pendingMealCount?: number;
  // 학습 관련 요청(LearningRequestPanel) — 과목별 진도 탭에서 이 탭의 '학습신청' 서브탭으로 이동됨.
  // 패널 내부는 그대로 두고, page 에서 완성한 노드를 받아 서브탭에 그대로 렌더한다.
  learningRequestNode?: React.ReactNode;
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
  requestSubTab,
  setRequestSubTab,
  consultationAvailable = false,
  homeHalfLeft,
  homeFullLeft,
  homeLeaveCoupons,
  onCouponsChange,
  mealPlans = [],
  onMealSaved,
  pendingMealCount = 0,
  learningRequestNode,
}: ConsultationTabProps) {
  const prompt = usePrompt();
  if (!isStudentReport) return null;

  const getTimelineStatusBadge = (status: string, adminReply?: string, autoApproved?: boolean) => {
    if (status === 'approved') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          {autoApproved && <Zap className="w-3 h-3" />}
          {autoApproved ? '자동 승인' : '승인'}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          반려
        </span>
      );
    }
    if (status === 'resolved' || status === 'completed') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-white/10 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        접수중
      </span>
    );
  };

  // 서브탭 대기 건수 배지 — 이미 로드된 student 상태만 사용(추가 fetch 없음).
  // 자리이동은 SeatMoveCard 가 자체 fetch(탭 진입 시)라 여기서는 건수를 알 수 없어 배지 제외.
  const badgeToday = kstToday();
  const pendingLeaveCount = (student.leaveRequests || []).filter((r) => r.status === 'pending').length;
  const pendingConsultationCount = (student.consultationBookings || []).filter(
    (b) => b.status === 'booked' && (!b.date || b.date >= badgeToday),
  ).length;
  const pendingSuggestionCount = (student.suggestionRequests || []).filter(
    (r) => r.status !== 'resolved',
  ).length;
  const pendingLearningCount = (student.changeRequests || []).filter((r) => r.status === 'pending').length;

  const applicationTabs: Array<{
    id: ApplicationSubTab;
    label: string;
    meta: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeLabel?: string;
  }> = [
    { id: 'learning-request', label: '학습신청', meta: '진도·계획 요청', icon: GraduationCap, badge: pendingLearningCount, badgeLabel: '대기' },
    { id: 'leave', label: '휴식/반차', meta: `반차 ${homeHalfLeft}회`, icon: Calendar, badge: pendingLeaveCount, badgeLabel: '대기' },
    { id: 'consultation', label: '상담신청', meta: consultationAvailable ? '상담 예약' : '상담 요청', icon: CalendarClock, badge: pendingConsultationCount, badgeLabel: '예정' },
    { id: 'meal', label: '도시락', meta: '주간 신청', icon: Utensils, badge: pendingMealCount, badgeLabel: '미신청' },
    { id: 'seat', label: '자리이동', meta: '좌석 변경', icon: Armchair },
    { id: 'coupon', label: '쿠폰교환', meta: `쿠폰 ${homeLeaveCoupons}장`, icon: Ticket },
    { id: 'suggestion', label: '건의사항', meta: '의견 남기기', icon: MessageSquare, badge: pendingSuggestionCount, badgeLabel: '대기' },
  ];

  return (
    <>
    <section id="student-requests" className={`scroll-mt-24 space-y-5 print-card ${activeTab === 'student-requests' ? '' : 'hidden print:block'}`}>
      <div className="rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
              <ClipboardList className="h-3.5 w-3.5" /> 신청
            </div>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
              신청
            </h3>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
              학습신청, 휴식/반차, 상담, 도시락, 자리이동, 쿠폰교환, 건의사항을 한곳에서 처리해요.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist" aria-label="신청 종류">
          {applicationTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = requestSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRequestSubTab(tab.id)}
                className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                  selected
                    ? 'border-[#0071E3] bg-[#0071E3] text-white shadow-[0_6px_16px_rgba(0,113,227,0.22)]'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-400 shadow-sm hover:border-[#0071E3]/40 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-black">
                    <span className="truncate">{tab.label}</span>
                    {(tab.badge ?? 0) > 0 && (
                      <span
                        className={`inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-black tabular-nums ${
                          selected ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                        }`}
                        aria-label={`${tab.badgeLabel || '대기'} ${tab.badge}건`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </span>
                  <span className={`block truncate text-[10px] font-bold ${selected ? 'text-white/75' : 'text-slate-400 dark:text-slate-400'}`}>{tab.meta}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {requestSubTab === 'consultation' && !consultationAvailable && (
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">상담 신청은 담당 코멘터에게 요청으로 남겨주세요.</p>
          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">현재 캠퍼스는 시간 예약형 상담을 운영하지 않습니다.</p>
        </div>
      )}

      {/* 학습 관련 요청 + 진도 재조정 — 과목별 진도 탭에서 이 서브탭으로 이동됨(패널 내부는 그대로) */}
      {requestSubTab === 'learning-request' && learningRequestNode}

      {/* 휴가/반차/휴식권/병가 신청 (관리자에게) */}
      {requestSubTab === 'leave' && (() => {
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
        const isPersonal = selCat === 'personal_halfday' || selCat === 'personal_fullday';
        const [y, m] = selMonth.split('-');
        const monthLabel = `${y}년 ${parseInt(m)}월`;
        const leaveStatusBadge = (s: string, reply?: string, auto?: boolean) => getTimelineStatusBadge(s, reply, auto);
        return (
          <div id="student-leave-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                <Calendar className="w-4 h-4" /> 휴식 · 반차 · 병가 신청
              </h4>
              <p className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-400">
                반차는 잔여 한도 내에서 <span className="font-black text-emerald-600">신청 즉시 자동 승인</span>돼요(아래 내역에서 확인). 휴식권·개인사정·병가는 코멘터 검토 후 승인돼요. <span className="font-black">병가는 병원·약국 영수증, 개인사정은 사유를 증명할 사진</span>을 신청 후 24시간 이내에 아래 내역에서 첨부해 주세요(코멘터 확인 시 자동 삭제). 쿠폰을 반차권·휴식권으로 교환해 두면 개인사정 대신 반차·휴식권으로 신청해 <span className="font-black">증빙 없이</span> 쉴 수 있어요.
              </p>
            </div>

            {/* 이번 달(선택일 기준) 잔여 한도 + 병가 사용 + 쿠폰 */}
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">반차 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{halfLeft}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
                {credits.halfday > 0 && <p className="text-[9px] font-black text-amber-600">+{credits.halfday} 추가권</p>}
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">휴식권 잔여</p>
                <p className="mt-0.5 text-sm font-black text-[#0071E3]">{fullLeft}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
                {credits.fullday > 0 && <p className="text-[9px] font-black text-amber-600">+{credits.fullday} 추가권</p>}
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">병가(이번달)</p>
                <p className="mt-0.5 text-sm font-black text-slate-700 dark:text-slate-300">{usage.sick}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">건</span></p>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">쿠폰</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-sm font-black text-slate-700 dark:text-slate-300"><Ticket className="w-4 h-4" /> {leaveCoupons}</p>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 -mt-1.5">{monthLabel} 기준 · 병가는 한도 무관(병원·약국 영수증) · 반차 추가는 쿠폰 {COUPONS_PER_EXTRA_HALFDAY}개로 반차권 교환</p>

            {/* 종류 선택 — 승인 방식별로 그룹핑(바로 승인 vs 코멘터 검토)해 학생이 예측 가능하게 */}
            <div className="space-y-3">
              {([
                { title: '바로 승인돼요', hint: '잔여 한도 내 자동 승인', auto: true, types: ['morning', 'afternoon', 'night'] as LeaveType[] },
                { title: '코멘터 검토 후 승인', hint: '휴식권 · 개인사정 · 병가', auto: false, types: ['fullday', 'personal_halfday', 'personal_fullday', 'sick'] as LeaveType[] },
              ]).map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className={`text-[10px] font-black ${group.auto ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>{group.title}</span>
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">{group.hint}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {group.types.map((t) => {
                      const info = LEAVE_TYPES[t];
                      const LeaveIcon = LEAVE_TYPE_ICON[t];
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
                          className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 shadow-sm' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:border-[#0071E3]/40'}`}
                        >
                          <span className="flex items-center gap-1.5 text-[12px] font-black text-slate-700 dark:text-slate-300">
                            <LeaveIcon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#0071E3]' : 'text-slate-400'}`} />
                            {info?.label}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">{info?.slot}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 시간대 선택 — 개인사정 반차(오전/오후/야간) · 병가(오전/오후/야간/하루종일) */}
            {leaveNeedsSlot(leaveForm.type) && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">시간대 선택</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(LEAVE_SLOT_OPTIONS[leaveForm.type] || []).map((s) => {
                    const sActive = leaveForm.slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setLeaveForm((f) => ({ ...f, slot: s }))}
                        className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition active:scale-[0.97] ${sActive ? 'border-[#0071E3] bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 text-[#0071E3] shadow-sm' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-400 hover:border-[#0071E3]/40'}`}
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
                <label className="shrink-0 text-[11px] font-black text-slate-500 dark:text-slate-400">사용일</label>
                <input
                  type="date"
                  required
                  value={leaveForm.date}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                />
              </div>
              <textarea
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={isSick ? '병가 사유를 적어 주세요. 병원·약국 영수증 사진은 신청한 뒤 아래 내역에서 첨부할 수 있어요.' : isPersonal ? '개인사정을 적어 주세요. 사유를 증명할 사진은 신청한 뒤 아래 내역에서 첨부할 수 있어요.' : '사유 (선택) — 예) 병원 진료, 가족 행사'}
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
              />

              {/* 안내/경고 */}
              {isSick && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  <Thermometer className="mr-0.5 inline h-3 w-3 align-[-1.5px]" />병가는 월 한도와 무관해요. 신청한 뒤 <b>아래 내역에서 24시간 이내에 병원·약국 영수증(또는 진단서) 사진을 첨부</b>해 주세요(코멘터 확인 시 자동 삭제).
                </div>
              )}
              {isPersonal && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  개인사정은 신청한 뒤 <b>아래 내역에서 24시간 이내에 사유를 증명할 사진을 첨부</b>해 주세요(코멘터 확인 시 자동 삭제). 쿠폰을 반차권·휴식권으로 교환해 두면, 개인사정 대신 <b>반차·휴식권으로 신청해 증빙 없이</b> 쉴 수 있어요.
                </div>
              )}
              {!isSick && overQuota && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-500/10 px-3 py-2 text-[10px] font-semibold text-amber-800">
                  이번 달 {selCat === 'halfday' ? '반차' : '휴식권'}를 모두 사용했어요.
                  {selCat === 'halfday' ? ` 쿠폰교환소에서 쿠폰 ${COUPONS_PER_EXTRA_HALFDAY}개를 반차권으로 교환하면 여기서 바로 추가 신청할 수 있어요.` : ' 쿠폰교환소에서 쿠폰을 휴식권으로 교환하면 여기서 바로 추가 신청할 수 있어요.'}
                </div>
              )}

              <button
                type="submit"
                disabled={leaveSubmitting || (!isSick && overQuota) || !leaveForm.date}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {leaveSubmitting ? '신청 중...' : (!isSick && overQuota) ? '한도 초과 (쿠폰으로 추가권 교환 필요)' : `${getLeaveTypeLabel(leaveForm.type)} 신청하기`}
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
                  className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-black text-amber-700 transition hover:bg-amber-100 dark:hover:bg-amber-500/20"
                >
                  ↻ 재승인 요청하기
                </button>
              );

              const renderItem = (r: typeof leaveRequests[number], muted: boolean) => {
                const auto = isAutoApprovedLeave(r);
                return (
                  <div key={r.id} className={`rounded-2xl border border-slate-100 dark:border-white/10 p-3 text-[11px] ${muted ? 'bg-slate-50/50 dark:bg-white/5' : 'bg-white dark:bg-[#1c1c1e]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400 ${muted ? 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e]' : 'bg-slate-100 dark:bg-white/10'}`}>
                          {(() => { const HIcon = LEAVE_TYPE_ICON[r.type as LeaveType]; return HIcon ? <HIcon className="h-3 w-3 shrink-0" /> : null; })()}
                          {formatLeaveLabel(r.type, r.slot)}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-500 dark:text-slate-400">{r.date}</span>
                        {leaveStatusBadge(r.status, r.adminReply, auto)}
                      </span>
                      {r.status === 'pending' && (
                        <button type="button" onClick={() => cancelLeave(r.id)} className="shrink-0 text-slate-300 dark:text-slate-600 transition-colors hover:text-red-500" aria-label="신청 취소">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {r.reason && <p className={`mt-1.5 whitespace-pre-wrap break-words font-semibold ${muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>{r.reason}</p>}
                    {r.adminReply && (
                      <div className={`mt-2 rounded-xl border border-[#0071E3]/15 dark:border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3] ${muted ? 'bg-white dark:bg-[#1c1c1e]' : 'bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15'}`}>
                        코멘터 답변: {r.adminReply}
                      </div>
                    )}
                    {/* 병가·개인사정 증빙 — 대기중 건에만 사진 첨부(24h 창). 관리자 확인 시 자동 삭제. */}
                    {r.status === 'pending' && leaveNeedsProof(r.type) && (
                      <LeaveProofAttach leaveId={r.id} createdAt={r.createdAt} initialUploadedAt={r.proofUploadedAt} />
                    )}
                    {r.status === 'rejected' && reappealBtn(r)}
                  </div>
                );
              };

              return (
                (upcoming.length > 0 || past.length > 0) && (
                  <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">내 휴가 신청 내역</p>

                    {/* 예정·진행 중 (사용일이 오늘 이후) — 자동 승인된 반차 포함 */}
                    {upcoming.map((r) => renderItem(r, false))}
                    {upcoming.length === 0 && past.length > 0 && (
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">예정된 휴가 신청이 없어요.</p>
                    )}

                    {/* 지난 휴가 신청 (사용일이 지남) */}
                    {past.length > 0 && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowLeaveHistory(!showLeaveHistory)}
                          className="flex w-full items-center justify-between rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 px-3 py-2 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20"
                        >
                          <span>지난 휴가 신청 보기 ({past.length}건)</span>
                          <span className="text-[10px]">{showLeaveHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                        </button>

                        {showLeaveHistory && (
                          <div className="space-y-2 pl-1 border-l-2 border-slate-100 dark:border-white/10 ml-1">
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

      {/* 자리이동 신청 — 익명 배치도에서 빈자리 선택, 관리자 승인 시 좌석 이동 */}
      {requestSubTab === 'seat' && (
        <SeatMoveCard campus={student.campus} active={activeTab === 'student-requests' && requestSubTab === 'seat'} />
      )}

      {requestSubTab === 'coupon' && (
        <div id="coupon-exchange" className="no-print scroll-mt-24">
          <CouponExchangeCard onCouponsChange={onCouponsChange} />
        </div>
      )}

      {/* 도시락 신청 — 주차/센터별 라운드. 홈·알림 카드와 동일 컴포넌트(MealPlanNotice) 재사용. */}
      {requestSubTab === 'meal' && (
        <div id="meal-order" className="no-print scroll-mt-24 space-y-3">
          {mealPlans.length > 0 && onMealSaved ? (
            <MealPlanNotice plans={mealPlans} onSaved={onMealSaved} />
          ) : (
            <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-6 text-center shadow-sm">
              <Utensils className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">지금 신청할 수 있는 도시락이 없어요</p>
              <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">새로운 주간 도시락 신청이 열리면 여기에서 바로 신청할 수 있어요.</p>
            </div>
          )}
        </div>
      )}

      {/* 건의사항 (관리자에게) */}
      {requestSubTab === 'suggestion' && (
      <div id="student-suggestions" className="space-y-5">
      <div className="rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 shadow-sm md:p-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
          <MessageSquare className="h-3.5 w-3.5" /> 건의사항
        </div>
        <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">건의사항</h3>
        <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
          시설·운영·학습 환경에 대한 의견을 남기면 담당 코멘터가 확인해요.
        </p>
      </div>

      <div id="student-suggestion-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 md:p-6 shadow-sm space-y-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            <MessageSquare className="w-4 h-4" /> 건의 남기기
          </h4>
          <p className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-400">
            구체적으로 적어 주실수록 빠르게 확인하고 반영할 수 있어요.
          </p>
        </div>
        <div className="space-y-2">
          <textarea
            value={suggestionMessage}
            onChange={(e) => setSuggestionMessage(e.target.value)}
            placeholder="건의 내용을 적어 주세요. 예) 자습실 조명이 조금 어두워요"
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
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
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">내 건의사항 내역</p>

                {/* 대기중 건의사항 */}
                {pending.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">건의사항</span>
                        {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                      </span>
                      <button type="button" onClick={() => cancelSuggestion(r.id)} className="shrink-0 text-slate-300 dark:text-slate-600 transition-colors hover:text-red-500" aria-label="건의사항 취소">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600 dark:text-slate-400">{r.content}</p>
                    {r.adminReply && (
                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
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
                      className="flex w-full items-center justify-between rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 px-3 py-2 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20"
                    >
                      <span>지난 건의 내역 보기 ({resolved.length}건)</span>
                      <span className="text-[10px]">{showSuggestionHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                    </button>

                    {showSuggestionHistory && (
                      <div className="space-y-2 pl-1 border-l-2 border-slate-100 dark:border-white/10 ml-1">
                        {resolved.map((r) => (
                          <div key={r.id} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-white dark:bg-[#1c1c1e] px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10">건의사항</span>
                                {getTimelineStatusBadge(r.status || 'resolved', r.adminReply)}
                                <span className="shrink-0 text-[10px] font-bold text-slate-400 dark:text-slate-400">{r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</span>
                              </span>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500 dark:text-slate-400">{r.content}</p>
                            {r.adminReply && (
                              <div className="mt-2 rounded-xl border border-[#0071E3]/15 dark:border-white/10 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
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
      </div>
      )}
    </section>
    </>
  );
}
