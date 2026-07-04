'use client';

import React from 'react';
import { BookOpen, Tv, FileText, Pencil, MessageSquare, CheckCircle2, Clock } from 'lucide-react';
import { Student, DetailedPlan } from '@/lib/types/student';
import {
  MaterialBenchmarkMap,
  formatPaceComparison,
  getMaterialBenchmark,
  getMaterialDailyPace,
} from '@/lib/material-benchmark';
import { getExpectedFromPlans, getLeaveDates, getLeaveExemptions, getMakeupAmount, toDateKey, isStudyDay } from '@/lib/progress-plan';
import { canCarryLeaveType, hasCarryoverInRealWeek, weekKeyOf, CARRYOVER_COUPON_COST, formatCarryoverMessage } from '@/lib/makeup-carryover';
import { kstToday } from '@/lib/leave';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { BenchmarkSection } from '@/components/learning/benchmark-section';

// 과목별 진도 입력 히트맵 — 최근 35일. 파랑=입력한 날 / 옅은칸=학습일·미입력 / 점=비학습일·휴가일.
function InputHeatmap({ inputLog, studyDays, leaveDates }: { inputLog?: string[]; studyDays?: string[]; leaveDates: Set<string> }) {
  const done = new Set(inputLog || []);
  const cells: { key: string; state: 'done' | 'miss' | 'off' }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toDateKey(d);
    const off = !isStudyDay(d, studyDays) || leaveDates.has(key);
    const state = done.has(key) ? 'done' : off ? 'off' : 'miss';
    cells.push({ key, state });
  }
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-400">
        진도 입력 최근 5주
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#0071E3]" /> 입력</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-slate-100 dark:bg-white/10" /> 미입력</span>
      </p>
      <div className="flex flex-wrap gap-[3px]" aria-label="진도 입력 히트맵">
        {cells.map((c) => (
          <span
            key={c.key}
            title={`${c.key} · ${c.state === 'done' ? '입력함' : c.state === 'miss' ? '미입력' : '비학습/휴가'}`}
            className={
              c.state === 'done'
                ? 'h-3 w-3 rounded-[3px] bg-[#0071E3]'
                : c.state === 'miss'
                ? 'h-3 w-3 rounded-[3px] bg-slate-100 dark:bg-white/10'
                : 'h-3 w-3 rounded-[3px] bg-transparent ring-1 ring-inset ring-slate-100 dark:ring-white/10'
            }
          />
        ))}
      </div>
    </div>
  );
}

interface SubjectProgressTabProps {
  student: Student;
  isStudentReport: boolean;
  updateProgress: (materialType: 'book' | 'lecture', materialId: string, value: number) => void;
  updateBookSolvedQuestions: (materialId: string, solvedQuestions: number) => void;
  incrementBookIncorrectTag: (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined) => void;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string) => void;
  materialBenchmarks: MaterialBenchmarkMap;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function SubjectProgressTab({
  student,
  isStudentReport,
  updateProgress,
  updateBookSolvedQuestions,
  incrementBookIncorrectTag,
  updatePlanCompletion,
  materialBenchmarks,
  activeTab,
  setActiveTab,
}: SubjectProgressTabProps) {
  const [pendingPlanKey, setPendingPlanKey] = React.useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = React.useState(0);
  // 휴가일 집합(히트맵 off 칸 + 보강량 계산). 학생당 1회.
  const leaveDates = React.useMemo(() => getLeaveDates(student), [student]);
  // 슬롯-특정 부분면제(반차는 그 슬롯만) — 보강량 계산에 사용.
  const leaveExemptions = React.useMemo(() => getLeaveExemptions(student), [student]);

  // ── 보강 이월(다음 주로, 쿠폰 소모) ──
  const confirmDialog = useConfirm();
  const [carrying, setCarrying] = React.useState(false);
  const thisWeek = weekKeyOf(kstToday());
  // 이번 주에 발생한, 이월 가능한(반차/휴식권) 승인 휴가 하나(이월 근거).
  const deferLeave = React.useMemo(
    () => (student.leaveRequests || []).find((r) => r.status === 'approved' && canCarryLeaveType(r.type) && weekKeyOf(r.date) === thisWeek),
    [student.leaveRequests, thisWeek],
  );
  const alreadyCarried = hasCarryoverInRealWeek(student.makeupCarryovers, thisWeek);
  const coupons = student.leaveCoupons ?? 0;

  const handleCarryover = async (subjectId: string, materialId: string, materialType: 'book' | 'lecture', amount: number, unit: string) => {
    if (!deferLeave || carrying) return;
    const ok = await confirmDialog({
      title: '이번 주 보강을 다음 주로 이월할까요?',
      description: `이월권 ${CARRYOVER_COUPON_COST}장을 사용해 보강 ${amount}${unit}을 다음 주로 넘깁니다. (주 1회)`,
      confirmText: '이월하기',
    });
    if (!ok) return;
    setCarrying(true);
    try {
      const res = await fetch('/api/student/makeup/carryover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ leaveId: deferLeave.id, subjectId, materialId, materialType, amount }),
      });
      const j = await res.json();
      if (res.ok && j.success) {
        toast.success(j.message || '다음 주로 이월했어요.');
        setTimeout(() => window.location.reload(), 900);
      } else {
        toast.error(j.message || '이월에 실패했어요.');
      }
    } catch {
      toast.error('네트워크 오류로 이월에 실패했어요.');
    } finally {
      setCarrying(false);
    }
  };

  // 보강 배지 아래 이월 버튼 + 이월 내역(자료별). book/lecture 공용.
  const renderCarryoverUI = (subjectId: string, materialId: string, materialType: 'book' | 'lecture', makeupTotal: number, unit: string) => {
    const mine = (student.makeupCarryovers || []).filter((c) => c.materialId === materialId);
    const canOffer = isStudentReport && makeupTotal > 0 && !!deferLeave && !alreadyCarried && coupons >= CARRYOVER_COUPON_COST;
    if (!canOffer && mine.length === 0) return null;
    return (
      <div className="mt-1.5 space-y-1">
        {canOffer && (
          <button
            type="button"
            disabled={carrying}
            onClick={() => handleCarryover(subjectId, materialId, materialType, makeupTotal, unit)}
            className="inline-flex items-center gap-1 rounded-full border border-[#0071E3]/25 bg-[#0071E3]/[0.06] px-2.5 py-1 text-[11px] font-bold text-[#0071E3] transition hover:bg-[#0071E3]/10 disabled:opacity-50 dark:border-[#0071E3]/30 dark:bg-[#0071E3]/10"
          >
            다음 주로 이월 (이월권 {CARRYOVER_COUPON_COST})
          </button>
        )}
        {mine.map((c) => (
          <p key={c.id} className="text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
            ↪ {formatCarryoverMessage(c)}
          </p>
        ))}
      </div>
    );
  };

  const getSeoulDateKey = () =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

  const todayKey = getSeoulDateKey();

  const getPlanActionKey = (materialType: 'book' | 'lecture', materialId: string, planId: string) =>
    `${materialType}:${materialId}:${planId}`;

  const getPlanDailyAmount = (plan: DetailedPlan) =>
    Math.max(0, Math.round(plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6)));

  const getPlanTodayCompletion = (plan: DetailedPlan) => plan.dailyCompletions?.[todayKey];

  const getDisplayUnit = (materialType: 'book' | 'lecture', unit: string | undefined, rangeText: string) => {
    if (materialType === 'lecture') return '강';
    if (unit) return unit;
    if (rangeText.includes('문제')) return '문제';
    if (rangeText.includes('회')) return '회';
    return 'p';
  };

  const startPlanCompletion = (materialType: 'book' | 'lecture', materialId: string, plan: DetailedPlan) => {
    setPendingPlanKey(getPlanActionKey(materialType, materialId, plan.id));
    setPendingAmount(getPlanDailyAmount(plan));
  };

  const cancelPlanCompletion = () => {
    setPendingPlanKey(null);
    setPendingAmount(0);
  };

  // 오늘 기준 1개월치 상세 계획 필터링 (지난 1주 ~ 향후 3주, 약 4~5주 분량)
  // 기간 목표(periodType) plan 은 주간 스케줄 카드로 노출하지 않는다(미션탭 전용 입력 UI 사용).
  // 여기서 탭 완료 처리되면 dailyCompletions 이중기록·완료 해제 시 actualAmount(누적 진행) 소실 위험.
  const getOneMonthPlans = (plans: DetailedPlan[] | undefined) => {
    const dailyPlans = (plans || []).filter(plan => !plan.periodType);
    if (dailyPlans.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startLimit = new Date(today);
    startLimit.setDate(today.getDate() - 7);
    const endLimit = new Date(today);
    endLimit.setDate(today.getDate() + 24);

    const filtered = dailyPlans.filter(plan => {
      const pStart = new Date(plan.startDate);
      const pEnd = new Date(plan.endDate);
      pStart.setHours(0, 0, 0, 0);
      pEnd.setHours(0, 0, 0, 0);
      return pStart <= endLimit && pEnd >= startLimit;
    });

    if (filtered.length === 0) {
      return dailyPlans.slice(-4);
    }
    return filtered;
  };

  const getCompletedDailyEntries = (plan: DetailedPlan) =>
    Object.values(plan.dailyCompletions || {}).filter((item) => item?.isCompleted);

  const getPlanActualAmount = (plan: DetailedPlan) => {
    const dailyTotal = getCompletedDailyEntries(plan).reduce((sum, item) => {
      const actualAmount = typeof item.actualAmount === 'number' ? item.actualAmount : 0;
      return sum + actualAmount;
    }, 0);
    return dailyTotal > 0 ? dailyTotal : plan.actualAmount;
  };

  const isPlanCompleted = (plan: DetailedPlan) => {
    if (plan.isCompleted) return true;
    const completedDays = getCompletedDailyEntries(plan);
    if (completedDays.length === 0) return false;
    const actualAmount = getPlanActualAmount(plan);
    return plan.targetAmount > 0 && typeof actualAmount === 'number'
      ? actualAmount >= plan.targetAmount
      : true;
  };

  // 관리자 대시보드(lib/progress-plan.ts)와 동일한 엔진으로 두 기준을 구한다.
  //  - expectedByStart: 오늘 시작 시점까지(전날까지) 끝냈어야 할 누적량
  //  - expectedByEnd:   오늘 종료 시점까지(오늘치 포함) 끝냈어야 할 누적량
  // 오늘 할당량 범위 안에서 학습 중이면 '계획대로 진행중', 그보다 많으면 '빠름',
  // 전날까지 목표(expectedByStart)에도 못 미치면 진짜 뒤처진 것 → '느림'.
  const getPlanStatus = (current: number, plans?: DetailedPlan[], studyDays?: string[]) => {
    // 계획이 아예 없는 자료 = 목표 미설정. 판정(빠름/느림) 대신 중립 뱃지로 안내한다.
    if (!plans || plans.length === 0) return '목표 미설정';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expectedByStart = getExpectedFromPlans(plans, today, studyDays, student.createdAt);
    const expectedByEnd = getExpectedFromPlans(plans, today, studyDays, student.createdAt, true);
    if (expectedByStart === null || expectedByEnd === null) return null;
    if (current > expectedByEnd) return '계획보다 빠름';
    if (current >= expectedByStart) return '계획대로 진행중';
    return current === 0 ? '진도 정체' : '계획보다 느림';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '계획보다 빠름':
        return 'bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/20 dark:border-white/10';
      case '계획대로 진행중':
      case '계획대로 진행':
        return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:border-white/10';
      case '계획보다 느림':
        return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200 dark:border-white/10';
      case '진도 정체':
        return 'bg-red-50 dark:bg-red-500/10 text-red-700 border-red-200 dark:border-white/10';
      case '목표 미설정':
        return 'bg-[#F5F5F7] dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.06] dark:border-white/10 break-keep';
      default:
        return 'bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10';
    }
  };

  return (
    <div id="subject-progress" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'subject-progress' ? '' : 'hidden print:block'}`}>
      <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-widest uppercase flex items-center gap-2">
        <FileText className="w-4 h-4 text-[#0071E3]" />
        {isStudentReport ? '과목별 상세 학습 목표 및 주간 달성 스케줄러' : '과목별 학습 진도율 요약'}
      </h3>

      {isStudentReport && (() => {
        const allBooks = (student.subjects || []).flatMap((s) => s.books || []);
        const allLectures = (student.subjects || []).flatMap((s) => s.lectures || []);
        const pcts = [
          ...allBooks.map((b) => (b.totalPages > 0 ? Math.min(1, (b.currentPage || 0) / b.totalPages) : 0)),
          ...allLectures.map((l) => (l.totalLectures > 0 ? Math.min(1, (l.completedLectures || 0) / l.totalLectures) : 0)),
        ];
        const total = pcts.length;
        if (total === 0) return null;
        const overall = Math.round((pcts.reduce((a, b) => a + b, 0) / total) * 100);
        const done = pcts.filter((p) => p >= 1).length;

        const allBooksCount = allBooks.length;
        const allLecturesCount = allLectures.length;
        const currentPages = allBooks.reduce((sum, b) => sum + (b.currentPage || 0), 0);

        // #15 — 강의:자습 비율을 점수화(부족/양호/적정)하지 않는다. 강의 비중이 높은 시기엔
        // 자습 비중이 낮은 게 자연스럽다. 단순히 "교재(문제풀이) 진행률"을 중립적으로 시각화.
        const totalBookPages = allBooks.reduce((sum, b) => sum + (b.totalPages || 0), 0);
        const selfStudyPct = totalBookPages > 0 ? Math.round((currentPages / totalBookPages) * 100) : 0;
        const paceColor = '#0071E3';

        return (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-5 md:p-6 shadow-sm space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">전체 학습 진도</p>
                  <p className="mt-1 text-[18px] font-semibold tracking-tight text-[#0071E3]">{overall}<span className="text-[12px] font-medium ml-0.5">%</span></p>
                </div>
                <p className="text-[10px] font-bold text-slate-400">교재·인강 {total}개 중 <span className="font-black text-emerald-600">{done}개</span> 완료</p>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${overall}%` }} />
              </div>
            </div>

            {/* 🔵 Phase 0: 교재 vs 인강 비율 도넛 및 문제 풀이 Pace 도넛 차트 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. 교재 vs 인강 비율 도넛 */}
              {(() => {
                const total = (allBooksCount || 0) + (allLecturesCount || 0);
                const bookPct = total > 0 ? allBooksCount / total : 0.5;
                const DR = 40; const DC = 2 * Math.PI * DR;
                const bookDash = bookPct * DC;
                return (
                  <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm flex flex-col gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">교재 vs 인강 비중</p>
                      <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">학습 포트폴리오 내 자료 비율</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r={DR} fill="none" stroke="#E5E7EB" strokeWidth="12" />
                          <circle cx="50" cy="50" r={DR} fill="none" stroke="#0071E3" strokeWidth="12"
                            strokeLinecap="round" strokeDasharray={`${bookDash - 3} ${DC}`} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-[11px] font-black text-slate-700 dark:text-slate-300 leading-tight">{allBooksCount}:{allLecturesCount}</p>
                          <p className="text-[8px] font-bold text-slate-400">비중</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 rounded-2xl px-3 py-2">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] shrink-0" />
                            교재
                          </span>
                          <span className="text-[10px] font-black text-[#0071E3]">{allBooksCount}개</span>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 rounded-2xl px-3 py-2">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] shrink-0" />
                            인강
                          </span>
                          <span className="text-[10px] font-black text-[#0071E3]">{allLecturesCount}개</span>
                        </div>
                        {total > 0 && (
                          <p className="text-[9px] text-slate-400 font-bold text-center">
                            총 {total}개 학습 자료
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. 교재(문제풀이) 진행률 — 강의:자습 비율을 점수화하지 않고 중립적으로 진행 정도만 표시 (#15) */}
              {(() => {
                const PR = 40; const PC = 2 * Math.PI * PR;
                const paceDash = Math.max(0, (selfStudyPct / 100)) * PC;
                return (
                  <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm flex flex-col gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">교재 문제풀이 진행</p>
                      <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">지금 교재 풀이가 이만큼 진행됐어요</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r={PR} fill="none" stroke="#F1F5F9" strokeWidth="12" />
                          <circle cx="50" cy="50" r={PR} fill="none" stroke={paceColor} strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${paceDash > 3 ? paceDash - 3 : paceDash} ${PC}`}
                            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-sm font-black leading-none" style={{ color: paceColor }}>{selfStudyPct}%</p>
                          <p className="text-[8px] font-bold text-slate-400 mt-0.5">진행</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="rounded-2xl bg-slate-50 dark:bg-white/5 px-3 py-2 text-center">
                          <p className="text-[11px] font-black text-slate-700 dark:text-slate-300">교재 {currentPages.toLocaleString()}p 진행</p>
                        </div>
                        <p className="text-[9px] font-bold text-slate-400 leading-relaxed text-center px-1">
                          기본강의 수강 시기엔 자습 비중이 낮은 게 자연스러워요. 강의·자습 비율은 과목 특성에 따라 달라요.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {isStudentReport && (
        <div className="no-print rounded-3xl border border-amber-500/15 bg-amber-500/[0.04] p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-black text-amber-900">
                <MessageSquare className="h-4 w-4 text-amber-700" />
                진도나 계획이 맞지 않나요?
              </h4>
              <p className="mt-1 text-[10px] font-semibold leading-5 text-amber-700/90">
                숫자 정정, 속도 조절, 상담 요청은 담당 코멘터에게 바로 신청할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('execution-plan');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full rounded-2xl border border-amber-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-4 py-2.5 text-xs font-black text-amber-900 dark:text-amber-300 shadow-sm transition hover:bg-amber-50 dark:hover:bg-white/5 sm:w-auto"
            >
              변경 신청 바로가기
            </button>
          </div>
        </div>
      )}

      {!student.subjects || student.subjects.length === 0 ? (
        (student.books.length === 0 && student.lectures.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2.5">
            <FileText className="w-7 h-7 text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-bold text-slate-400">현재 학습을 위해 등록된 교재/인강 정보가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm transition-all hover:shadow-md">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center border-b border-slate-100 dark:border-white/10 pb-3">
                <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                교재 / 도서 진도 현황
              </h4>
              <div className="space-y-5">
                {student.books.map(b => {
                  const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                  const status = getPlanStatus(b.currentPage, b.detailedPlans);
                  return (
                    <div key={b.id} className="space-y-2">
                      <div className="flex justify-between text-[11px] font-bold items-center">
                        <span className="truncate max-w-[190px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          {b.title}
                          {status && (
                            <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded ${getStatusBadgeClass(status)}`}>
                              {status}
                            </span>
                          )}
                        </span>
                        <span className="text-[#0071E3] font-extrabold">{b.currentPage} / {b.totalPages}p</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                          <div
                            className="h-full rounded-full bg-[#0071E3] transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800 dark:text-slate-200">{percent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm transition-all hover:shadow-md">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center border-b border-slate-100 dark:border-white/10 pb-3">
                <Tv className="w-4 h-4 mr-2 text-[#0071E3]" />
                인터넷 강의 수강 현황
              </h4>
              <div className="space-y-5">
                {student.lectures.map(l => {
                  const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                  const status = getPlanStatus(l.completedLectures, l.detailedPlans);
                  return (
                    <div key={l.id} className="space-y-2">
                      <div className="flex justify-between text-[11px] font-bold items-center">
                        <span className="truncate max-w-[190px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                          {l.name}
                          {status && (
                            <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded ${getStatusBadgeClass(status)}`}>
                              {status}
                            </span>
                          )}
                        </span>
                        <span className="text-[#0071E3] font-extrabold">{l.completedLectures} / {l.totalLectures}강</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                          <div
                            className="h-full rounded-full bg-[#0071E3] transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800 dark:text-slate-200">{percent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="space-y-6">
          {student.subjects.map(sub => (
            <div key={sub.id} className="p-6 md:p-8 rounded-[24px] border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] space-y-6 shadow-sm hover:shadow-md transition-all break-inside-avoid">
              <div className="border-b border-slate-100 dark:border-white/10 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 px-3.5 py-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl inline-block self-start shadow-sm tracking-wider">
                  {sub.name} 과목 학습 스케줄러
                </span>
                {isStudentReport && sub.learningGoal && (
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 border border-slate-100/60 dark:border-white/10 px-3.5 py-1.5 rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]">
                    과목 목표: {sub.learningGoal}
                  </span>
                )}
              </div>

              {sub.books.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center">
                    <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                    {isStudentReport ? '교재별 진도 관리 및 세부 학습 목표' : '교재 진도 현황'}
                  </h4>

                  <div className="space-y-5">
                    {sub.books.map(b => {
                      const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                      const oneMonthPlans = getOneMonthPlans(b.detailedPlans);
                      const totalPlans = oneMonthPlans.length;
                      const completedPlans = oneMonthPlans.filter(isPlanCompleted).length;
                      const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                      const status = getPlanStatus(b.currentPage, b.detailedPlans, sub.studyDays);
                      const paceComparison = formatPaceComparison(
                        getMaterialDailyPace(b.detailedPlans),
                        getMaterialBenchmark(materialBenchmarks, 'book', b.title)
                      );

                      return (
                        <div key={b.id} className="p-5 rounded-2xl border border-slate-100 dark:border-white/10 bg-gradient-to-b from-slate-50/50 to-white dark:from-white/5 dark:to-[#1c1c1e] space-y-4 shadow-sm">
                          <div className="flex justify-between items-start flex-wrap gap-2">
                            <div>
                              <h5 className="text-xs font-black text-slate-700 dark:text-slate-300">{b.title}</h5>
                              {b.goalDescription && (
                                <p className="text-[10px] text-[#0071E3] font-bold mt-1.5 flex items-center gap-1">
                                  완독 목표: {b.goalDescription}
                                </p>
                              )}
                              {isStudentReport && paceComparison && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-1.5">
                                  {paceComparison}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2.5">
                              {status && (
                                <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded-lg shadow-sm ${getStatusBadgeClass(status)}`}>
                                  {status}
                                </span>
                              )}
                              {isStudentReport ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <span className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 group relative">
                                    <div className="relative flex items-center">
                                      <input
                                        key={b.currentPage}
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={b.totalPages || undefined}
                                        defaultValue={b.currentPage}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== b.currentPage) updateProgress('book', b.id, v); }}
                                        className="w-14 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-1.5 pr-4.5 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                        aria-label="현재 페이지 입력"
                                      />
                                      <Pencil className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                                    </div>
                                    <span className="font-normal text-slate-300 dark:text-slate-600">/</span> {b.totalPages}p
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                      숫자를 수정하여 직접 진도를 기록하세요
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 group relative">
                                    <span>누적 해결:</span>
                                    <input
                                      key={b.solvedQuestions || 0}
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      defaultValue={b.solvedQuestions || 0}
                                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== (b.solvedQuestions || 0)) updateBookSolvedQuestions(b.id, v); }}
                                      className="w-12 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                      aria-label="푼 문항 수 입력"
                                    />
                                    <span>문항</span>
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                      해결한 누적 문항 수를 기록하세요
                                    </span>
                                  </span>

                                  <div className="flex flex-col gap-1 mt-1.5 text-[9px] font-semibold text-slate-400 max-w-[150px]">
                                    <div className="flex flex-col gap-1 items-end">
                                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">오답 사유 추가:</span>
                                      <div className="flex flex-wrap gap-1 justify-end">
                                        {[
                                          { key: 'calculation_error', label: '연산' },
                                          { key: 'time_limit', label: '시간' },
                                          { key: 'misread_condition', label: '오독' },
                                          { key: 'concept_leak', label: '개념' }
                                        ].map(tag => (
                                          <button
                                            key={tag.key}
                                            type="button"
                                            onClick={() => incrementBookIncorrectTag(b.id, tag.key, b.incorrectTags)}
                                            className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 transition-all text-[8px] font-black text-slate-500 dark:text-slate-400 active:scale-95"
                                          >
                                            {tag.label} +1
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {b.incorrectTags && Object.values(b.incorrectTags).some(v => Number(v) > 0) && (
                                      <div className="flex flex-wrap gap-1 mt-1 text-[7px] font-black justify-end">
                                        {Number(b.incorrectTags.calculation_error || 0) > 0 && <span className="px-1 py-0.2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded">연산:{b.incorrectTags.calculation_error}</span>}
                                        {Number(b.incorrectTags.time_limit || 0) > 0 && <span className="px-1 py-0.2 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded">시간:{b.incorrectTags.time_limit}</span>}
                                        {Number(b.incorrectTags.misread_condition || 0) > 0 && <span className="px-1 py-0.2 bg-orange-50 dark:bg-orange-500/10 text-orange-600 rounded">오독:{b.incorrectTags.misread_condition}</span>}
                                        {Number(b.incorrectTags.concept_leak || 0) > 0 && <span className="px-1 py-0.2 bg-blue-50 dark:bg-[#0071E3]/15 text-[#0071E3] rounded">개념:{b.incorrectTags.concept_leak}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{b.currentPage} / {b.totalPages}p</span>
                                  {(b.solvedQuestions || 0) > 0 && <span className="text-[9px] font-extrabold text-[#0071E3]">해결: {b.solvedQuestions}문항</span>}
                                </div>
                              )}
                              <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                            </div>
                          </div>

                          <div className="bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                            <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                          </div>

                          {isStudentReport && oneMonthPlans.length > 0 && (
                            <div className="pt-4 border-t border-slate-100 dark:border-white/10 space-y-3">
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                <span>최근 1개월 주간 학습 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                <span className="text-emerald-600 font-extrabold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-100/50 dark:border-white/10">{planPercent}% 달성률</span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                {oneMonthPlans.map(plan => {
                                  const planCompleted = isPlanCompleted(plan);
                                  const todayCompletion = getPlanTodayCompletion(plan);
                                  const todayCompleted = Boolean(todayCompletion?.isCompleted);
                                  const displayCompleted = planCompleted || todayCompleted;
                                  const planActualAmount = getPlanActualAmount(plan);
                                  const planKey = getPlanActionKey('book', b.id, plan.id);
                                  const isPending = pendingPlanKey === planKey;
                                  const unit = getDisplayUnit('book', b.unit, plan.rangeText);
                                  return (
                                    <div
                                     key={plan.id}
                                     className={`p-3 rounded-xl border text-left text-[10px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                       displayCompleted
                                         ? 'border-emerald-200 dark:border-white/10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                         : isPending
                                         ? 'border-amber-200 dark:border-white/10 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                         : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-400 hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03] dark:hover:bg-[#0071E3]/15'
                                     }`}
                                   >
                                     <div className="flex justify-between items-center font-bold">
                                       <span>{plan.weekNumber}주차</span>
                                       {displayCompleted ? (
                                         <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                       ) : (
                                         <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                      )}
                                    </div>
                                     <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                     <span className="font-extrabold text-[10px] tracking-tight text-slate-700 dark:text-slate-300 truncate">{plan.rangeText}</span>
                                     <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                     {isPending ? (
                                       <div className="mt-1 space-y-2 rounded-lg border border-amber-200 dark:border-white/10 bg-white/80 dark:bg-white/5 p-2">
                                         <p className="text-[8px] font-bold text-amber-700">오늘 실제 학습량</p>
                                         <div className="flex items-center gap-1.5">
                                           <button
                                             type="button"
                                             onClick={() => setPendingAmount((value) => Math.max(0, value - 1))}
                                             className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[12px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                                           >
                                             -
                                           </button>
                                           <input
                                             type="number"
                                             inputMode="numeric"
                                             min={0}
                                             value={pendingAmount}
                                             onChange={(e) => setPendingAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                             onKeyDown={(e) => {
                                               if (e.key === 'Enter') {
                                                 updatePlanCompletion('book', b.id, plan.id, true, pendingAmount, todayKey);
                                                 cancelPlanCompletion();
                                               }
                                             }}
                                             className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 py-1 text-center text-[11px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
                                             aria-label="오늘 실제 학습량"
                                           />
                                           <span className="shrink-0 text-[9px] font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
                                           <button
                                             type="button"
                                             onClick={() => setPendingAmount((value) => value + 1)}
                                             className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[12px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                                           >
                                             +
                                           </button>
                                         </div>
                                         <div className="grid grid-cols-2 gap-1.5">
                                           <button
                                             type="button"
                                             onClick={() => {
                                               updatePlanCompletion('book', b.id, plan.id, true, pendingAmount, todayKey);
                                               cancelPlanCompletion();
                                             }}
                                             className="rounded-full bg-emerald-500 px-2 py-1.5 text-[8px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97]"
                                           >
                                             완료 확인
                                           </button>
                                           <button
                                             type="button"
                                             onClick={cancelPlanCompletion}
                                             className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-[8px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97]"
                                           >
                                             취소
                                           </button>
                                         </div>
                                       </div>
                                     ) : (
                                       <button
                                         type="button"
                                         onClick={() => {
                                           if (todayCompleted) {
                                             updatePlanCompletion('book', b.id, plan.id, false, undefined, todayKey);
                                           } else if (plan.isCompleted && !plan.dailyCompletions) {
                                             updatePlanCompletion('book', b.id, plan.id, false);
                                           } else {
                                             startPlanCompletion('book', b.id, plan);
                                           }
                                         }}
                                         aria-pressed={displayCompleted}
                                         className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-semibold transition active:scale-[0.97] ${
                                           displayCompleted
                                             ? 'border-emerald-200 dark:border-white/10 bg-white/70 dark:bg-white/5 text-emerald-700 dark:text-emerald-300'
                                             : 'border-[#0071E3]/20 dark:border-white/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 text-[#0071E3] hover:bg-[#0071E3]/10'
                                         }`}
                                       >
                                         {todayCompleted
                                           ? `오늘 완료 (${todayCompletion?.actualAmount ?? getPlanDailyAmount(plan)}${unit})`
                                           : planCompleted
                                           ? (planActualAmount !== undefined ? `주차 완료 (${planActualAmount}${unit})` : '주차 완료')
                                           : '오늘 완료'}
                                       </button>
                                     )}
                                     </div>
                                   );
                                 })}
                               </div>
                            </div>
                          )}

                          {isStudentReport && (() => {
                            const mk = getMakeupAmount(b, new Date(), sub.studyDays, leaveDates, leaveExemptions, sub.studyTime, student.makeupCarryovers);
                            return (
                              <>
                                {mk.makeupTotal > 0 && (
                                  <div className="mt-2.5">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                      휴가 보강 +{mk.makeupTotal}{b.unit || 'p'} · 하루 +{mk.perDay}
                                    </span>
                                  </div>
                                )}
                                {renderCarryoverUI(sub.id, b.id, 'book', mk.makeupTotal, b.unit || 'p')}
                              </>
                            );
                          })()}
                          {isStudentReport && <InputHeatmap inputLog={b.inputLog} studyDays={sub.studyDays} leaveDates={leaveDates} />}

                          {isStudentReport && (
                            <BenchmarkSection type="book" subject={sub.name} name={b.title} studentId={student.id} audience="student" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sub.lectures.length > 0 && (
                <div className="space-y-4 mt-6">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center">
                    <Tv className="w-4 h-4 mr-2 text-[#0071E3]" />
                    {isStudentReport ? '인강별 수강 스케줄 및 달성 지표' : '인강 진도 현황'}
                  </h4>

                  <div className="space-y-5">
                    {sub.lectures.map(l => {
                      const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                      const oneMonthPlans = getOneMonthPlans(l.detailedPlans);
                      const totalPlans = oneMonthPlans.length;
                      const completedPlans = oneMonthPlans.filter(isPlanCompleted).length;
                      const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                      const status = getPlanStatus(l.completedLectures, l.detailedPlans, sub.studyDays);
                      const paceComparison = formatPaceComparison(
                        getMaterialDailyPace(l.detailedPlans),
                        getMaterialBenchmark(materialBenchmarks, 'lecture', l.name)
                      );

                      return (
                        <div key={l.id} className="p-5 rounded-2xl border border-slate-100 dark:border-white/10 bg-gradient-to-b from-slate-50/50 to-white dark:from-white/5 dark:to-[#1c1c1e] space-y-4 shadow-sm">
                          <div className="flex justify-between items-start flex-wrap gap-2">
                            <div>
                              <h5 className="text-xs font-black text-slate-700 dark:text-slate-300">{l.name}</h5>
                              {l.goalDescription && (
                                <p className="text-[10px] text-[#0071E3] font-bold mt-1.5 flex items-center gap-1">
                                  수강 목표: {l.goalDescription}
                                </p>
                              )}
                              {isStudentReport && paceComparison && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-1.5">
                                  {paceComparison}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2.5">
                              {status && (
                                <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded-lg shadow-sm ${getStatusBadgeClass(status)}`}>
                                  {status}
                                </span>
                              )}
                              {isStudentReport ? (
                                <span className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 group relative">
                                  <div className="relative flex items-center">
                                    <input
                                      key={l.completedLectures}
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      max={l.totalLectures || undefined}
                                      defaultValue={l.completedLectures}
                                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== l.completedLectures) updateProgress('lecture', l.id, v); }}
                                      className="w-14 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-1.5 pr-4.5 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                      aria-label="수강 강수 입력"
                                    />
                                    <Pencil className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                                  </div>
                                  <span className="font-normal text-slate-300 dark:text-slate-600">/</span> {l.totalLectures}강
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                    숫자를 수정하여 직접 진도를 기록하세요
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{l.completedLectures} / {l.totalLectures}강</span>
                              )}
                              <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                            </div>
                          </div>

                          <div className="bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                            <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                          </div>

                          {isStudentReport && oneMonthPlans.length > 0 && (
                            <div className="pt-4 border-t border-slate-100 dark:border-white/10 space-y-3">
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                <span>최근 1개월 주간 수강 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                <span className="text-emerald-600 font-extrabold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-100/50 dark:border-white/10">{planPercent}% 달성률</span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                {oneMonthPlans.map(plan => {
                                  const planCompleted = isPlanCompleted(plan);
                                  const todayCompletion = getPlanTodayCompletion(plan);
                                  const todayCompleted = Boolean(todayCompletion?.isCompleted);
                                  const displayCompleted = planCompleted || todayCompleted;
                                  const planActualAmount = getPlanActualAmount(plan);
                                  const planKey = getPlanActionKey('lecture', l.id, plan.id);
                                  const isPending = pendingPlanKey === planKey;
                                  const unit = getDisplayUnit('lecture', undefined, plan.rangeText);
                                  return (
                                    <div
                                     key={plan.id}
                                     className={`p-3 rounded-xl border text-left text-[10px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                       displayCompleted
                                         ? 'border-emerald-200 dark:border-white/10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                         : isPending
                                         ? 'border-amber-200 dark:border-white/10 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                         : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-400 hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03] dark:hover:bg-[#0071E3]/15'
                                     }`}
                                   >
                                     <div className="flex justify-between items-center font-bold">
                                       <span>{plan.weekNumber}주차</span>
                                       {displayCompleted ? (
                                         <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                       ) : (
                                         <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                      )}
                                    </div>
                                     <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                     <span className="font-extrabold text-[10px] tracking-tight text-slate-700 dark:text-slate-300 truncate">{plan.rangeText}</span>
                                     <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                     {isPending ? (
                                       <div className="mt-1 space-y-2 rounded-lg border border-amber-200 dark:border-white/10 bg-white/80 dark:bg-white/5 p-2">
                                         <p className="text-[8px] font-bold text-amber-700">오늘 실제 수강량</p>
                                         <div className="flex items-center gap-1.5">
                                           <button
                                             type="button"
                                             onClick={() => setPendingAmount((value) => Math.max(0, value - 1))}
                                             className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[12px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                                           >
                                             -
                                           </button>
                                           <input
                                             type="number"
                                             inputMode="numeric"
                                             min={0}
                                             value={pendingAmount}
                                             onChange={(e) => setPendingAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                                             onKeyDown={(e) => {
                                               if (e.key === 'Enter') {
                                                 updatePlanCompletion('lecture', l.id, plan.id, true, pendingAmount, todayKey);
                                                 cancelPlanCompletion();
                                               }
                                             }}
                                             className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 py-1 text-center text-[11px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
                                             aria-label="오늘 실제 수강량"
                                           />
                                           <span className="shrink-0 text-[9px] font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
                                           <button
                                             type="button"
                                             onClick={() => setPendingAmount((value) => value + 1)}
                                             className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[12px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                                           >
                                             +
                                           </button>
                                         </div>
                                         <div className="grid grid-cols-2 gap-1.5">
                                           <button
                                             type="button"
                                             onClick={() => {
                                               updatePlanCompletion('lecture', l.id, plan.id, true, pendingAmount, todayKey);
                                               cancelPlanCompletion();
                                             }}
                                             className="rounded-full bg-emerald-500 px-2 py-1.5 text-[8px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97]"
                                           >
                                             완료 확인
                                           </button>
                                           <button
                                             type="button"
                                             onClick={cancelPlanCompletion}
                                             className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-[8px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97]"
                                           >
                                             취소
                                           </button>
                                         </div>
                                       </div>
                                     ) : (
                                       <button
                                         type="button"
                                         onClick={() => {
                                           if (todayCompleted) {
                                             updatePlanCompletion('lecture', l.id, plan.id, false, undefined, todayKey);
                                           } else if (plan.isCompleted && !plan.dailyCompletions) {
                                             updatePlanCompletion('lecture', l.id, plan.id, false);
                                           } else {
                                             startPlanCompletion('lecture', l.id, plan);
                                           }
                                         }}
                                         aria-pressed={displayCompleted}
                                         className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-semibold transition active:scale-[0.97] ${
                                           displayCompleted
                                             ? 'border-emerald-200 dark:border-white/10 bg-white/70 dark:bg-white/5 text-emerald-700 dark:text-emerald-300'
                                             : 'border-[#0071E3]/20 dark:border-white/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 text-[#0071E3] hover:bg-[#0071E3]/10'
                                         }`}
                                       >
                                         {todayCompleted
                                           ? `오늘 완료 (${todayCompletion?.actualAmount ?? getPlanDailyAmount(plan)}${unit})`
                                           : planCompleted
                                           ? (planActualAmount !== undefined ? `주차 완료 (${planActualAmount}${unit})` : '주차 완료')
                                           : '오늘 완료'}
                                       </button>
                                     )}
                                     </div>
                                   );
                                 })}
                               </div>
                            </div>
                          )}

                          {isStudentReport && (() => {
                            const mk = getMakeupAmount(l, new Date(), sub.studyDays, leaveDates, leaveExemptions, sub.studyTime, student.makeupCarryovers);
                            return (
                              <>
                                {mk.makeupTotal > 0 && (
                                  <div className="mt-2.5">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                      휴가 보강 +{mk.makeupTotal}강 · 하루 +{mk.perDay}
                                    </span>
                                  </div>
                                )}
                                {renderCarryoverUI(sub.id, l.id, 'lecture', mk.makeupTotal, '강')}
                              </>
                            );
                          })()}
                          {isStudentReport && <InputHeatmap inputLog={l.inputLog} studyDays={sub.studyDays} leaveDates={leaveDates} />}

                          {isStudentReport && (
                            <BenchmarkSection type="lecture" subject={sub.name} name={l.name} studentId={student.id} audience="student" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
