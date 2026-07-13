'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, BookOpen, Tv, ChevronRight, CalendarDays, Clock, Target, History, FileText, Pencil } from 'lucide-react';
import type { Student, BookProgress, LectureProgress, SubjectProgress, DetailedPlan } from '@/lib/types/student';
import { getMaterialStudyDays, getLeaveDates, toDateKey } from '@/lib/progress-plan';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import { formatSlotLabel, STUDY_SLOT_OPTIONS, isTimeSlot, parseTimeSlot, timeSlotPeriodKeys } from '@/lib/academy-timetable';
import { MATERIAL_COLORS, getMaterialColor, hasExplicitColor } from '@/lib/material-color';
import { toast } from 'sonner';
import { InputHeatmap } from './input-heatmap';
import { StartPointAdjustPanel, type StartPointAdjustInfo, type StartPointAdjustResult } from './start-point-adjust-panel';
import { useOverlayTransition } from '@/hooks/use-overlay-transition';

// 자료(교재/인강) 상세 시트 — 학생 뷰 전용 풀스크린 오버레이.
// 홈/시간표/과목별 진도의 어떤 항목을 눌러도 그 자료의 진도·계획·기록을 한곳에서 보여준다.
// 데이터는 이미 로드된 student(subjects 단일소스)에서만 파생 — 새 fetch 없음.
// 딥링크: ?material=<materialId>&mtype=book|lecture (URL 동기화는 page 쪽에서).

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
};

type FoundMaterial = {
  subject: SubjectProgress | null;
  material: BookProgress | LectureProgress;
};

interface MaterialDetailSheetProps {
  student: Student;
  materialType: 'book' | 'lecture';
  materialId: string;
  studyTimeLabels: Record<string, string>;
  adjustStartPoint?: (
    materialType: 'book' | 'lecture',
    materialId: string,
    newValue: number,
    reason?: string,
  ) => Promise<StartPointAdjustResult>;
  onClose: () => void;
  // 자료별 교시 배치(studySlot) 저장 — 있으면 시간대 칩이 편집 select 로 바뀐다.
  saveStudySlot?: (materialType: 'book' | 'lecture', materialId: string, slot: string) => Promise<boolean>;
  // 자료 색상 저장 — 있으면 색상 피커가 뜬다. 시간표·캘린더 등에서 이 색으로 표시된다.
  saveMaterialColor?: (materialType: 'book' | 'lecture', materialId: string, color: string) => Promise<boolean>;
  // selfPaced 자료의 예상 총 분량 저장(셀프서비스) — 있으면 진도 현황에 예상 총량 입력이 뜬다.
  saveEstimatedTotal?: (materialType: 'book' | 'lecture', materialId: string, estimatedTotal: number) => Promise<boolean>;
  // 연결 링크 — 탭 전환은 페이지의 기존 콜백 패턴(selectReportTab)을 그대로 탄다.
  onOpenSubjectProgress: () => void;
  onOpenTimetable: () => void;
  onOpenChangeRequest: () => void;
}

const getSeoulDateKey = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

// "2026-07-07" → "7.7" (기록 리스트용 짧은 날짜)
const fmtShortDate = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}.${Number(d)}`;
};

export function MaterialDetailSheet({
  student,
  materialType,
  materialId,
  studyTimeLabels,
  adjustStartPoint,
  onClose,
  saveStudySlot,
  saveMaterialColor,
  saveEstimatedTotal,
  onOpenSubjectProgress,
  onOpenTimetable,
  onOpenChangeRequest,
}: MaterialDetailSheetProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  // 닫힘 전환 — exit 애니메이션 재생 후 실제 onClose. 모든 닫기 트리거를 requestClose 로 라우팅.
  const { closing, requestClose } = useOverlayTransition(onClose);

  // ESC 로 닫기 + 열려 있는 동안 배경 스크롤 잠금.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 입력 중(사유 textarea·숫자 입력 등) ESC 는 시트를 닫지 않는다 — 입력 취소 용도로 남겨둔다.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose]);

  const leaveDates = useMemo(() => getLeaveDates(student), [student]);

  // subjects 단일소스에서 자료 찾기(+레거시 최상위 books/lectures 폴백 — 과목 미지정).
  // 선형 탐색이라 가벼워서 memo 없이 렌더마다 계산(React Compiler 가 알아서 최적화).
  const findInStudent = (): FoundMaterial | null => {
    for (const sub of student.subjects || []) {
      const list: Array<BookProgress | LectureProgress> =
        materialType === 'book' ? (sub.books || []) : (sub.lectures || []);
      const m = list.find((item) => item.id === materialId);
      if (m) return { subject: sub, material: m };
    }
    const legacy: Array<BookProgress | LectureProgress> =
      materialType === 'book' ? (student.books || []) : (student.lectures || []);
    const m = legacy.find((item) => item.id === materialId);
    return m ? { subject: null, material: m } : null;
  };
  const found = findInStudent();

  // 존재하지 않는 자료면 조용히 무시(렌더 안 함) — 딥링크 오타 방어.
  if (!found) return null;

  const { subject, material } = found;
  const isBook = materialType === 'book';
  const title = isBook ? (material as BookProgress).title : (material as LectureProgress).name;
  const unit = isBook ? ((material as BookProgress).unit || 'p') : '강';
  const total = isBook ? ((material as BookProgress).totalPages || 0) : ((material as LectureProgress).totalLectures || 0);
  const current = isBook ? ((material as BookProgress).currentPage || 0) : ((material as LectureProgress).completedLectures || 0);
  const isSelfPaced = material.goalType === 'selfPaced';
  const subjectName = subject?.name || '학습 자료';
  const typeLabel = isBook ? '교재' : '인강';
  const TypeIcon = isBook ? BookOpen : Tv;

  const todayKey = getSeoulDateKey();
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const nextStart = Math.min(total, current + 1);

  // 학습 요일 — 자료 단위 단일소스(getMaterialStudyDays). 미지정이면 계획자료=매일 / 자율=일요일 제외.
  const studyDays = getMaterialStudyDays(subject?.studyDays, material.studyDays);
  const isDayActive = (key: string) =>
    studyDays && studyDays.length > 0 ? studyDays.includes(key as (typeof DAY_ORDER)[number]) : (isSelfPaced ? key !== 'sun' : true);

  // 시간대 — 자율은 자료별 학생 지정 슬롯(studySlot), 계획자료는 과목 studyTime.
  const slotLabel = isSelfPaced
    ? formatSlotLabel(material.studySlot)
    : (studyTimeLabels[subject?.studyTime || ''] || '미지정');

  // 현재 활성 계획 — 매일 시간표 plan 우선, 없으면 기간 목표(deadline) plan 표시.
  const plans: DetailedPlan[] = material.detailedPlans || [];
  const activeDailyPlan = plans.find((p) => !p.periodType && p.startDate <= todayKey && todayKey <= p.endDate);
  const activeDeadlinePlan = plans.find((p) => p.periodType === 'deadline' && p.startDate <= todayKey && todayKey <= p.endDate);
  const activePlan = activeDailyPlan || activeDeadlinePlan;
  const todayCompletion = activeDailyPlan ? getPlanDailyCompletion(activeDailyPlan, todayKey) : undefined;

  const isFinished = total > 0 && current >= total;

  // 시작점 조정 — 홈(adjustInfoFor)과 동일 규칙: 자율/분량미상 제외, 임계치 = 전체의 1/10(최소 1).
  // 추가 조건: 세부 계획 없는 자료(서버 400 dead-end)·완주·오늘치 이미 완료(홈과 동일)면 숨긴다.
  const adjustInfo: StartPointAdjustInfo | null = (() => {
    if (!adjustStartPoint || isSelfPaced || total <= 0) return null;
    if (plans.length === 0) return null;
    if (isFinished) return null;
    if (todayCompletion?.isCompleted) return null;
    const usedToday = (material.adjustLog || [])
      .filter((entry) => entry.date === todayKey && entry.auto)
      .reduce((sum, entry) => sum + Math.abs((Number(entry.to) || 0) - (Number(entry.from) || 0)), 0);
    return { current, total, usedToday, threshold: Math.max(1, Math.ceil(total / 10)) };
  })();

  // 최근 7일 완료 이력 — 모든 plan 의 dailyCompletions 를 날짜 내림차순으로.
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - 6);
  const cutoffKey = toDateKey(cutoffDate);
  const recentCompletions = plans
    .flatMap((plan) =>
      Object.entries(plan.dailyCompletions || {})
        .filter(([date, val]) => val?.isCompleted && date >= cutoffKey)
        .map(([date, val]) => ({ date, amount: typeof val.actualAmount === 'number' ? val.actualAmount : undefined })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  // 복습 기록 — reviewLog(날짜별 분) 최근 5개.
  const recentReviews = Object.entries(material.reviewLog || {})
    .filter(([, min]) => Number(min) > 0)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 5);

  // 시작점 조정 이력 — adjustLog 최근 5개(최신 먼저). auto 여부 배지 표시.
  const recentAdjusts = (material.adjustLog || []).slice(-5).reverse();

  const hasRecords = recentCompletions.length > 0 || recentReviews.length > 0 || recentAdjusts.length > 0;

  const sectionTitleCls = 'flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400';
  const cardCls = 'rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4';

  return (
    <div
      className={`no-print fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${closing ? 'animate-out fade-out-0' : 'animate-in fade-in-0'}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${subjectName} ${title} 상세`}
    >
      <div
        // 시트 표면 — glass-strong(72% 흰색)이 어두운 오버레이 위에서 회색빛으로 보여, 학생 시트는 더 하얀 유리로.
        className={`flex h-[94dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] border border-white/60 dark:border-white/10 bg-white/90 dark:bg-[#1c1c1e]/90 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_10px_40px_rgba(0,0,0,0.15)] sm:h-auto sm:max-h-[88dvh] sm:rounded-[28px] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${closing ? 'animate-out slide-out-to-bottom-4 fade-out-0 sm:zoom-out-95' : 'animate-in slide-in-from-bottom-4 fade-in-0 sm:zoom-in-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. 헤더 — 과목·자료명·종류·단위 + 닫기 */}
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] dark:border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#0071E3]">
              <TypeIcon className="h-3.5 w-3.5" />
              {subjectName}
              <span className="rounded-full bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/20 px-2 py-0.5 text-[10px] font-semibold">
                {typeLabel}
              </span>
              <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                단위 {unit}
              </span>
            </p>
            <MaterialTitleEditor materialType={materialType} materialId={materialId} title={title} />
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100/80 dark:bg-white/10 text-slate-500 dark:text-slate-300 transition hover:bg-slate-200/80 dark:hover:bg-white/15 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          {/* 2. 진도 현황 */}
          <div className={cardCls}>
            <p className={sectionTitleCls}>
              <Target className="h-3.5 w-3.5 text-[#0071E3]" />
              진도 현황
            </p>
            {isSelfPaced ? (
              <>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-semibold text-[#0071E3] tabular-nums">
                      누적 {current}{unit}
                      {total > 0 && <span className="ml-1 text-[12px] font-medium text-slate-400">/ {total}{unit}</span>}
                    </p>
                    <p className="mt-0.5 break-keep text-[11px] font-medium text-slate-400 dark:text-slate-400">
                      자율 학습 자료예요. 한 만큼 기록하면 누적돼요.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-2.5 py-1 text-[10px] font-semibold text-[#0071E3]">
                    자율 목표
                  </span>
                </div>
                {total > 0 && (
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                  </div>
                )}
                {saveEstimatedTotal && (
                  <SelfPacedTotalInput
                    materialType={materialType}
                    materialId={materialId}
                    unit={unit}
                    currentTotal={total}
                    isEstimate={!!material.totalIsEstimate}
                    onSave={saveEstimatedTotal}
                  />
                )}
              </>
            ) : total > 0 ? (
              <>
                <div className="mt-2.5 flex items-end justify-between gap-3">
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {current} <span className="text-[12px] font-medium text-slate-400">/ {total}{unit}</span>
                  </p>
                  <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">{percent}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {isFinished ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      완주했어요 🎉
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      오늘은 <span className="font-semibold text-[#0071E3]">{nextStart}{unit}</span>부터 시작해요
                    </span>
                  )}
                  {adjustInfo && !adjustOpen && (
                    <button
                      type="button"
                      onClick={() => setAdjustOpen(true)}
                      className="rounded-full border border-[#0071E3]/25 bg-[#0071E3]/[0.05] px-2 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-95 dark:bg-[#0071E3]/15"
                    >
                      시작점 조정
                    </button>
                  )}
                </div>
                {adjustInfo && adjustOpen && adjustStartPoint && (
                  <StartPointAdjustPanel
                    materialType={materialType}
                    materialId={materialId}
                    unit={unit}
                    info={adjustInfo}
                    adjustStartPoint={adjustStartPoint}
                    onClose={() => setAdjustOpen(false)}
                  />
                )}
              </>
            ) : (
              <p className="mt-2.5 break-keep text-[11px] font-medium text-slate-400 dark:text-slate-400">
                아직 전체 분량이 등록되지 않은 자료예요. 분량이 등록되면 진행률이 보여요.
              </p>
            )}
          </div>

          {/* 3. 이번 주 계획 */}
          <div className={cardCls}>
            <p className={sectionTitleCls}>
              <CalendarDays className="h-3.5 w-3.5 text-[#0071E3]" />
              이번 주 계획
            </p>
            {isSelfPaced ? (
              <p className="mt-2.5 break-keep text-[11px] font-medium text-slate-500 dark:text-slate-400">
                자율 학습이라 정해진 주간 계획은 없어요. 학습 요일에 한 만큼 기록해요.
              </p>
            ) : activePlan ? (
              <div className="mt-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-2.5 py-1 text-[11px] font-semibold text-[#0071E3]">
                    {activePlan.rangeText}
                  </span>
                  {!activePlan.periodType && (
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                      하루 {activePlan.dailyAmount ?? Math.ceil((activePlan.targetAmount || 1) / 6)}{unit}
                    </span>
                  )}
                  {activePlan.periodType === 'deadline' && (
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      기간 목표
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-400 tabular-nums">
                    {activePlan.startDate.substring(5)} ~ {activePlan.endDate.substring(5)}
                  </span>
                </div>
                {todayCompletion?.isCompleted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    오늘치 완료{typeof todayCompletion.actualAmount === 'number' ? ` · ${todayCompletion.actualAmount}${unit}` : ''} ✅
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2.5 break-keep text-[11px] font-medium text-slate-400 dark:text-slate-400">
                지금 진행 중인 주간 계획이 없어요.
              </p>
            )}

            {/* 학습 요일 + 시간대 — 뱃지 시각화 */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-slate-100 dark:border-white/10 pt-3">
              <div className="flex items-center gap-1" aria-label="학습 요일">
                {DAY_ORDER.map((key) => (
                  <span
                    key={key}
                    className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold ${
                      isDayActive(key)
                        ? 'bg-[#0071E3] text-white'
                        : 'bg-slate-100 dark:bg-white/10 text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    {DAY_LABELS[key]}
                  </span>
                ))}
              </div>
              {saveStudySlot ? (
                <StudySlotEditor
                  materialType={materialType}
                  materialId={materialId}
                  currentSlot={material.studySlot || ''}
                  saveStudySlot={saveStudySlot}
                />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  {slotLabel}
                </span>
              )}
            </div>

            {/* 자료 색상 — 학생이 고른 색이 시간표·캘린더 등 어디서나 이 색으로 표시된다 */}
            {saveMaterialColor && (
              <MaterialColorPicker
                materialType={materialType}
                materialId={materialId}
                current={material.color || ''}
                fallbackHex={getMaterialColor(material)}
                saveMaterialColor={saveMaterialColor}
              />
            )}
          </div>

          {/* 4. 공부한 날 — 진도 입력 히트맵 재사용 */}
          <div className={cardCls}>
            <p className={sectionTitleCls}>
              <FileText className="h-3.5 w-3.5 text-[#0071E3]" />
              공부한 날
            </p>
            {/* 히트맵 읽는 법 — 세 상태(입력/학습일 미입력/비학습·휴가) 설명. 범례는 InputHeatmap 안에. */}
            <p className="mt-1.5 break-keep text-[11px] font-medium text-slate-400 dark:text-slate-400">
              진도를 입력한 날이 파란색으로 칠해져요. 옅은 칸은 학습 요일인데 입력이 없던 날, 빈 칸은 학습 요일이 아니거나 휴가였던 날이에요.
            </p>
            <InputHeatmap inputLog={material.inputLog} studyDays={studyDays} leaveDates={leaveDates} detailedPlans={material.detailedPlans} unit={unit} isSelfPaced={isSelfPaced} reviewLog={material.reviewLog} />
          </div>

          {/* 5. 기록 — 최근 완료·복습·시작점 조정 이력 */}
          <div className={cardCls}>
            <p className={sectionTitleCls}>
              <History className="h-3.5 w-3.5 text-[#0071E3]" />
              기록
            </p>
            {!hasRecords ? (
              <p className="mt-2.5 break-keep text-[11px] font-medium text-slate-400 dark:text-slate-400">
                아직 기록이 없어요. 오늘 한 만큼 입력하면 여기에 쌓여요.
              </p>
            ) : (
              <div className="mt-2.5 space-y-3">
                {recentCompletions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">최근 7일 완료</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {recentCompletions.map((item) => (
                        <span
                          key={item.date}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 tabular-nums"
                        >
                          {fmtShortDate(item.date)}{typeof item.amount === 'number' ? ` · ${item.amount}${unit}` : ''} ✅
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {recentReviews.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">복습 기록</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {recentReviews.map(([date, min]) => (
                        <span
                          key={date}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums"
                        >
                          {fmtShortDate(date)} · 복습 {min}분
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {recentAdjusts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">시작점 조정</p>
                    <div className="mt-1.5 space-y-1.5">
                      {recentAdjusts.map((entry, idx) => (
                        <div
                          key={`${entry.date}_${idx}`}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                        >
                          <span className="tabular-nums">{fmtShortDate(entry.date)}</span>
                          <span className="tabular-nums">{(Number(entry.from) || 0) + 1}{unit} → {(Number(entry.to) || 0) + 1}{unit}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              entry.auto
                                ? 'bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/20 text-[#0071E3]'
                                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {entry.auto ? '바로 반영' : '신청'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. 빠른 액션 + 연결 링크 */}
          <div className="grid grid-cols-1 gap-2 pb-1 sm:grid-cols-3">
            <button
              type="button"
              onClick={onOpenSubjectProgress}
              className="flex min-h-11 items-center justify-between gap-1 rounded-2xl border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-3.5 py-2.5 text-[11px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/[0.04] dark:hover:bg-[#0071E3]/15 active:scale-[0.98]"
            >
              과목별 진도에서 보기
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button
              type="button"
              onClick={onOpenTimetable}
              className="flex min-h-11 items-center justify-between gap-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98]"
            >
              오늘 계획(시간표) 보기
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
            <button
              type="button"
              onClick={onOpenChangeRequest}
              className="flex min-h-11 items-center justify-between gap-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3.5 py-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98]"
            >
              변경 신청하기
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 자료 이름 인라인 편집 — 연필을 누르면 입력 모드. 저장 즉시 반영(승인 불필요), 관리자에겐 변경 이력만 남는다.
// 저장은 /api/student/material-rename(본인 세션 자료만, patch 방식). 시트 안에서는 로컬 오버라이드로 즉시 갱신하고,
// 홈/시간표 등 나머지 화면은 기존 조용한 갱신(포커스 복귀 재조회) 때 새 이름으로 따라온다.
function MaterialTitleEditor({
  materialType,
  materialId,
  title,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  title: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  // 저장 성공 직후 새 이름 — 전역 student 상태가 갱신되기 전까지 시트 표시를 담당.
  const [override, setOverride] = useState<string | null>(null);

  // 다른 자료로 시트가 바뀌면 편집 상태·오버라이드 초기화.
  useEffect(() => {
    setEditing(false);
    setOverride(null);
  }, [materialId]);

  const shown = override ?? title;

  const save = async () => {
    const next = draft.trim().replace(/\s+/g, ' ');
    if (!next) {
      toast.error('자료 이름을 입력해 주세요.');
      return;
    }
    if (next.length > 40) {
      toast.error('자료 이름은 40자까지 입력할 수 있어요.');
      return;
    }
    if (next === shown) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/student/material-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, newTitle: next }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setOverride(next);
        setEditing(false);
        toast.success('자료 이름을 바꿨어요. 선생님께도 변경 내역이 전달돼요.');
      } else {
        toast.error(json?.message || '이름 변경에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('이름 변경에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="mt-1 flex items-start gap-1.5">
        <h2 className="min-w-0 break-keep text-[16px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
          {shown}
        </h2>
        <button
          type="button"
          onClick={() => { setDraft(shown); setEditing(true); }}
          aria-label="자료 이름 바꾸기"
          title="자료 이름 바꾸기"
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100/80 dark:bg-white/10 text-slate-400 dark:text-slate-400 transition hover:bg-slate-200/80 dark:hover:bg-white/15 hover:text-[#0071E3] active:scale-95"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          maxLength={40}
          disabled={saving}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="shrink-0 rounded-xl bg-[#0071E3] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0077ED] active:scale-95 disabled:opacity-40"
        >
          {saving ? '저장 중' : '저장'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setEditing(false)}
          className="shrink-0 rounded-xl border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 disabled:opacity-40"
        >
          취소
        </button>
      </div>
      <p className="mt-1 break-keep text-[10px] font-medium text-slate-400 dark:text-slate-400">
        1~40자로 입력해요. 바꾼 이름은 바로 반영되고, 선생님께 변경 내역이 남아요.
      </p>
    </div>
  );
}

// 시:분 슬롯이 겹치는 교시 안내 문구('3교시~4교시') — timeSlotPeriodKeys 를 사람이 읽는 라벨로.
function describeTimeSlotPeriods(slot: string): string {
  const keys = timeSlotPeriodKeys(slot);
  if (keys.length === 0) return '';
  const first = formatSlotLabel(keys[0]);
  const last = formatSlotLabel(keys[keys.length - 1]);
  return keys.length === 1 ? first : `${first}~${last}`;
}

// 자료별 교시 배치 편집 — 교시 선택(preset)과 시간 직접입력(t:HH:MM-HH:MM) 두 모드.
// 두 모드 모두 같은 saveStudySlot 경로로 저장한다(값만 다름).
function StudySlotEditor({
  materialType,
  materialId,
  currentSlot,
  saveStudySlot,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  currentSlot: string;
  saveStudySlot: (materialType: 'book' | 'lecture', materialId: string, slot: string) => Promise<boolean>;
}) {
  const fromMin = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const parsed = parseTimeSlot(currentSlot);
  const [mode, setMode] = useState<'preset' | 'time'>(isTimeSlot(currentSlot) ? 'time' : 'preset');
  const [startT, setStartT] = useState(parsed ? fromMin(parsed.startMin) : '13:50');
  const [endT, setEndT] = useState(parsed ? fromMin(parsed.endMin) : '15:00');
  const [saving, setSaving] = useState(false);

  // 다른 자료로 시트가 바뀌면 입력값·모드를 동기화.
  useEffect(() => {
    const p = parseTimeSlot(currentSlot);
    setMode(isTimeSlot(currentSlot) ? 'time' : 'preset');
    if (p) { setStartT(fromMin(p.startMin)); setEndT(fromMin(p.endMin)); }
  }, [materialId, currentSlot]);

  const save = async (slot: string, okMsg: string) => {
    setSaving(true);
    try {
      const ok = await saveStudySlot(materialType, materialId, slot);
      if (ok) toast.success(okMsg);
      else toast.error('교시 배치에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const timeValue = `t:${startT}-${endT}`;
  const timeValid = !!startT && !!endT && startT < endT;
  const periodHint = timeValid ? describeTimeSlotPeriods(timeValue) : '';
  // 겹치는 교시가 없는 시간은 저장을 막는다 — 저장되면 자동배치로 떨어져 지정 시간과 무관한 교시에 뜬다.
  const timeSavable = timeValid && periodHint !== '';

  return (
    <div className="inline-flex flex-col gap-1.5">
      <div className="inline-flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        <Clock className="h-3 w-3 text-[#0071E3]" />
        <span>교시</span>
        {mode === 'preset' ? (
          <select
            value={isTimeSlot(currentSlot) ? '' : currentSlot}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value;
              void save(next, next ? `${formatSlotLabel(next)}에 배치했어요.` : '교시 배치를 해제했어요.');
            }}
            className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 py-0.5 text-[11px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
          >
            {STUDY_SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="time"
              value={startT}
              disabled={saving}
              onChange={(e) => setStartT(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1 py-0.5 text-[11px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
            />
            <span className="text-slate-400">~</span>
            <input
              type="time"
              value={endT}
              disabled={saving}
              onChange={(e) => setEndT(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1 py-0.5 text-[11px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              disabled={saving || !timeSavable}
              onClick={() => void save(timeValue, `${describeTimeSlotPeriods(timeValue) || '해당 시간'}에 배치했어요.`)}
              className="rounded-md bg-[#0071E3] px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-[#0077ED] active:scale-95 disabled:opacity-40"
            >
              적용
            </button>
            {isTimeSlot(currentSlot) && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save('', '교시 배치를 해제했어요.')}
                className="rounded-md border border-slate-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 disabled:opacity-40"
              >
                해제
              </button>
            )}
          </>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => setMode((m) => (m === 'preset' ? 'time' : 'preset'))}
          className="rounded-md border border-[#0071E3]/25 bg-[#0071E3]/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-95 disabled:opacity-40 dark:bg-[#0071E3]/15"
        >
          {mode === 'preset' ? '시간 직접입력' : '교시 선택'}
        </button>
      </div>
      {mode === 'time' && (
        <p className="break-keep pl-1 text-[10px] font-medium text-slate-400 dark:text-slate-400">
          {!timeValid
            ? '시작 시간이 끝 시간보다 빨라야 해요.'
            : periodHint
              ? `${periodHint}에 배치돼요.`
              : '겹치는 교시가 없어요. 학원 시간(08:20~23:20) 안으로 맞춰 주세요.'}
        </p>
      )}
    </div>
  );
}

// 자료 색상 피커 — 학생이 교재/인강별 색을 고른다. 이 색이 시간표·캘린더·홈 등 어디서나 쓰인다.
function MaterialColorPicker({
  materialType,
  materialId,
  current,
  fallbackHex,
  saveMaterialColor,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  current: string;
  fallbackHex: string;
  saveMaterialColor: (materialType: 'book' | 'lecture', materialId: string, color: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState('');
  const explicit = hasExplicitColor(current);
  const save = async (colorKey: string) => {
    setSaving(colorKey || 'reset');
    try {
      const ok = await saveMaterialColor(materialType, materialId, colorKey);
      if (ok) toast.success(colorKey ? '색상을 바꿨어요.' : '기본 색으로 되돌렸어요.');
      else toast.error('색상 저장에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSaving('');
    }
  };
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-slate-100 dark:border-white/10 pt-2.5">
      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: fallbackHex }} />
        자료 색상
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {MATERIAL_COLORS.map((c) => {
          const active = current === c.key;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!!saving}
              onClick={() => save(c.key)}
              aria-label={`${c.label} 색상`}
              title={c.label}
              className={`h-6 w-6 rounded-full ring-offset-1 ring-offset-white dark:ring-offset-[#1c1c1e] transition active:scale-90 disabled:opacity-50 ${active ? 'ring-2 ring-slate-900 dark:ring-white' : 'ring-1 ring-black/10 dark:ring-white/15'}`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
        {explicit && (
          <button
            type="button"
            disabled={!!saving}
            onClick={() => save('')}
            className="rounded-md border border-slate-200 dark:border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 disabled:opacity-40"
          >
            기본
          </button>
        )}
      </div>
    </div>
  );
}

// selfPaced 자료의 예상 총 분량 입력 — 학생 셀프서비스. 예측 OK, 저장해도 계획은 안 생기고 진행률만 보여요.
function SelfPacedTotalInput({
  materialType,
  materialId,
  unit,
  currentTotal,
  isEstimate,
  onSave,
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  unit: string;
  currentTotal: number;
  isEstimate: boolean;
  onSave: (materialType: 'book' | 'lecture', materialId: string, estimatedTotal: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(currentTotal > 0 ? String(currentTotal) : '');
  const [saving, setSaving] = useState(false);

  // 다른 자료로 시트가 바뀌거나 총량이 갱신되면 입력값을 동기화.
  useEffect(() => {
    setDraft(currentTotal > 0 ? String(currentTotal) : '');
  }, [materialId, currentTotal]);

  const parsed = Math.max(0, Math.min(99999, Math.round(Number(draft) || 0)));
  const dirty = parsed !== (currentTotal > 0 ? currentTotal : 0);

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onSave(materialType, materialId, parsed);
      if (ok) toast.success(parsed > 0 ? `예상 총 ${parsed}${unit}(으)로 저장했어요.` : '예상 분량을 지웠어요.');
      else toast.error('저장에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[#0071E3]/25 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/10 p-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold text-[#0071E3]">예상 총 분량 입력</p>
        {isEstimate && currentTotal > 0 && (
          <span className="rounded-full bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#0071E3]">예상</span>
        )}
      </div>
      <p className="mt-1 break-keep text-[10px] font-medium text-slate-400 dark:text-slate-400">
        전체 분량을 알게 되면 입력해요. 예측이어도 괜찮아요. 진행률만 보이고 계획은 바뀌지 않아요.
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`예: 64${unit}처럼 알면 입력`}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
        />
        <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{unit}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="shrink-0 rounded-xl bg-[#0071E3] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0077ED] active:scale-95 disabled:opacity-40"
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </div>
    </div>
  );
}
