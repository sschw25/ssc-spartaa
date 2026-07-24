'use client';

import React from 'react';
import { SeatMoveCard } from '@/components/report/seat-move-card';
import { CouponExchangeCard } from '@/components/report/coupon-exchange-card';
import { MealPlanNotice, type MealPlanWithOrder } from '@/components/report/meal-plan-notice';
import { LeaveRequestSection } from '@/components/report/leave-request-section';
import { Armchair, Calendar, CalendarClock, ClipboardList, GraduationCap, MessageSquare, Ticket, Utensils } from 'lucide-react';
import { LeaveType, MealOrder, Student } from '@/lib/types/student';
import { kstToday } from '@/lib/leave';

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
  // 메시지(채팅) — 기존 건의사항 폼을 대체하는 채팅 패널. learningRequestNode 와 같은 노드 주입 패턴.
  suggestionChatNode?: React.ReactNode;
  chatUnreadCount?: number;
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
  suggestionChatNode,
  chatUnreadCount = 0,
}: ConsultationTabProps) {
  if (!isStudentReport) return null;

  // 서브탭 대기 건수 배지 — 이미 로드된 student 상태만 사용(추가 fetch 없음).
  // 자리이동은 SeatMoveCard 가 자체 fetch(탭 진입 시)라 여기서는 건수를 알 수 없어 배지 제외.
  const badgeToday = kstToday();
  const pendingLeaveCount = (student.leaveRequests || []).filter((r) => r.status === 'pending').length;
  const pendingConsultationCount = (student.consultationBookings || []).filter(
    (b) => b.status === 'booked' && (!b.date || b.date >= badgeToday),
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
    { id: 'suggestion', label: '메시지', meta: '문의·건의 채팅', icon: MessageSquare, badge: chatUnreadCount, badgeLabel: '새 메시지' },
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
              학습신청, 휴식/반차, 상담, 도시락, 자리이동, 쿠폰교환, 메시지를 한곳에서 처리해요.
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

      {/* 휴가/반차/휴식권/병가 신청 — 추출 컴포넌트(채팅 + 메뉴 오버레이와 공용) */}
      {requestSubTab === 'leave' && (
        <LeaveRequestSection
          student={student}
          leaveForm={leaveForm}
          setLeaveForm={setLeaveForm}
          leaveSubmitting={leaveSubmitting}
          leaveError={leaveError}
          submitLeave={submitLeave}
          cancelLeave={cancelLeave}
          reappealLeave={reappealLeave}
          showLeaveHistory={showLeaveHistory}
          setShowLeaveHistory={setShowLeaveHistory}
        />
      )}

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

      {/* 메시지(채팅) — 기존 건의사항 폼 대체. 패널은 page 에서 완성해 노드로 주입 */}
      {requestSubTab === 'suggestion' && suggestionChatNode}
    </section>
    </>
  );
}
