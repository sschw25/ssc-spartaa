'use client';

import React from 'react';
import { BookOpen, Tv, FileText, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { Student, DetailedPlan } from '@/lib/types/student';
import {
  MaterialBenchmarkMap,
  formatPaceComparison,
  getMaterialBenchmark,
  getMaterialDailyPace,
} from '@/lib/material-benchmark';
import { getExpectedFromPlans, getLeaveDates, getLeaveExemptions, getDeferLeaveExemptions, getMaterialStudyDays } from '@/lib/progress-plan';
import { getMaterialColor } from '@/lib/material-color';
import { getMakeupLedger } from '@/lib/makeup-ledger';
import { BenchmarkSection } from '@/components/learning/benchmark-section';
import { InputHeatmap } from '@/components/report/input-heatmap';

// 진도 입력 히트맵은 자료 상세 시트와 공유하는 공용 컴포넌트로 추출됨 — components/report/input-heatmap.tsx

// 자율 입력(selfPaced) 자료 — 진행률/목표 없이 "누적 N{단위}"만 보여주고,
// 학생은 "오늘 한 만큼"을 더해 누적에 반영한다(절대값 = 기존 + 입력분).
function SelfPacedInput({
  materialType,
  materialId,
  current,
  unit,
  canInput,
  updateProgress,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  current: number;
  unit: string;
  canInput: boolean;
  updateProgress: (materialType: 'book' | 'lecture', materialId: string, value: number) => Promise<boolean>;
}) {
  const [add, setAdd] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (saving || add <= 0) return;
    setSaving(true);
    const ok = await updateProgress(materialType, materialId, current + add);
    setSaving(false);
    if (ok) setAdd(1);
  };

  return (
    <div className="mt-3 rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/10 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">자율 목표 자료</span>
        <span className="text-[13px] font-black text-[#0071E3]">누적 {current}{unit}</span>
      </div>
      {canInput ? (
        <>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
            오늘 한 만큼 더해서 기록해요. 학습 요일마다 꼭 채워야 하는 자율 목표예요.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdd((v) => Math.max(1, v - 1))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[13px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
              aria-label="입력값 감소"
            >
              -
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={add}
              onChange={(e) => setAdd(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-center text-[13px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
              aria-label="오늘 한 만큼"
            />
            <span className="shrink-0 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
            <button
              type="button"
              onClick={() => setAdd((v) => v + 1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-[13px] font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
              aria-label="입력값 증가"
            >
              +
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { void submit(); }}
              className="shrink-0 rounded-full bg-[#0071E3] px-3.5 py-1.5 text-[11px] font-black text-white transition hover:bg-[#0060c0] active:scale-[0.97] disabled:opacity-60"
            >
              {saving ? '기록 중...' : '+ 기록'}
            </button>
          </div>
        </>
      ) : (
        <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
          학생이 그날 한 만큼 누적으로 기록하는 자율 목표 자료입니다.
        </p>
      )}
    </div>
  );
}

interface SubjectProgressTabProps {
  student: Student;
  isStudentReport: boolean;
  updateBookSolvedQuestions: (materialId: string, solvedQuestions: number) => void;
  // 자율 입력(selfPaced) 자료 누적 갱신 — value 는 절대값(기존 + 입력분)으로 보낸다.
  updateProgress: (materialType: 'book' | 'lecture', materialId: string, value: number) => Promise<boolean>;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string) => Promise<boolean>;
  materialBenchmarks: MaterialBenchmarkMap;
  activeTab: string;
  // 학습 관련 요청/진도 재조정 패널은 '신청' 탭의 '학습신청' 서브탭으로 이동됨.
  // 여기서는 '변경 신청' 버튼이 그 서브탭으로 이동하도록 콜백만 받는다(미전달 시 상단 스크롤 폴백).
  onOpenLearningRequest?: () => void;
  // 자료 카드 '자세히 보기' → 자료 상세 시트(학생 뷰 전용, 미전달 시 비활성).
  openMaterialDetail?: (materialType: 'book' | 'lecture', materialId: string) => void;
}

export function SubjectProgressTab({
  student,
  isStudentReport,
  updateBookSolvedQuestions,
  updateProgress,
  updatePlanCompletion,
  materialBenchmarks,
  activeTab,
  onOpenLearningRequest,
  openMaterialDetail,
}: SubjectProgressTabProps) {
  const [pendingPlanKey, setPendingPlanKey] = React.useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = React.useState(0);
  // 휴가일 집합(히트맵 off 칸 + 보강량 계산). 학생당 1회.
  const leaveDates = React.useMemo(() => getLeaveDates(student), [student]);
  // 슬롯-특정 부분면제(반차는 그 슬롯만) — 보강량 계산에 사용.
  const leaveExemptions = React.useMemo(() => getLeaveExemptions(student), [student]);
  // defer(정해진 반차/휴식)만 — 창(마감) 연장용. 정해진 휴가로 잃은 학습일만큼 뒤처짐 판정 창을 뒤로 민다.
  const deferExemptions = React.useMemo(() => getDeferLeaveExemptions(student), [student]);

  // ── 주말 보강 원장 — 자료별 남은 보강(remaining) 배지. 입력·완료는 학습 '보강' 탭에서 한다. ──
  const makeupRemainingById = React.useMemo(() => {
    const map = new Map<string, { remaining: number; unit: string }>();
    for (const it of getMakeupLedger(student)) map.set(it.materialId, { remaining: it.remaining, unit: it.unit });
    return map;
  }, [student]);

  // 요청 폼은 '신청' 탭의 '학습신청' 서브탭으로 이동됨 — '변경 신청' 버튼은 그 서브탭으로 이동한다.
  const goToChangeRequest = React.useCallback(() => {
    if (onOpenLearningRequest) onOpenLearningRequest();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [onOpenLearningRequest]);

  // 자료별 남은 보강 배지(원장 remaining). book/lecture 공용. remaining 0 이면 표시 안 함.
  const renderMakeupBadge = (materialId: string) => {
    const info = makeupRemainingById.get(materialId);
    if (!isStudentReport || !info || info.remaining <= 0) return null;
    return (
      <div className="mt-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          휴가 보강 남음 {info.remaining}{info.unit} · 보강 탭에서 입력해요
        </span>
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

  // 완료 확인 저장 — 성공 시에만 패널을 닫아 실패 시 입력값을 보존한다(실패 토스트는 훅 단일 경로).
  const [completionSaving, setCompletionSaving] = React.useState(false);
  const confirmPlanCompletion = async (materialType: 'book' | 'lecture', materialId: string, planId: string) => {
    if (completionSaving) return;
    setCompletionSaving(true);
    const ok = await updatePlanCompletion(materialType, materialId, planId, true, pendingAmount, todayKey);
    setCompletionSaving(false);
    if (ok) cancelPlanCompletion();
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
  const getPlanStatus = (current: number, plans?: DetailedPlan[], studyDays?: string[], subjectStudyTime?: string) => {
    // 계획이 아예 없는 자료 = 목표 미설정. 판정(빠름/느림) 대신 중립 뱃지로 안내한다.
    if (!plans || plans.length === 0) return '목표 미설정';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 승인된 휴가(반차/휴식 등)는 그날 기대치에서 면제 — 순수 휴가로는 '느림'이 뜨지 않게 오버레이를 넘긴다.
    // 반차는 slot-특정 부분면제라 과목 studyTime 을 함께 전달(없으면 비율 폴백).
    const expectedByStart = getExpectedFromPlans(plans, today, studyDays, student.createdAt, false, leaveDates, leaveExemptions, subjectStudyTime, deferExemptions);
    const expectedByEnd = getExpectedFromPlans(plans, today, studyDays, student.createdAt, true, leaveDates, leaveExemptions, subjectStudyTime, deferExemptions);
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
        return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-white/10';
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
        // 총량 미정(이름만 등록) 자료는 진도율 계산이 불가능하므로 전체 평균에서 제외 — 0%로 평균을 끌어내리지 않게.
        const pcts = [
          ...allBooks.filter((b) => (b.totalPages || 0) > 0).map((b) => Math.min(1, (b.currentPage || 0) / b.totalPages)),
          ...allLectures.filter((l) => (l.totalLectures || 0) > 0).map((l) => Math.min(1, (l.completedLectures || 0) / l.totalLectures)),
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
                        <span className="text-[#0071E3] font-extrabold">{b.currentPage} / {b.totalPages}{b.unit || 'p'}</span>
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
                {/* 과목 단위 학습목표는 자료 단위로 이관(2026-07) — 편집 경로가 없는 낡은 텍스트가
                    영구 노출되지 않게 표시를 내렸다. 데이터(sub.learningGoal)는 보존. */}
              </div>

              {sub.books.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center">
                    <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                    {isStudentReport ? '교재별 진도 관리 및 세부 학습 목표' : '교재 진도 현황'}
                  </h4>

                  <div className="space-y-5">
                    {sub.books.map(b => {
                      // 자율 입력(selfPaced): 진행률·목표·뒤처짐 판정 없이 누적만. 계획이 없어 스케줄/보강도 자연 제외.
                      const isSelfPaced = b.goalType === 'selfPaced';
                      const bookUnit = b.unit || 'p';
                      const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                      const oneMonthPlans = getOneMonthPlans(b.detailedPlans);
                      const totalPlans = oneMonthPlans.length;
                      const completedPlans = oneMonthPlans.filter(isPlanCompleted).length;
                      const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                      const status = isSelfPaced ? null : getPlanStatus(b.currentPage, b.detailedPlans, getMaterialStudyDays(sub.studyDays, b.studyDays), b.studyTime || sub.studyTime);
                      const paceComparison = isSelfPaced ? null : formatPaceComparison(
                        getMaterialDailyPace(b.detailedPlans),
                        getMaterialBenchmark(materialBenchmarks, 'book', b.title)
                      );

                      return (
                        <div key={b.id} id={`material-card-${b.id}`} className="scroll-mt-24 p-5 rounded-2xl border border-slate-100 dark:border-white/10 bg-gradient-to-b from-slate-50/50 to-white dark:from-white/5 dark:to-[#1c1c1e] space-y-4 shadow-sm">
                          <div className="flex justify-between items-start flex-wrap gap-2">
                            <div>
                              <h5 className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(b) }} />
                                {b.title}
                              </h5>
                              {openMaterialDetail && (
                                <button
                                  type="button"
                                  onClick={() => openMaterialDetail('book', b.id)}
                                  className="mt-1.5 inline-flex items-center gap-0.5 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/5 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-[0.98]"
                                >
                                  자세히 보기
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
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
                                  <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    <span className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-semibold text-[#0071E3]">
                                      {b.currentPage}
                                    </span>
                                    {isSelfPaced ? (
                                      <span className="text-slate-400">{bookUnit} 누적</span>
                                    ) : (
                                      <>
                                        <span className="font-normal text-slate-300 dark:text-slate-600">/</span>
                                        <span>{b.totalPages}{bookUnit}</span>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={goToChangeRequest}
                                      className="ml-1 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/5 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-[0.98]"
                                    >
                                      변경 신청
                                    </button>
                                  </div>
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 group relative">
                                    <span>풀이</span>
                                    <input
                                      key={b.solvedQuestions || 0}
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      defaultValue={b.solvedQuestions || 0}
                                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== (b.solvedQuestions || 0)) updateBookSolvedQuestions(b.id, v); }}
                                      className="w-12 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                      aria-label="몇 번 문제까지 풀었는지 입력"
                                    />
                                    <span>번까지</span>
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                      지금까지 푼 마지막 문제 번호를 적어요 (페이지 진도와 별개)
                                    </span>
                                  </span>

                                  {/* 오답 사유 태그는 '오답 노트' 독립 탭으로 이동함 (과목별 진도에서는 진도만) */}
                                  {b.incorrectTags && Object.values(b.incorrectTags).some(v => Number(v) > 0) && (
                                    <div className="flex flex-wrap gap-1 mt-1 text-[10px] font-black justify-end max-w-[150px]">
                                      {Number(b.incorrectTags.calculation_error || 0) > 0 && <span className="px-1 py-[2px] bg-red-50 dark:bg-red-500/10 text-red-600 rounded leading-none">연산:{b.incorrectTags.calculation_error}</span>}
                                      {Number(b.incorrectTags.time_limit || 0) > 0 && <span className="px-1 py-[2px] bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded leading-none">시간:{b.incorrectTags.time_limit}</span>}
                                      {Number(b.incorrectTags.misread_condition || 0) > 0 && <span className="px-1 py-[2px] bg-orange-50 dark:bg-orange-500/10 text-orange-600 rounded leading-none">오독:{b.incorrectTags.misread_condition}</span>}
                                      {Number(b.incorrectTags.concept_leak || 0) > 0 && <span className="px-1 py-[2px] bg-blue-50 dark:bg-[#0071E3]/15 text-[#0071E3] rounded leading-none">개념:{b.incorrectTags.concept_leak}</span>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                    {isSelfPaced ? `누적 ${b.currentPage}${bookUnit}` : `${b.currentPage} / ${b.totalPages}${bookUnit}`}
                                  </span>
                                  {(b.solvedQuestions || 0) > 0 && <span className="text-[9px] font-extrabold text-[#0071E3]">~{b.solvedQuestions}번까지 풀이</span>}
                                </div>
                              )}
                              {!isSelfPaced && (
                                <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                              )}
                            </div>
                          </div>

                          {!isSelfPaced && (
                            <div className="bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                              <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                            </div>
                          )}

                          {isSelfPaced && (
                            <SelfPacedInput
                              materialType="book"
                              materialId={b.id}
                              current={b.currentPage}
                              unit={bookUnit}
                              canInput={isStudentReport}
                              updateProgress={updateProgress}
                            />
                          )}

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
                                                 void confirmPlanCompletion('book', b.id, plan.id);
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
                                             disabled={completionSaving}
                                             onClick={() => {
                                               void confirmPlanCompletion('book', b.id, plan.id);
                                             }}
                                             className="rounded-full bg-emerald-500 px-2 py-1.5 text-[8px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97] disabled:opacity-60"
                                           >
                                             {completionSaving ? '저장 중...' : '완료 확인'}
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
                                         disabled={plan.startDate > todayKey && !displayCompleted}
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
                                         className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${
                                           displayCompleted
                                             ? 'border-emerald-200 dark:border-white/10 bg-white/70 dark:bg-white/5 text-emerald-700 dark:text-emerald-300'
                                             : 'border-[#0071E3]/20 dark:border-white/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 text-[#0071E3] hover:bg-[#0071E3]/10'
                                         }`}
                                       >
                                         {plan.startDate > todayKey && !displayCompleted
                                           ? '아직 예정'
                                           : todayCompleted
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

                          {renderMakeupBadge(b.id)}
                          {isStudentReport && <InputHeatmap inputLog={b.inputLog} studyDays={getMaterialStudyDays(sub.studyDays, b.studyDays)} leaveDates={leaveDates} detailedPlans={b.detailedPlans} unit={b.unit || 'p'} isSelfPaced={b.goalType === 'selfPaced'} reviewLog={b.reviewLog} />}

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
                      const isSelfPaced = l.goalType === 'selfPaced';
                      const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                      const oneMonthPlans = getOneMonthPlans(l.detailedPlans);
                      const totalPlans = oneMonthPlans.length;
                      const completedPlans = oneMonthPlans.filter(isPlanCompleted).length;
                      const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                      const status = isSelfPaced ? null : getPlanStatus(l.completedLectures, l.detailedPlans, getMaterialStudyDays(sub.studyDays, l.studyDays), l.studyTime || sub.studyTime);
                      const paceComparison = isSelfPaced ? null : formatPaceComparison(
                        getMaterialDailyPace(l.detailedPlans),
                        getMaterialBenchmark(materialBenchmarks, 'lecture', l.name)
                      );

                      return (
                        <div key={l.id} id={`material-card-${l.id}`} className="scroll-mt-24 p-5 rounded-2xl border border-slate-100 dark:border-white/10 bg-gradient-to-b from-slate-50/50 to-white dark:from-white/5 dark:to-[#1c1c1e] space-y-4 shadow-sm">
                          <div className="flex justify-between items-start flex-wrap gap-2">
                            <div>
                              <h5 className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(l) }} />
                                {l.name}
                              </h5>
                              {openMaterialDetail && (
                                <button
                                  type="button"
                                  onClick={() => openMaterialDetail('lecture', l.id)}
                                  className="mt-1.5 inline-flex items-center gap-0.5 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/5 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-[0.98]"
                                >
                                  자세히 보기
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
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
                                <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                                  <span className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-semibold text-[#0071E3]">
                                    {l.completedLectures}
                                  </span>
                                  {isSelfPaced ? (
                                    <span className="text-slate-400">강 누적</span>
                                  ) : (
                                    <>
                                      <span className="font-normal text-slate-300 dark:text-slate-600">/</span>
                                      <span>{l.totalLectures}강</span>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={goToChangeRequest}
                                    className="ml-1 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/5 px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-[0.98]"
                                  >
                                    변경 신청
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                  {isSelfPaced ? `누적 ${l.completedLectures}강` : `${l.completedLectures} / ${l.totalLectures}강`}
                                </span>
                              )}
                              {!isSelfPaced && (
                                <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                              )}
                            </div>
                          </div>

                          {!isSelfPaced && (
                            <div className="bg-slate-100 dark:bg-white/10 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                              <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                            </div>
                          )}

                          {isSelfPaced && (
                            <SelfPacedInput
                              materialType="lecture"
                              materialId={l.id}
                              current={l.completedLectures}
                              unit="강"
                              canInput={isStudentReport}
                              updateProgress={updateProgress}
                            />
                          )}

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
                                                 void confirmPlanCompletion('lecture', l.id, plan.id);
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
                                             disabled={completionSaving}
                                             onClick={() => {
                                               void confirmPlanCompletion('lecture', l.id, plan.id);
                                             }}
                                             className="rounded-full bg-emerald-500 px-2 py-1.5 text-[8px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97] disabled:opacity-60"
                                           >
                                             {completionSaving ? '저장 중...' : '완료 확인'}
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
                                         disabled={plan.startDate > todayKey && !displayCompleted}
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
                                         className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${
                                           displayCompleted
                                             ? 'border-emerald-200 dark:border-white/10 bg-white/70 dark:bg-white/5 text-emerald-700 dark:text-emerald-300'
                                             : 'border-[#0071E3]/20 dark:border-white/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 text-[#0071E3] hover:bg-[#0071E3]/10'
                                         }`}
                                       >
                                         {plan.startDate > todayKey && !displayCompleted
                                           ? '아직 예정'
                                           : todayCompleted
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

                          {renderMakeupBadge(l.id)}
                          {isStudentReport && <InputHeatmap inputLog={l.inputLog} studyDays={getMaterialStudyDays(sub.studyDays, l.studyDays)} leaveDates={leaveDates} detailedPlans={l.detailedPlans} unit="강" isSelfPaced={l.goalType === 'selfPaced'} reviewLog={l.reviewLog} />}

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
