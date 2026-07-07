'use client';

import React from 'react';
import { CalendarDays, AlertTriangle, MessageSquare, Utensils, Bell, ChevronRight, type LucideIcon } from 'lucide-react';
import type { LeaveRequest, MakeupNotice, AwayReplanNotice, ConsultationBooking } from '@/lib/types/student';
import { formatLeaveLabel, getLeaveTypeLabel } from '@/lib/leave';

// 홈 최상단 '확인할 특이사항' 통합 패널.
// 학생이 확인/대응해야 할 신호(휴가·도시락·상담·미응답 요청·주말보강·외출반영)를 한곳에 모은다.
// 데이터는 모두 상위(HomeOverviewTab/page.tsx)에서 계산해 props 로만 전달받는다(이 패널은 조립·렌더 전담).
// 특이사항이 하나도 없으면 null 을 반환해 빈 카드를 만들지 않는다.

type HighlightRow = {
  key: string;
  tone: 'amber' | 'blue';   // amber=대응 필요, blue=정보 안내
  icon: LucideIcon;
  label: string;
  summary?: string;
  actionLabel?: string;
  onClick?: () => void;
};

interface HomeHighlightsPanelProps {
  leaveRequests: LeaveRequest[];
  makeupNotices: MakeupNotice[];        // 이미 최근순으로 추린 목록
  awayReplans: AwayReplanNotice[];      // 이미 최근순으로 추린 목록
  consultationBookings: ConsultationBooking[];
  pendingMealCount: number;
  pendingMockCount: number;
  pendingOtCount: number;
  pendingCampusCount: number;
  pendingSaturdayCount: number;
  openConsultation?: () => void;
  openNotifications?: () => void;
  openLeaveRequests?: () => void;
  openWeeklyPlan?: () => void;
}

// Asia/Seoul 기준 YYYY-MM-DD 날짜 키 (파일 내 다른 날짜 로직과 일관, 자정 경계 안전).
function getSeoulDateKey(): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

// 'YYYY-MM-DD' → 'M월 D일'
function formatMonthDay(dateStr?: string): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

export function HomeHighlightsPanel({
  leaveRequests,
  makeupNotices,
  awayReplans,
  consultationBookings,
  pendingMealCount,
  pendingMockCount,
  pendingOtCount,
  pendingCampusCount,
  pendingSaturdayCount,
  openConsultation,
  openNotifications,
  openLeaveRequests,
  openWeeklyPlan,
}: HomeHighlightsPanelProps) {
  const todayKey = getSeoulDateKey();

  const amberRows: HighlightRow[] = [];
  const blueRows: HighlightRow[] = [];

  // 1. 미응답 응답요청 (모의고사·OT·참여미션·토요증빙) + 도시락 미신청 — 대응 필요(amber)
  if (pendingMealCount > 0) {
    amberRows.push({
      key: 'meal', tone: 'amber', icon: Utensils,
      label: '도시락 신청 마감이 다가와요', summary: `미신청 ${pendingMealCount}건`,
      actionLabel: '신청', onClick: openNotifications,
    });
  }
  if (pendingMockCount > 0) {
    amberRows.push({
      key: 'mock', tone: 'amber', icon: Bell,
      label: '모의고사 응답 요청', summary: `${pendingMockCount}건`,
      actionLabel: '응답', onClick: openNotifications,
    });
  }
  if (pendingOtCount > 0) {
    amberRows.push({
      key: 'ot', tone: 'amber', icon: Bell,
      label: 'OT 참석 응답 요청', summary: `${pendingOtCount}건`,
      actionLabel: '응답', onClick: openNotifications,
    });
  }
  if (pendingCampusCount > 0) {
    amberRows.push({
      key: 'campus', tone: 'amber', icon: Bell,
      label: '참여 미션 응답 요청', summary: `${pendingCampusCount}건`,
      actionLabel: '응답', onClick: openNotifications,
    });
  }
  if (pendingSaturdayCount > 0) {
    amberRows.push({
      key: 'saturday', tone: 'amber', icon: Bell,
      label: '토요일 지각 증빙 요청', summary: `${pendingSaturdayCount}건`,
      actionLabel: '제출', onClick: openNotifications,
    });
  }

  // 2. 휴가 — 반려되어 재신청 가능(amber) + 관리자 답변 도착(amber)
  const rejectedLeaves = leaveRequests.filter((l) => l.status === 'rejected' && !l.reappealedAt).slice(0, 3);
  rejectedLeaves.forEach((l) => {
    amberRows.push({
      key: `leave-rej-${l.id}`, tone: 'amber', icon: AlertTriangle,
      label: `${formatMonthDay(l.date)} ${getLeaveTypeLabel(l.type)} 반려`,
      summary: '다시 신청할 수 있어요', actionLabel: '확인', onClick: openLeaveRequests,
    });
  });
  const repliedLeaves = leaveRequests
    .filter((l) => l.status === 'pending' && !!l.repliedAt && !!l.adminReply)
    .slice(0, 3);
  repliedLeaves.forEach((l) => {
    amberRows.push({
      key: `leave-reply-${l.id}`, tone: 'amber', icon: MessageSquare,
      label: `${getLeaveTypeLabel(l.type)} 신청에 답변이 왔어요`,
      summary: l.adminReply, actionLabel: '보기', onClick: openLeaveRequests,
    });
  });

  // 3. 다가오는 승인 휴가(오늘 이후) — 정보 안내(blue)
  const upcomingLeaves = leaveRequests
    .filter((l) => l.status === 'approved' && l.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  upcomingLeaves.forEach((l) => {
    blueRows.push({
      key: `leave-up-${l.id}`, tone: 'blue', icon: CalendarDays,
      label: `${formatMonthDay(l.date)} ${formatLeaveLabel(l.type, l.slot)} 승인`,
      summary: '다가오는 휴가예요', actionLabel: '보기', onClick: openLeaveRequests,
    });
  });

  // 4. 상담 예약 — 다가오는 정규 예약 / 추가신청 대기(blue)
  const upcomingConsults = consultationBookings
    .filter((b) => b.status === 'booked' && b.kind === 'regular' && b.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 2);
  upcomingConsults.forEach((b) => {
    blueRows.push({
      key: `consult-${b.id}`, tone: 'blue', icon: MessageSquare,
      label: '상담 예약이 있어요',
      summary: `${formatMonthDay(b.date)}${b.slot ? ` ${b.slot}` : ''}`,
      actionLabel: '보기', onClick: openConsultation,
    });
  });
  const waitingExtra = consultationBookings.filter((b) => b.status === 'booked' && b.kind === 'extra');
  if (waitingExtra.length > 0) {
    blueRows.push({
      key: 'consult-extra', tone: 'blue', icon: MessageSquare,
      label: '상담 추가 신청이 대기 중이에요', summary: '관리자 확인을 기다리고 있어요',
      actionLabel: '보기', onClick: openConsultation,
    });
  }

  // 5. 주말 보강 발생(amber) — 기존 홈 알림 카드 흡수
  if (makeupNotices.length > 0) {
    const itemCount = makeupNotices.reduce((acc, n) => acc + n.items.length, 0);
    amberRows.push({
      key: 'makeup', tone: 'amber', icon: AlertTriangle,
      label: '주말 보강 계획이 생겼어요', summary: `보강할 자료 ${itemCount}건`,
      actionLabel: '보기', onClick: openWeeklyPlan,
    });
  }

  // 6. 외출 반영 계획조정(blue) — 기존 홈 알림 카드 흡수
  if (awayReplans.length > 0) {
    const first = awayReplans[0];
    blueRows.push({
      key: 'away', tone: 'blue', icon: CalendarDays,
      label: '외출 반영으로 계획이 조정됐어요',
      summary: `${first.subjectName} ${first.materialTitle}${awayReplans.length > 1 ? ` 외 ${awayReplans.length - 1}건` : ''}`,
      actionLabel: '보기', onClick: openWeeklyPlan,
    });
  }

  const rows = [...amberRows, ...blueRows];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm md:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          확인할 특이사항
        </p>
        <span className="rounded-full bg-slate-50 dark:bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-400 tabular-nums">
          {rows.length}건
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          const toneCircle = row.tone === 'amber'
            ? 'border-amber-200 bg-amber-500/10 text-amber-600 dark:border-amber-500/30 dark:text-amber-400'
            : 'border-[#0071E3]/20 bg-[#0071E3]/[0.08] text-[#0071E3] dark:border-[#0071E3]/30';
          const toneRow = row.tone === 'amber'
            ? 'border-amber-200/70 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/10'
            : 'border-[#0071E3]/15 bg-[#0071E3]/[0.04] dark:border-[#0071E3]/25 dark:bg-[#0071E3]/12';
          const content = (
            <>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${toneCircle}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 break-keep">
                <span className="block text-[12px] font-semibold leading-snug text-slate-800 dark:text-slate-200">
                  {row.label}
                </span>
                {row.summary && (
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {row.summary}
                  </span>
                )}
              </span>
              {row.onClick && row.actionLabel && (
                <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  row.tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-[#0071E3]'
                }`}>
                  {row.actionLabel}
                  <ChevronRight className="h-3 w-3" />
                </span>
              )}
            </>
          );
          return row.onClick ? (
            <button
              key={row.key}
              type="button"
              onClick={row.onClick}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${toneRow}`}
            >
              {content}
            </button>
          ) : (
            <div key={row.key} className={`flex items-center gap-3 rounded-2xl border p-3 ${toneRow}`}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
