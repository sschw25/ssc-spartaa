'use client';

import React from 'react';
import { toast } from 'sonner';
import { Calendar, CheckCircle2, Target, Clock } from 'lucide-react';
import { Student } from '@/lib/types/student';
import type { DeadlineGoal } from '@/lib/deadline-goals';

type DailyPlanEntry = {
  id: string;
  subject: string;
  title: string;
  type: string;
  materialType: 'book' | 'lecture';
  materialId: string;
  planId: string;
  dateKey: string;
  isCompleted: boolean;
  actualAmount?: number;
  studyTime: string;
  rangeText: string;
  dailyAmount: number;
  dailyLabel: string;
};

type WeeklyDailyPlan = {
  weekNumber: number;
  rangeLabel: string;
  startDate?: string;
  endDate?: string;
  days: Array<{
    key: string;
    label: string;
    dateKey: string;
    dateLabel: string;
    entries: DailyPlanEntry[];
  }>;
};

type DeadlinePlanEntry = {
  id: string;
  subject: string;
  title: string;
  materialType: 'book' | 'lecture';
  materialId: string;
  planId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  rangeText: string;
  targetAmount: number;
  actualAmount: number;
  unit: string;
  active: boolean;
  done: boolean;
  goal?: DeadlineGoal;
};

interface ExecutionPlanTabProps {
  student: Student;
  isStudentReport: boolean;
  weeklyDailyPlans: WeeklyDailyPlan[];
  deadlineGoals?: DeadlineGoal[];
  updateDeadlineProgress: (materialType: 'book' | 'lecture', materialId: string, planId: string, amount: number) => Promise<boolean>;
  activeTab: string;
}

// 가로 스와이프 캐러셀 — 넘길 게 남은 쪽 끝을 mask-image로 페이드해 "더 밀어볼 수 있다"는 힌트를 준다.
// 카드 배경이 반투명이라 그라데이션 색 매칭 대신 콘텐츠 자체를 마스크로 페이드(테마 무관하게 정확).
// 스크롤이 끝에 닿으면 그쪽 페이드는 사라진다.
function SwipeCarousel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ atStart: true, atEnd: true });

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdges((prev) => (prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));
  }, []);

  React.useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const FADE = 44; // 페이드 폭(px)
  const maskStyle: React.CSSProperties = (() => {
    const left = !edges.atStart;
    const right = !edges.atEnd;
    if (!left && !right) return {};
    const startStop = left ? `transparent, #000 ${FADE}px` : '#000';
    const endStop = right ? `#000 calc(100% - ${FADE}px), transparent` : '#000';
    const value = `linear-gradient(to right, ${startStop}, ${endStop})`;
    return { WebkitMaskImage: value, maskImage: value };
  })();

  return (
    <div
      ref={ref}
      style={maskStyle}
      className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function ExecutionPlanTab({
  student,
  isStudentReport,
  weeklyDailyPlans,
  deadlineGoals = [],
  updateDeadlineProgress,
  activeTab,
}: ExecutionPlanTabProps) {
  const [deadlineSavingId, setDeadlineSavingId] = React.useState<string | null>(null);
  const [deadlineEditId, setDeadlineEditId] = React.useState<string | null>(null);
  const [deadlineEditAmount, setDeadlineEditAmount] = React.useState(0);
  const todayKey = React.useMemo(
    () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()),
    [],
  );

  const getDeadlineUnit = (
    materialType: 'book' | 'lecture',
    unit: string | undefined,
    rangeText: string,
  ) => {
    if (materialType === 'lecture') return '강';
    if (unit) return unit;
    if (rangeText.includes('문제')) return '문제';
    if (rangeText.includes('회')) return '회';
    return 'p';
  };

  const deadlinePlanEntries = React.useMemo<DeadlinePlanEntry[]>(() => {
    if (!isStudentReport) return [];

    const activeGoalByKey = new Map(
      deadlineGoals.map((goal) => [`${goal.materialType}:${goal.materialId}:${goal.planId}`, goal]),
    );

    return (student.subjects || [])
      .flatMap((subject) => {
        const books = (subject.books || []).flatMap((book) =>
          (book.detailedPlans || [])
            .filter((plan) => plan.periodType === 'deadline' && plan.endDate >= todayKey)
            .map((plan) => {
              const goal = activeGoalByKey.get(`book:${book.id}:${plan.id}`);
              const targetAmount = Math.max(0, Number(plan.targetAmount || goal?.targetAmount || 0));
              const actualAmount = goal?.actualAmount ?? Math.max(0, Number(plan.actualAmount || 0));
              return {
                id: `book:${book.id}:${plan.id}`,
                subject: subject.name,
                title: book.title,
                materialType: 'book' as const,
                materialId: book.id,
                planId: plan.id,
                weekNumber: plan.weekNumber,
                startDate: plan.startDate,
                endDate: plan.endDate,
                rangeText: plan.rangeText,
                targetAmount,
                actualAmount,
                unit: goal?.unit ?? getDeadlineUnit('book', book.unit, plan.rangeText),
                active: plan.startDate <= todayKey && todayKey <= plan.endDate,
                done: Boolean(plan.isCompleted) || (targetAmount > 0 && actualAmount >= targetAmount),
                goal,
              };
            })
        );

        const lectures = (subject.lectures || []).flatMap((lecture) =>
          (lecture.detailedPlans || [])
            .filter((plan) => plan.periodType === 'deadline' && plan.endDate >= todayKey)
            .map((plan) => {
              const goal = activeGoalByKey.get(`lecture:${lecture.id}:${plan.id}`);
              const targetAmount = Math.max(0, Number(plan.targetAmount || goal?.targetAmount || 0));
              const actualAmount = goal?.actualAmount ?? Math.max(0, Number(plan.actualAmount || 0));
              return {
                id: `lecture:${lecture.id}:${plan.id}`,
                subject: subject.name,
                title: lecture.name,
                materialType: 'lecture' as const,
                materialId: lecture.id,
                planId: plan.id,
                weekNumber: plan.weekNumber,
                startDate: plan.startDate,
                endDate: plan.endDate,
                rangeText: plan.rangeText,
                targetAmount,
                actualAmount,
                unit: goal?.unit ?? getDeadlineUnit('lecture', undefined, plan.rangeText),
                active: plan.startDate <= todayKey && todayKey <= plan.endDate,
                done: Boolean(plan.isCompleted) || (targetAmount > 0 && actualAmount >= targetAmount),
                goal,
              };
            })
        );

        return [...books, ...lectures];
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.weekNumber - b.weekNumber || a.subject.localeCompare(b.subject));
  }, [deadlineGoals, isStudentReport, student.subjects, todayKey]);

  const deadlinePlanGroups = React.useMemo(() => {
    const groups = new Map<string, {
      key: string;
      subject: string;
      title: string;
      materialType: 'book' | 'lecture';
      entries: DeadlinePlanEntry[];
    }>();

    deadlinePlanEntries.forEach((entry) => {
      const key = `${entry.materialType}:${entry.materialId}`;
      const group = groups.get(key);
      if (group) {
        group.entries.push(entry);
        return;
      }
      groups.set(key, {
        key,
        subject: entry.subject,
        title: entry.title,
        materialType: entry.materialType,
        entries: [entry],
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((a, b) => a.weekNumber - b.weekNumber || a.startDate.localeCompare(b.startDate)),
      }))
      .sort((a, b) => {
        const aFirst = a.entries[0]?.startDate || '';
        const bFirst = b.entries[0]?.startDate || '';
        return aFirst.localeCompare(bFirst)
          || a.subject.localeCompare(b.subject)
          || a.title.localeCompare(b.title)
          || (a.materialType === b.materialType ? 0 : a.materialType === 'book' ? -1 : 1);
      });
  }, [deadlinePlanEntries]);

  // 최근(14일) 외출 반영으로 조정된 과목명 — 계획 항목에 '외출 반영' 배지 표시용.
  const awayAdjustedSubjects = React.useMemo(() => {
    if (!isStudentReport) return new Set<string>();
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    return new Set(
      (student.awayReplanNotices || [])
        .filter((n) => (n.appliedAt || '') >= cutoff)
        .map((n) => n.subjectName),
    );
  }, [isStudentReport, student]);

  const saveDeadlinePlanAmount = async (entry: DeadlinePlanEntry, amount: number) => {
    if (!entry.goal) return;
    const safeAmount = Math.max(0, Math.min(entry.targetAmount, Math.round(amount)));
    setDeadlineSavingId(entry.id);
    try {
      const ok = await updateDeadlineProgress(entry.materialType, entry.materialId, entry.planId, safeAmount);
      if (ok) {
        setDeadlineEditId(null);
        toast.success('주간 목표 진행량을 저장했어요.');
      } else {
        toast.error('저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setDeadlineSavingId(null);
    }
  };

  // 이번 주(오늘 포함) 범위 — weeklyDailyPlans[0]가 이번 주. 일일계획 자료의 이번 주 목표치 파생에 사용.
  const thisWeekRange = React.useMemo(() => {
    const wk = weeklyDailyPlans[0];
    if (wk?.startDate && wk?.endDate) return { start: wk.startDate, end: wk.endDate };
    // 폴백: 오늘이 속한 월~일 (KST 기준 todayKey)
    const [y, m, d] = todayKey.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    const dow = (base.getUTCDay() + 6) % 7; // 월=0
    const start = new Date(base); start.setUTCDate(base.getUTCDate() - dow);
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
    return { start: fmt(start), end: fmt(end) };
  }, [weeklyDailyPlans, todayKey]);

  // 일일계획(비 deadline) 자료의 '이번 주 목표치' — deadline 자료(order-2 담당)는 제외.
  // 각 교재/인강의 detailedPlans 중 이번 주와 겹치는 활성 plan의 목표량·범위를 컴팩트하게 요약.
  const weeklyMaterialGoals = React.useMemo(() => {
    if (!isStudentReport) return [] as Array<{
      id: string; subject: string; title: string; materialType: 'book' | 'lecture';
      rangeText: string; targetAmount: number; unit: string;
    }>;
    const overlapsThisWeek = (plan: { periodType?: string; startDate: string; endDate: string }) =>
      !plan.periodType && plan.startDate <= thisWeekRange.end && plan.endDate >= thisWeekRange.start;

    return (student.subjects || []).flatMap((subject) => {
      const books = (subject.books || []).flatMap((book) =>
        (book.detailedPlans || []).filter(overlapsThisWeek).map((plan) => ({
          id: `book:${book.id}:${plan.id}`,
          subject: subject.name,
          title: book.title,
          materialType: 'book' as const,
          rangeText: plan.rangeText,
          targetAmount: Math.max(0, Number(plan.targetAmount || 0)),
          unit: getDeadlineUnit('book', book.unit, plan.rangeText),
        })),
      );
      const lectures = (subject.lectures || []).flatMap((lecture) =>
        (lecture.detailedPlans || []).filter(overlapsThisWeek).map((plan) => ({
          id: `lecture:${lecture.id}:${plan.id}`,
          subject: subject.name,
          title: lecture.name,
          materialType: 'lecture' as const,
          rangeText: plan.rangeText,
          targetAmount: Math.max(0, Number(plan.targetAmount || 0)),
          unit: getDeadlineUnit('lecture', undefined, plan.rangeText),
        })),
      );
      return [...books, ...lectures];
    }).sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));
  }, [isStudentReport, student.subjects, thisWeekRange]);

  // 시각 순서는 order-* 클래스로 제어: 헤더 → 일일 자료 목표 → 주간(deadline) 목표. 요청/재조정은 과목별 진도 탭으로 이동.
  return (
    <div id="execution-plan" className={`scroll-mt-24 flex flex-col gap-5 print-card ${!isStudentReport || activeTab === 'execution-plan' ? '' : 'hidden print:block'}`}>
      <div className="order-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-wider uppercase flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0071E3]" />
            이번 주 자료별 목표
          </h3>
          <p className="mt-1 text-[10px] font-bold text-slate-400">
            자료별로 이번 주에 얼마나 나아가면 되는지 목표치를 정리했습니다.
          </p>
        </div>
        <span className="self-start rounded-full border border-[#0071E3]/15 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black text-[#0071E3] sm:self-auto">
          주간 목표 중심
        </span>
      </div>

      {/* 일일계획 자료의 이번 주 목표치 — deadline 자료(주간 목표 계획)는 아래 order-2에서 별도로 다룬다. */}
      {isStudentReport && weeklyMaterialGoals.length > 0 && (
        <section className="order-1 rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm break-inside-avoid">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-2.5">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              <Target className="h-4 w-4 text-[#0071E3]" />
              이번 주 자료별 목표치
            </h4>
            <span className="shrink-0 rounded-full bg-slate-50 dark:bg-white/5 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:text-slate-400">
              {weeklyMaterialGoals.length}개 자료
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {weeklyMaterialGoals.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 px-3 py-2">
                <span className="shrink-0 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-1.5 py-0.5 text-[9px] font-black text-[#0071E3]">
                  {g.materialType === 'book' ? '교재' : '인강'}
                </span>
                <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 break-keep">{g.subject} · {g.title}</span>
                <span className="ml-auto shrink-0 rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-0.5 text-[10px] font-black text-[#0071E3] tabular-nums">
                  이번 주 {g.targetAmount}{g.unit}
                </span>
                {g.rangeText && (
                  <span className="w-full text-[10px] font-bold text-slate-400 break-keep">{g.rangeText}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {isStudentReport && deadlinePlanEntries.length > 0 && (
        <section className="order-2 rounded-3xl border border-[#0071E3]/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm break-inside-avoid">
          <div className="mb-4 flex flex-col gap-2 border-b border-slate-100 dark:border-white/10 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                <Target className="h-4 w-4 text-[#0071E3]" />
                주간 목표 계획
              </h4>
              <p className="mt-1 text-[10px] font-bold text-slate-400">
                요일별 오늘 계획과 별도로, 이번 주와 예정된 주차 목표를 확인합니다.
              </p>
            </div>
            <span className="self-start rounded-full border border-[#0071E3]/15 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 px-3 py-1 text-[10px] font-black text-[#0071E3] sm:self-auto">
              {deadlinePlanGroups.length}개 자료 · {deadlinePlanEntries.length}개 목표
            </span>
          </div>

          <div className="space-y-4">
            {deadlinePlanGroups.map((group) => (
              <div key={group.key} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">
                      {group.materialType === 'book' ? '교재' : '인강'}
                    </p>
                    <h5 className="mt-0.5 truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                      {group.subject} · {group.title}
                    </h5>
                  </div>
                  <span className="self-start rounded-full bg-white dark:bg-[#1c1c1e] px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:self-auto">
                    {group.entries.length}개 주차
                  </span>
                </div>

                <SwipeCarousel>
            {group.entries.map((entry) => {
              const progressPercent = entry.targetAmount > 0
                ? Math.min(100, Math.round((entry.actualAmount / entry.targetAmount) * 100))
                : 0;
              const remaining = Math.max(0, entry.targetAmount - entry.actualAmount);
              const recommend = entry.goal ? Math.min(remaining, Math.max(0, entry.goal.todayRecommend)) : 0;
              const isSaving = deadlineSavingId === entry.id;
              const isEditing = deadlineEditId === entry.id;
              // 예상목표치(오늘까지 했어야 할 누적) 대비 90% 이상 채우면 '오늘 완료'로 본다.
              // '오늘 완료' 버튼은 누적을 예상목표치까지 채운다(todayRecommend 더하기 방식 폐기).
              const todayTarget = entry.goal ? Math.min(entry.targetAmount, Math.round(entry.goal.expectedAmount)) : 0;
              const metToday = !!entry.goal && entry.goal.expectedAmount > 0 && entry.actualAmount >= entry.goal.expectedAmount * 0.9;
              const fillGap = Math.max(0, todayTarget - entry.actualAmount);
              const periodLabel = `${entry.startDate.slice(5).replace('-', '.')} ~ ${entry.endDate.slice(5).replace('-', '.')}`;
              const cardTone = entry.done
                ? 'border-emerald-100 dark:border-white/10 bg-emerald-50/40 dark:bg-emerald-500/10'
                : entry.active
                  ? 'border-[#0071E3]/20 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15'
                  : 'border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5';

              return (
                <article key={entry.id} className={`w-[320px] shrink-0 snap-start rounded-2xl border p-3 sm:w-[380px] lg:w-[420px] ${cardTone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-slate-400">
                        {entry.weekNumber}주차 · {periodLabel}
                      </p>
                      <h5 className="mt-1 truncate text-[13px] font-black text-slate-900 dark:text-slate-100">
                        {entry.subject} · {entry.title}
                      </h5>
                      {awayAdjustedSubjects.has(entry.subject) && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#0071E3]">
                          외출 반영 조정됨
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
                      entry.done
                        ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700'
                        : entry.active
                          ? entry.goal?.behind
                            ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700'
                            : 'bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3]'
                          : 'bg-white dark:bg-white/10 text-slate-400'
                    }`}>
                      {entry.done ? '완료' : entry.active ? (entry.goal?.behind ? '조금 부족' : '진행 중') : '예정'}
                    </span>
                  </div>

                  <p className="mt-2 rounded-xl bg-white/80 dark:bg-white/5 px-2.5 py-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    목표 범위: <span className="text-slate-900 dark:text-slate-100">{entry.rangeText}</span>
                  </p>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-black text-slate-400">
                      <span>누적 {entry.actualAmount}/{entry.targetAmount}{entry.unit}</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white dark:bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all ${entry.done ? 'bg-emerald-500' : 'bg-[#0071E3]'}`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {entry.active && entry.goal ? (
                    <div className="mt-3 grid gap-1.5 text-[11px] font-black text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                      <p className="rounded-xl bg-white dark:bg-white/5 px-2.5 py-1.5">
                        오늘 권장 <span className={metToday ? 'text-emerald-600' : 'text-[#0071E3]'}>{metToday ? '완료' : recommend > 0 ? `${recommend}${entry.unit}` : '없음'}</span>
                      </p>
                      <p className="rounded-xl bg-white dark:bg-white/5 px-2.5 py-1.5">
                        예상목표치 <span className="text-slate-900 dark:text-slate-100">{entry.goal.expectedAmount}{entry.unit}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/70 dark:bg-white/5 px-2.5 py-2 text-[11px] font-bold text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      시작일에 맞춰 오늘 권장량이 표시됩니다.
                    </p>
                  )}

                  {entry.active && entry.goal && !entry.done && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {metToday ? (
                        <span className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-3 py-2 text-[11px] font-black text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          오늘 완료
                        </span>
                      ) : fillGap > 0 ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveDeadlinePlanAmount(entry, todayTarget)}
                          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0071E3] px-3 py-2 text-[11px] font-black text-white transition hover:bg-[#0077ED] active:scale-[0.97] disabled:opacity-40 sm:flex-none"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          오늘 완료
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setDeadlineEditId(isEditing ? null : entry.id);
                          setDeadlineEditAmount(entry.actualAmount);
                        }}
                        className={`inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[11px] font-black text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] ${
                          metToday || fillGap <= 0 ? 'flex-1 sm:flex-none' : ''
                        }`}
                      >
                        {metToday ? '수정 · 추가 입력' : '직접 입력'}
                      </button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="mt-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3">
                      <p className="text-[11px] font-black text-slate-600 dark:text-slate-400">이번 주 누적 완료량</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDeadlineEditAmount((value) => Math.max(0, value - 1))}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                        >
                          -
                        </button>
                        <span className="min-w-[4rem] text-center text-sm font-black text-slate-900 dark:text-slate-100">
                          {deadlineEditAmount}{entry.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeadlineEditAmount((value) => Math.min(entry.targetAmount, value + 1))}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 active:scale-95"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => saveDeadlinePlanAmount(entry, deadlineEditAmount)}
                          className="ml-auto rounded-full bg-slate-900 px-3 py-2 text-[11px] font-black text-white active:scale-[0.97] disabled:opacity-40"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
                </SwipeCarousel>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
