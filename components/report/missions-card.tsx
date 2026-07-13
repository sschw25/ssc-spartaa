'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Trophy, Ticket, Loader2, CheckCircle2, CalendarClock, ArrowRight, ChevronRight } from 'lucide-react';

interface Mission {
  id: string;
  name: string;
  period: 'weekly' | 'monthly' | 'event' | 'daily';
  coupons: number;
  describe: string;
  earned: boolean;
  progress: string | null;
}
interface RecentReward { missionName: string; rewardGranted: number; date: string; grantedAt?: string }

// 지급 시각(grantedAt) 우선 표시, 없으면 periodKey(date) 폴백. YYYY-MM-DD 또는 'M월 D일'.
const fmtGrantDate = (r: RecentReward): string => {
  const iso = r.grantedAt || r.date || '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${Number(m[2])}월 ${Number(m[3])}일`;
  return ''; // OT:/EVENT: 등 기간키는 날짜 표시 생략
};
interface MissionsData {
  missions: Mission[];
  coupons: number;
  couponsPerHalfday: number;
  recent: RecentReward[];
}

// 미션 → 관련 화면 딥링크 매핑. tabId 는 학생 리포트의 메인 탭 id 또는 컨테이너 탭으로
// 승격되는 서브탭 id(app/report/[id]/page.tsx applyContainerTab: study-stats→생활,
// execution-plan→학습 등). 매핑이 없는 미션은 기존처럼 일반 카드로 남는다.
const MISSION_TAB_TARGETS: Record<string, string> = {
  daily_pomodoro: 'focus',                  // 하루 뽀모도로 → 집중 탭
  phone_focus_week: 'focus',                // 휴대폰 몰입 루틴 → 집중 탭
  mock_review_complete: 'wrong-note',       // 모의고사 오답분석 → 오답 노트
  weekly_top_rank: 'study-stats',           // 주간 순공 랭킹 → 생활 > 순공 통계
  weekly_growth: 'study-stats',             // 전주 대비 순공 성장 → 생활 > 순공 통계
  weekend_study: 'learning',                // 주말 집중 학습 → 학습 탭
  weekly_plan_completion: 'execution-plan', // 주간 계획 실행률 → 학습 > 학습 계획
  deadline_zero_overdue: 'execution-plan',  // 기간 목표 지연 0건 → 학습 > 학습 계획
  monthly_no_penalty: 'student-penalties',  // 벌점 0점 → 생활 > 벌점
  punctual_checkin: 'attendance-status',    // 정시 등원 → 생활 > 등하원
  ot_attendance: 'calendar',                // OT 참여 → 캘린더
};

// 학생 레이아웃(student-layout.tsx)이 수신하는 탭 이동 전역 이벤트 이름.
// 부모가 onNavigateTab 을 배선하지 않아도 리포트 안에서는 딥링크가 동작하게 하는 폴백 채널.
export const STUDENT_TAB_NAVIGATE_EVENT = 'ssc:navigate-student-tab';

const periodLabel = (p: Mission['period']) => (p === 'weekly' ? '매주' : p === 'monthly' ? '매월' : p === 'daily' ? '매일' : 'OT');
const periodCls = (p: Mission['period']) =>
  p === 'weekly' ? 'bg-[#0071E3]/10 text-[#0071E3]'
  : p === 'monthly' ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'
  : p === 'daily' ? 'bg-emerald-50 text-emerald-600'
  : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400';

// 쿠폰 적립(미션) 현황 카드. 쿠폰 '교환'은 별도 '쿠폰 교환소' 탭으로 분리 — onGoToExchange 로 이동.
// onNavigateTab: 미션 카드 클릭 시 관련 탭으로 딥링크(없으면 전역 이벤트 폴백으로 동작).
export function MissionsCard({ onGoToExchange, onNavigateTab }: { onGoToExchange?: () => void; onNavigateTab?: (tabId: string) => void }) {
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(true);

  // 미션 카드 → 관련 화면 이동. 부모가 onNavigateTab 을 주면 그걸 쓰고,
  // 없으면 학생 레이아웃이 수신하는 전역 이벤트로 폴백한다(추가 배선 없이 동작).
  const goToMissionTab = (tabId: string) => {
    if (onNavigateTab) {
      onNavigateTab(tabId);
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STUDENT_TAB_NAVIGATE_EVENT, { detail: { tabId } }));
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/missions', { credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-black/5 bg-white dark:bg-[#1c1c1e] p-6 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#0071E3]" />
      </div>
    );
  }
  if (!data) return null;

  const toRestRequest = data.couponsPerHalfday > 0 ? Math.floor(data.coupons / data.couponsPerHalfday) : 0;

  return (
    <div className="no-print rounded-xl border border-black/5 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm space-y-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Trophy className="w-4 h-4 text-[#0071E3]" /> 쿠폰 미션
        </h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-3 py-1 text-xs font-semibold text-[#0071E3] shadow-sm">
            <Ticket className="w-3.5 h-3.5" /> 내 쿠폰 {data.coupons}장
          </span>
          {toRestRequest > 0 && (
            <span className="text-[10px] font-semibold text-slate-400">= 반차권 {toRestRequest}회</span>
          )}
        </div>
      </div>

      {data.missions.length > 0 && (
      <p className="text-[11px] font-semibold text-slate-500 -mt-1">
        아래 미션을 달성하면 쿠폰이 자동 적립돼요. 모은 쿠폰은 <b className="text-[#0071E3]">쿠폰 교환소</b>에서 반차권·휴식권·상품권으로 바꿀 수 있어요.
      </p>
      )}

      {data.missions.length > 0 && (
      <div className="space-y-2.5">
        {data.missions.map((m) => {
          const targetTab = MISSION_TAB_TARGETS[m.id];
          const cardCls = `rounded-lg border p-3.5 flex items-start gap-3 ${m.earned ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-white dark:border-white/10 dark:bg-[#1c1c1e]'}`;
          const cardBody = (
            <>
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${m.earned ? 'bg-emerald-100 text-emerald-700' : 'bg-[#0071E3]/10 text-[#0071E3]'}`}>
                {m.earned ? <CheckCircle2 className="w-4 h-4" /> : m.period === 'event' ? <CalendarClock className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{m.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${periodCls(m.period)}`}>{periodLabel(m.period)}</span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] px-1.5 py-0.5 text-[10px] font-semibold">
                    <Ticket className="w-2.5 h-2.5" /> +{m.coupons}
                  </span>
                  {m.earned && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold">
                      <CheckCircle2 className="w-2.5 h-2.5" /> 달성
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-relaxed">{m.describe}</p>
                {!m.earned && m.progress && (
                  <p className="text-[11px] font-semibold text-[#0071E3] mt-1">{m.progress}</p>
                )}
              </div>
            </>
          );
          // 매핑된 미션은 관련 화면으로 이동하는 버튼 카드(눌림 피드백 + chevron 힌트)
          if (targetTab) {
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => goToMissionTab(targetTab)}
                aria-label={`${m.name} — 관련 화면으로 이동`}
                className={`${cardCls} w-full text-left transition active:scale-[0.98] hover:border-[#0071E3]/30`}
              >
                {cardBody}
                <ChevronRight className="w-4 h-4 shrink-0 self-center text-slate-300 dark:text-slate-600" aria-hidden="true" />
              </button>
            );
          }
          return (
            <div key={m.id} className={cardCls}>
              {cardBody}
            </div>
          );
        })}
      </div>
      )}

      {/* 교환소로 이동 */}
      {onGoToExchange && (
        <button
          type="button"
          onClick={onGoToExchange}
          className="flex w-full items-center justify-between rounded-lg border border-[#0071E3]/20 bg-[#0071E3]/[0.04] px-4 py-3 text-left transition active:scale-[0.99] hover:bg-[#0071E3]/[0.08]"
        >
          <span className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[#0071E3]" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">쿠폰 교환소에서 보상 바꾸기</span>
          </span>
          <ArrowRight className="w-4 h-4 text-[#0071E3]" />
        </button>
      )}

      {data.recent.length > 0 && (
        <div className="border-t border-slate-100 dark:border-white/10 pt-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-[#0071E3] uppercase tracking-wider">최근 적립</p>
          {data.recent.filter((r) => r.rewardGranted > 0).slice(0, 4).map((r, i) => {
            const when = fmtGrantDate(r);
            return (
              <div key={i} className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">{r.missionName}</span>
                <span className="text-[#0071E3] font-semibold">+{r.rewardGranted}장</span>
                {when && <span className="ml-auto text-[10px] font-medium text-slate-400 dark:text-slate-500">{when}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
