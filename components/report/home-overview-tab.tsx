'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, Clock, Award, MessageSquare, CalendarDays, Plus, Trash2, X, Target, AlertTriangle, Smartphone, Archive, PowerOff, Circle, Home, type LucideIcon } from 'lucide-react';
import { Student, DDayEvent } from '@/lib/types/student';
import type { DeadlineGoal } from '@/lib/deadline-goals';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { StudyStatsCard, StudyStats } from './study-stats-card';
import { LeaderboardCard } from './leaderboard-card';
import { AttendanceStatusCard } from './attendance-status-card';
import { PomodoroTimer } from './pomodoro-timer-modal';
import { TabHero } from './tab-hero';
import { StreakCard } from './streak-card';
import { getLeaveDates, getLeaveExemptions, getMakeupAmount, getMaterialStudyDays } from '@/lib/progress-plan';
import { STUDY_SLOT_OPTIONS, formatSlotLabel } from '@/lib/academy-timetable';

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

type DailyPlanDay = {
  label: string;
  dateLabel: string;
  entries: DailyPlanEntry[];
};

type SelfPacedItem = {
  id: string;
  subject: string;
  title: string;
  materialType: 'book' | 'lecture';
  materialId: string;
  unit: string;
  current: number;
  studyTime: string;
  loggedToday: boolean;
};

interface HomeOverviewTabProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  isStudentReport: boolean;
  todayDailyPlan: DailyPlanDay | undefined;
  todayPlanEntries: DailyPlanEntry[];
  todaySelfPacedItems?: SelfPacedItem[];
  saveSelfPacedToday?: (materialType: 'book' | 'lecture', materialId: string, addAmount: number, reviewMinutes?: number) => Promise<boolean>;
  saveStudySlot?: (materialType: 'book' | 'lecture', materialId: string, slot: string) => Promise<boolean>;
  pendingPlanId: string | null;
  setPendingPlanId: (id: string | null) => void;
  pendingAmount: number;
  setPendingAmount: React.Dispatch<React.SetStateAction<number>>;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string, reviewMinutes?: number) => Promise<boolean>;
  homeAttend: { loading: boolean; checkedIn: boolean; todayMinutes: number; since: string | null; sinceToday: boolean };
  homeTotalMin: number;
  currentSubjectText: string;
  currentStudyLabel: string;
  timeGreeting: string;
  currentBriefingPhrase: string;
  briefingSubMessage: string;
  rewardBanner: { show: boolean; reasons: string[] };
  setRewardBanner: React.Dispatch<React.SetStateAction<{ show: boolean; reasons: string[] }>>;
  submitChecklist: (e: React.FormEvent) => Promise<void>;
  checklistForm: { sleepHours: number; phoneSubmitted: boolean; phoneStatus: 'submitted' | 'locker' | 'off_hold'; phoneReason: string };
  setChecklistForm: React.Dispatch<React.SetStateAction<{ sleepHours: number; phoneSubmitted: boolean; phoneStatus: 'submitted' | 'locker' | 'off_hold'; phoneReason: string }>>;
  checklistSubmitting: boolean;
  activeTab: string;
  studyTimeLabels: Record<string, string>;
  studyStats: StudyStats | null;
  completedQuests: Record<number, boolean>;
  setCompletedQuests: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  deadlineSummary?: {
    expectedMinutes: number;
    actualMinutes: number;
    metToday: boolean;
    aheadDays: number;
    riskCount: number;
    goalCount: number;
  } | null;
  deadlineGoals?: DeadlineGoal[];
  openWeeklyPlan?: () => void;
}

export function HomeOverviewTab({
  student,
  setStudent,
  isStudentReport,
  todayDailyPlan,
  todayPlanEntries,
  todaySelfPacedItems = [],
  saveSelfPacedToday,
  saveStudySlot,
  pendingPlanId,
  setPendingPlanId,
  pendingAmount,
  setPendingAmount,
  updatePlanCompletion,
  homeAttend,
  homeTotalMin,
  currentSubjectText,
  currentStudyLabel,
  timeGreeting,
  currentBriefingPhrase,
  rewardBanner,
  setRewardBanner,
  submitChecklist,
  checklistForm,
  setChecklistForm,
  checklistSubmitting,
  activeTab,
  studyTimeLabels,
  studyStats,
  completedQuests,
  setCompletedQuests,
  deadlineSummary,
  deadlineGoals = [],
  openWeeklyPlan,
}: HomeOverviewTabProps) {
  const confirm = useConfirm();
  // D-Day FAB state
  const [ddayOpen, setDdayOpen] = useState(false);
  const [ddayTitle, setDdayTitle] = useState('');
  const [ddayDate, setDdayDate] = useState('');
  const [ddayAdding, setDdayAdding] = useState(false);
  const [ddayDeleting, setDdayDeleting] = useState<string | null>(null);
  // '완료 확인' 저장 중 표시 — 저장 성공 전에는 패널을 닫지 않는다(입력값 보존).
  const [completionSaving, setCompletionSaving] = useState(false);
  // 계획 완료 패널의 복습 시간(분) 입력 — 선택 입력(0이면 미복습). 패널 열릴 때 초기화.
  const [reviewMinutesInput, setReviewMinutesInput] = useState(0);
  // 자율 학습 '오늘 입력' 패널 상태 — 열린 항목 id·오늘 한 양·복습 분·저장중.
  const [selfPacedOpenId, setSelfPacedOpenId] = useState<string | null>(null);
  const [selfPacedAmount, setSelfPacedAmount] = useState(1);
  const [selfPacedReview, setSelfPacedReview] = useState(0);
  const [selfPacedSaving, setSelfPacedSaving] = useState(false);
  // 자율 학습 시간표 배치(studySlot) 저장 중인 항목 id.
  const [slotSavingId, setSlotSavingId] = useState<string | null>(null);

  const ddays: DDayEvent[] = student.ddays || [];

  const calcDiffDays = (dateStr: string) => {
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
    const target = new Date(dateStr);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  };

  const calcDiff = (dateStr: string) => {
    const diff = calcDiffDays(dateStr);
    if (diff === 0) return 'D-Day';
    return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  };

  const ddaySummary = [...ddays].sort((a, b) => {
    const aDiff = calcDiffDays(a.date);
    const bDiff = calcDiffDays(b.date);
    const aRank = aDiff >= 0 ? aDiff : 10000 + Math.abs(aDiff);
    const bRank = bDiff >= 0 ? bDiff : 10000 + Math.abs(bDiff);
    return aRank - bRank || a.date.localeCompare(b.date);
  });
  const primaryDday = ddaySummary[0];
  const secondaryDdays = ddaySummary.slice(1, 3);

  const handleAddDday = async () => {
    if (!ddayTitle.trim() || !ddayDate) return;
    setDdayAdding(true);
    try {
      const res = await fetch('/api/student/ddays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ddayTitle.trim(), date: ddayDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setStudent((s) => s ? { ...s, ddays: [...(s.ddays || []), json.dday] } : s);
        setDdayTitle('');
        setDdayDate('');
        setDdayOpen(false);
        toast.success('D-Day를 추가했어요.');
      } else {
        toast.error(json.message || 'D-Day 추가에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 D-Day를 추가하지 못했어요.');
    } finally {
      setDdayAdding(false);
    }
  };

  const handleDeleteDday = async (id: string) => {
    if (!(await confirm({ title: 'D-Day를 삭제할까요?', tone: 'danger', confirmText: '삭제' }))) return;
    setDdayDeleting(id);
    try {
      const res = await fetch(`/api/student/ddays?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setStudent((s) => s ? { ...s, ddays: (s.ddays || []).filter((d) => d.id !== id) } : s);
        toast.success('D-Day를 삭제했어요.');
      } else {
        toast.error(json.message || 'D-Day 삭제에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 D-Day를 삭제하지 못했어요.');
    } finally {
      setDdayDeleting(null);
    }
  };


  // 서울 기준 YYYY-MM-DD 날짜 키 구하기
  const getSeoulDateKey = () => {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  // 자료의 오늘 복습 분 — reviewLog[오늘] 조회(계획/자율 공통 배지용). subjects 단일소스에서 찾는다.
  const reviewMinFor = (materialType: 'book' | 'lecture', materialId: string): number => {
    const todayKey = getSeoulDateKey();
    const list: Array<{ id: string; reviewLog?: Record<string, number> }> = (student.subjects || [])
      .flatMap((s): Array<{ id: string; reviewLog?: Record<string, number> }> =>
        materialType === 'book' ? (s.books || []) : (s.lectures || []));
    const found = list.find((m) => m.id === materialId);
    return found?.reviewLog?.[todayKey] || 0;
  };

  // specialNote 파싱 헬퍼
  const getSpecialNoteObj = () => {
    try {
      if (!student.specialNote) return {};
      const obj = JSON.parse(student.specialNote);
      if (typeof obj === 'object' && obj !== null) return obj;
      return { noteText: student.specialNote };
    } catch {
      return { noteText: student.specialNote || '' };
    }
  };

  // 코멘트에서 퀘스트(할일) 추출 헬퍼 함수
  const extractQuestsFromComment = (comment?: string) => {
    if (!comment) return [];
    const lines = comment.split('\n');
    const quests: string[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(?:(?:\d+[\.\)]\s*)|(?:[-\*]\s*)|(?:\[\s*\]\s*)|(?:[①-⑨]\s*))(.*)$/);
      if (match && match[1]) {
        const content = match[1].trim();
        if (content) {
          quests.push(content);
        }
      }
    });

    return quests;
  };

  const fmtStudyMin = (min: number) => {
    if (!min || min <= 0) return '0분';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };

  const getCampusLabel = (val: string) => {
    switch(val) {
      case 'wonju': return '원주 캠퍼스';
      case 'chuncheon': return '춘천 캠퍼스';
      case 'chungju': return '충주 캠퍼스';
      default: return '학습 센터';
    }
  };

  const coachQuests = extractQuestsFromComment(student.studentLifeComment);
  const todayChecklistKey = getSeoulDateKey();
  const todayChecklistNote = getSpecialNoteObj();
  const todayChecklist = todayChecklistNote.daily_checklist?.[todayChecklistKey];
  const completedPlanCount = todayPlanEntries.filter((entry) => entry.isCompleted).length;
  const activeDeadlineGoals = isStudentReport ? deadlineGoals.filter((goal) => goal.targetAmount > 0) : [];
  // 기간목표도 '오늘 할 일'에 포함 — 오늘까지 기대치(예상목표치)를 채웠으면 완료로 집계(요약 배지와 동일 기준).
  // (전엔 일일계획+점검표만 세어 "기간목표 다 했는데 진행률이 안 오른다" 혼동이 있었음)
  const deadlineDoneToday = activeDeadlineGoals.filter((g) => g.expectedAmount <= 0 || g.actualAmount >= g.expectedAmount * 0.9).length;
  const todayMissionTotal = todayPlanEntries.length + 1 + activeDeadlineGoals.length;
  const todayMissionDone = completedPlanCount + (todayChecklist ? 1 : 0) + deadlineDoneToday;
  const todayMissionPercent = todayMissionTotal > 0 ? Math.round((todayMissionDone / todayMissionTotal) * 100) : 0;

  // 휴가 보강 총합 — 이번 주 승인 휴가로 이월된 자료별 보강량의 합.
  const totalMakeup = React.useMemo(() => {
    if (!isStudentReport) return 0;
    const leaveDates = getLeaveDates(student);
    const exemptions = getLeaveExemptions(student);
    if (leaveDates.size === 0) return 0;
    const now = new Date();
    // subjects 단일소스와 정렬 — 과목별 진도 탭도 subjects 만 렌더하므로 홈 요약도 subjects 만 집계
    // (레거시 최상위 books/lectures 폴백 제거: 홈엔 "보강 있음"인데 탭엔 배지가 없던 불일치 해소).
    const subjects = student.subjects || [];
    let sum = 0;
    for (const s of subjects) {
      for (const m of [...(s.books || []), ...(s.lectures || [])]) {
        sum += getMakeupAmount(m, now, getMaterialStudyDays(s.studyDays, m.studyDays), leaveDates, exemptions, (s as { studyTime?: string }).studyTime, student.makeupCarryovers).makeupTotal;
      }
    }
    return sum;
  }, [isStudentReport, student]);

  // 최근(14일) 외출 반영 계획조정 — 홈에서 서브탭 없이 바로 확인.
  const recentAwayReplans = React.useMemo(() => {
    if (!isStudentReport) return [];
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    return (student.awayReplanNotices || [])
      .filter((n) => (n.appliedAt || '') >= cutoff)
      .slice(-5)
      .reverse();
  }, [isStudentReport, student]);

  const renderCoachQuestList = () => {
    if (coachQuests.length === 0) return null;
    return (
      <div className="rounded-3xl border border-[#0071E3]/15 bg-white dark:bg-[#1c1c1e] p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            코멘터 특별 퀘스트
          </h3>
          <span className="text-[10px] text-[#0071E3]/80 font-bold bg-[#0071E3]/5 dark:bg-[#0071E3]/15 px-2.5 py-1 rounded-full">
            완료 체크 시 학생 홈에 실시간 반영
          </span>
        </div>
        <div className="space-y-3.5 pl-0.5">
          {coachQuests.map((quest, idx) => {
            const storageKey = `ssc-coach-quest-done:${student.id}:${quest}:${idx}`;
            const isDone = completedQuests[idx] || false;
            return (
              <div key={`${quest}_${idx}`} className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-white/5 border border-slate-100/50 dark:border-white/10 p-3.5 rounded-2xl">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => {
                    setCompletedQuests((prev) => {
                      const next = { ...prev, [idx]: e.target.checked };
                      window.localStorage.setItem(storageKey, e.target.checked ? 'true' : 'false');
                      return next;
                    });
                  }}
                  className="w-4.5 h-4.5 rounded border-slate-300 dark:border-white/10 text-[#0071E3] focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-transform active:scale-90"
                />
                <span className={isDone ? 'line-through text-slate-400 dark:text-slate-400 font-medium' : ''}>
                  {quest}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
    <div id="report-overview" className={`scroll-mt-24 border-b border-slate-100 dark:border-white/10 pb-8 flex-col md:flex-row justify-between md:items-start gap-6 ${!isStudentReport || activeTab === 'report-overview' ? 'flex' : 'hidden print:flex'}`}>
      {isStudentReport ? (
        <div className="stagger-children w-full space-y-5">
          {/* 홈 대표카드 + 연속출석(미션 탭 해체로 홈으로 이동) */}
          <TabHero
            eyebrow="Home"
            icon={Home}
            title="홈"
            description="오늘 할 일과 연속출석을 한곳에서 확인해요."
          />
          <StreakCard />
          {totalMakeup > 0 && (
            <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/25 px-3.5 py-2.5 text-[12px] font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              최근 휴가로 이번 주 보강이 있어요 — 과목별 진도 탭에서 보강량을 확인하세요.
            </p>
          )}
          {recentAwayReplans.length > 0 && (
            <div className="rounded-2xl border border-[#0071E3]/20 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/12 dark:border-[#0071E3]/30 px-3.5 py-2.5 space-y-1.5">
              <p className="flex items-center gap-2 text-[12px] font-bold text-[#0071E3]">
                <CalendarDays className="h-4 w-4 shrink-0" />
                외출 반영으로 학습 계획이 조정됐어요
              </p>
              {recentAwayReplans.map((n) => (
                <p key={n.id} className="pl-6 text-[11px] font-semibold leading-4 text-slate-600 dark:text-slate-400">
                  {n.subjectName} {n.materialTitle} · {n.summary}
                </p>
              ))}
              <p className="pl-6 text-[10px] font-medium text-slate-400 dark:text-slate-500">학습계획 · 주간 계획 탭에서 조정된 일정을 확인하세요.</p>
            </div>
          )}
          {/* 압축 히어로 — 1줄 인사 + 날짜. 390px 첫 화면에서 '오늘 할 일 요약'이 바로 보이게 낮췄다. */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-xl">
                {student.name}님, {timeGreeting} 👋
              </h1>
              <p className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </p>
            </div>
            <p className="text-[12px] font-medium text-[#0071E3]">{currentBriefingPhrase}</p>
          </div>

          <div id="today-mission-card" className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#0071E3]">오늘 할 일 요약</p>
                <h2 className="mt-1 text-[17px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  {todayMissionDone}/{todayMissionTotal}개 완료
                </h2>
                <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                  {/* 미션/보상 탭과 혼동되지 않게 집계 기준(계획+기간목표+점검표)을 명시 */}
                  오늘 계획 {todayPlanEntries.length}건{activeDeadlineGoals.length > 0 ? ` + 기간목표 ${activeDeadlineGoals.length}개` : ''} + 아침 점검표{todayDailyPlan ? ` · ${todayDailyPlan.dateLabel}` : ''}
                </p>
              </div>
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 text-[15px] font-semibold text-[#0071E3] tabular-nums">
                {todayMissionPercent}%
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full w-full origin-left rounded-full bg-[#0071E3] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, todayMissionPercent)) / 100})` }}
              />
            </div>

            {/* 기간 목표 요약 한 줄 — 자세한 진행/입력은 미션 탭에서 */}
            {deadlineSummary && deadlineSummary.goalCount > 0 && (
              <div
                className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3.5 py-2.5 text-[11px] font-semibold break-keep ${
                  deadlineSummary.metToday
                    ? 'border-emerald-100 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                    : 'border-amber-200/60 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <Target className="h-3.5 w-3.5 text-[#0071E3]" />
                  기간 목표 {deadlineSummary.goalCount}개
                </span>
                {deadlineSummary.metToday ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    오늘치 완료{deadlineSummary.aheadDays > 0 ? ` · 약 ${deadlineSummary.aheadDays}일치 앞섬` : ''}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 tabular-nums">
                    진행 {deadlineSummary.actualMinutes}분 / 예상목표치 {deadlineSummary.expectedMinutes}분
                  </span>
                )}
                {deadlineSummary.riskCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    뒤처진 자료 {deadlineSummary.riskCount}개
                  </span>
                )}
              </div>
            )}

            {activeDeadlineGoals.length > 0 && (
              <div className="mt-3 space-y-2 rounded-2xl border border-[#0071E3]/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    <Target className="h-3.5 w-3.5 text-[#0071E3]" />
                    주간 목표 페이스
                  </p>
                  <span className="rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-400">
                    오늘 계획과 별도
                  </span>
                </div>

                {activeDeadlineGoals.map((goal) => {
                  const done = goal.actualAmount >= goal.targetAmount;
                  const recommend = Math.min(Math.max(0, goal.targetAmount - goal.actualAmount), Math.max(0, goal.todayRecommend));
                  // 예상목표치(오늘까지 누적 기대) 90% 이상이면 오늘 완료 표시. 홈은 요약만 — 입력은 실행계획 탭.
                  const metToday = goal.expectedAmount > 0 && goal.actualAmount >= goal.expectedAmount * 0.9;

                  return (
                    <div key={goal.id} className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                            {goal.subject} · {goal.title}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                            이번 주 목표: {goal.rangeText}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : goal.behind ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                        }`}>
                          {done ? '주간 완료' : `${goal.actualAmount}/${goal.targetAmount}${goal.unit}`}
                        </span>
                      </div>

                      <div className="mt-2 grid gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                        <p className="rounded-lg bg-slate-50 dark:bg-white/5 px-2.5 py-1.5">
                          오늘 권장: <span className={metToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#0071E3]'}>{metToday ? '완료' : recommend > 0 ? `${recommend}${goal.unit}` : '권장량 없음'}</span>
                        </p>
                        <p className="rounded-lg bg-slate-50 dark:bg-white/5 px-2.5 py-1.5">
                          예상목표치: <span className="text-slate-800 dark:text-slate-200">{goal.expectedAmount}{goal.unit}</span>
                        </p>
                      </div>

                    </div>
                  );
                })}
                <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    진도 입력은 <span className="font-bold text-[#0071E3]">학습계획 · 주간 계획</span> 탭에서 해요.
                  </p>
                  {openWeeklyPlan && (
                    <button
                      type="button"
                      onClick={openWeeklyPlan}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[11px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/5 active:scale-[0.98] sm:self-auto"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      진도 확인·수정
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  if (!todayChecklist) {
                    document.getElementById('morning-checklist-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                  todayChecklist
                    ? 'border-emerald-100 bg-emerald-50/45 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                    : 'border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 hover:border-[#0071E3]/20 hover:bg-[#0071E3]/[0.03] dark:hover:bg-[#0071E3]/15'
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                  todayChecklist ? 'border-emerald-200 bg-emerald-500 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-300 dark:text-slate-600'
                }`}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-semibold ${todayChecklist ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                    아침 자가 점검
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">
                    {todayChecklist
                      ? `수면 ${todayChecklist.sleep_hours}시간 · 휴대폰 기록 완료`
                      : '컨디션을 기록하면 오늘 할 일 진행률에 반영돼요'}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  todayChecklist ? 'bg-white text-emerald-700 dark:bg-white/10 dark:text-emerald-300' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'
                }`}>
                  {todayChecklist ? '완료' : '기록'}
                </span>
              </button>

              {todayPlanEntries.length > 0 ? (
                todayPlanEntries.map((entry, index) => {
                  const isPending = pendingPlanId === entry.id;
                  const _r = entry.rangeText || '';
                  const unit = _r.includes('문제') ? '문제' : _r.includes('강') ? '강' : _r.toLowerCase().includes('p') ? 'p' : _r.replace(/\d+회독/g, '').includes('회') ? '회' : '';
                  return (
                    <div key={entry.id} className={`rounded-2xl border p-3 transition ${
                      entry.isCompleted ? 'border-emerald-100 bg-emerald-50/45 dark:border-emerald-500/25 dark:bg-emerald-500/10' : isPending ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                    }`}>
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.isCompleted) {
                              updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, false, undefined, entry.dateKey);
                            } else {
                              setPendingPlanId(entry.id);
                              setPendingAmount(entry.dailyAmount ?? 1);
                              setReviewMinutesInput(reviewMinFor(entry.materialType, entry.materialId));
                            }
                          }}
                          aria-pressed={entry.isCompleted}
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition active:scale-95 ${
                            entry.isCompleted
                              ? 'border-emerald-200 bg-emerald-500 text-white'
                              : isPending
                                ? 'border-amber-300 bg-white text-amber-500 dark:border-amber-500/40 dark:bg-[#1c1c1e] dark:text-amber-400'
                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-300 dark:text-slate-600 hover:border-[#0071E3]/40 hover:text-[#0071E3]'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={`truncate text-[13px] font-semibold ${entry.isCompleted ? 'text-emerald-800 dark:text-emerald-300 line-through decoration-emerald-500/40' : 'text-slate-900 dark:text-slate-100'}`}>
                                {entry.subject} · {entry.title}
                              </p>
                              <p className="mt-1 truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">
                                {studyTimeLabels[entry.studyTime] || '미지정'} · {entry.type} · {entry.dailyLabel}
                              </p>
                              {reviewMinFor(entry.materialType, entry.materialId) > 0 && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  복습 {reviewMinFor(entry.materialType, entry.materialId)}분 ✅
                                </span>
                              )}
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                              entry.isCompleted ? 'bg-white text-emerald-700 dark:bg-white/10 dark:text-emerald-300' : isPending ? 'bg-white text-amber-700 dark:bg-white/10 dark:text-amber-300' : 'bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                            }`}>
                              {entry.isCompleted ? `완료 ${entry.actualAmount ?? '?'}${unit}` : `${index + 1}번`}
                            </span>
                          </div>

                          {isPending && (
                            <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">실제로 얼마나 했나요?</p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPendingAmount((v) => Math.max(0, v - 1))}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                                >
                                  -
                                </button>
                                <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {pendingAmount}{unit}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPendingAmount((v) => v + 1)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                                >
                                  +
                                </button>
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">복습 시간(분) <span className="font-medium text-slate-400 dark:text-slate-500">선택</span></label>
                                <input
                                  type="number"
                                  min={0}
                                  max={1440}
                                  value={reviewMinutesInput || ''}
                                  onChange={(e) => setReviewMinutesInput(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))}
                                  placeholder="0"
                                  className="h-9 w-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 text-right text-[13px] font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                                />
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  disabled={completionSaving}
                                  onClick={async () => {
                                    if (completionSaving) return;
                                    setCompletionSaving(true);
                                    try {
                                      const ok = await updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, true, pendingAmount, entry.dateKey, reviewMinutesInput);
                                      // 성공 시에만 패널 닫기 — 실패하면 입력값 그대로 유지(실패 토스트는 저장 훅에서).
                                      if (ok) setPendingPlanId(null);
                                    } finally {
                                      setCompletionSaving(false);
                                    }
                                  }}
                                  className="flex-1 rounded-full bg-emerald-500 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97] disabled:opacity-60"
                                >
                                  {completionSaving ? '저장 중...' : '완료 확인'}
                                </button>
                                <button
                                  type="button"
                                  disabled={completionSaving}
                                  onClick={() => setPendingPlanId(null)}
                                  className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : todaySelfPacedItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-4 py-5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  오늘 배정된 항목이 없어요. 자율 학습 계획을 확인해 보세요.
                </p>
              ) : null}

              {/* 자율 학습 그룹 — selfPaced 자료(목표 없이 누적 입력). 오늘 할 일 완료 카운트에 포함하지 않는다. */}
              {todaySelfPacedItems.length > 0 && (
                <div className="mt-1 space-y-2.5 rounded-2xl border border-[#0071E3]/10 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <Target className="h-3.5 w-3.5 text-[#0071E3]" />
                      자율 학습
                    </p>
                    <span className="rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-400">
                      오늘 할 일 완료와 별도
                    </span>
                  </div>

                  {todaySelfPacedItems.map((item) => {
                    const isOpen = selfPacedOpenId === item.id;
                    const reviewMin = reviewMinFor(item.materialType, item.materialId);
                    return (
                      <div key={item.id} className={`rounded-xl border p-3 transition ${
                        item.loggedToday ? 'border-emerald-100 bg-emerald-50/45 dark:border-emerald-500/25 dark:bg-emerald-500/10' : isOpen ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                              {item.subject} · {item.title}
                            </p>
                            <p className="mt-1 truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">
                              {formatSlotLabel(item.studyTime)} · {item.materialType === 'book' ? '교재' : '인강'} · 누적 {item.current}{item.unit}
                            </p>
                            {reviewMin > 0 && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                복습 {reviewMin}분 ✅
                              </span>
                            )}
                          </div>
                          {item.loggedToday ? (
                            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-white/10 dark:text-emerald-300">
                              오늘 입력 완료 ✅
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (isOpen) { setSelfPacedOpenId(null); return; }
                                setSelfPacedOpenId(item.id);
                                setSelfPacedAmount(1);
                                setSelfPacedReview(reviewMin);
                              }}
                              className="shrink-0 rounded-full border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-3 py-1.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/5 active:scale-95"
                            >
                              오늘 입력
                            </button>
                          )}
                        </div>

                        {/* 시간표 배치 — 자료별 학생 지정 슬롯. 미지정이면 시간표에 안 뜨고 여기(그날 할일)에만 노출. */}
                        {saveStudySlot && (
                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-slate-100 dark:border-white/10 pt-2.5">
                            <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              <Clock className="h-3.5 w-3.5 text-[#0071E3]" />
                              시간표 배치
                            </label>
                            <select
                              value={item.studyTime || ''}
                              disabled={slotSavingId === item.id}
                              onChange={async (e) => {
                                const next = e.target.value;
                                setSlotSavingId(item.id);
                                try {
                                  const ok = await saveStudySlot(item.materialType, item.materialId, next);
                                  if (ok) toast.success(next ? `시간표 ${formatSlotLabel(next)}에 배치했어요.` : '시간표에서 내렸어요.');
                                  else toast.error('시간대 설정에 실패했어요. 다시 시도해 주세요.');
                                } finally {
                                  setSlotSavingId(null);
                                }
                              }}
                              className="h-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 text-[12px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
                            >
                              {STUDY_SLOT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {isOpen && !item.loggedToday && (
                          <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">오늘 얼마나 했나요?</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelfPacedAmount((v) => Math.max(0, v - 1))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                              >
                                -
                              </button>
                              <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {selfPacedAmount}{item.unit}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelfPacedAmount((v) => v + 1)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                              >
                                +
                              </button>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">복습 시간(분) <span className="font-medium text-slate-400 dark:text-slate-500">선택</span></label>
                              <input
                                type="number"
                                min={0}
                                max={1440}
                                value={selfPacedReview || ''}
                                onChange={(e) => setSelfPacedReview(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))}
                                placeholder="0"
                                className="h-9 w-20 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 text-right text-[13px] font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                              />
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={selfPacedSaving || !saveSelfPacedToday}
                                onClick={async () => {
                                  if (selfPacedSaving || !saveSelfPacedToday) return;
                                  setSelfPacedSaving(true);
                                  try {
                                    const ok = await saveSelfPacedToday(item.materialType, item.materialId, selfPacedAmount, selfPacedReview);
                                    if (ok) {
                                      setSelfPacedOpenId(null);
                                      toast.success('오늘 학습을 기록했어요.');
                                    }
                                  } finally {
                                    setSelfPacedSaving(false);
                                  }
                                }}
                                className="flex-1 rounded-full bg-emerald-500 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600 active:scale-[0.97] disabled:opacity-60"
                              >
                                {selfPacedSaving ? '저장 중...' : '저장'}
                              </button>
                              <button
                                type="button"
                                disabled={selfPacedSaving}
                                onClick={() => setSelfPacedOpenId(null)}
                                className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* 🔵 리워드 달성 배너 알림 */}
          {rewardBanner.show && (
            <div className="no-print relative overflow-hidden rounded-3xl border border-emerald-300/60 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/10 p-5 shadow-[0_8px_24px_rgba(16,185,129,0.12)] animate-fade-in-up">
              <div className="absolute -right-4 -top-4 text-6xl opacity-10 select-none pointer-events-none">🎁</div>
              <div className="flex items-start gap-3.5">
                <div className="shrink-0 w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
                  <span className="text-lg">🎁</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-emerald-800 dark:text-emerald-300 tracking-tight">미션 달성! 쿠폰이 지급되었어요 🎉</p>
                  <p className="text-[11px] font-bold text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">오늘 학습 미션을 완수하여 휴가/반차 쿠폰이 자동 적립되었습니다.</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {rewardBanner.reasons.map((r, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 bg-white/80 dark:bg-white/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-200/60 dark:border-emerald-500/25 shadow-sm">
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* D-Day 요약 카드 — '오늘 할 일'보다 아래(정보위계) */}
          <button
            type="button"
            onClick={() => setDdayOpen(true)}
            className="no-print w-full rounded-2xl border border-[#0071E3]/10 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-3.5 text-left shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)] transition hover:border-[#0071E3]/25 active:scale-[0.99]"
            aria-label="D-Day 관리"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0071E3]">
                <CalendarDays className="h-3.5 w-3.5" />
                D-Day
              </span>
              <span className="rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-400 shadow-sm">관리</span>
            </span>
            {primaryDday ? (
              <>
                <span className="mt-2 flex items-end justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">{primaryDday.title}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-400 dark:text-slate-400">{primaryDday.date}</span>
                  </span>
                  <span className="shrink-0 text-[18px] font-semibold leading-none text-[#0071E3] tabular-nums">
                    {calcDiff(primaryDday.date)}
                  </span>
                </span>
                {secondaryDdays.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {secondaryDdays.map((d) => (
                      <span key={d.id} className="max-w-full truncate rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
                        {calcDiff(d.date)} · {d.title}
                      </span>
                    ))}
                  </span>
                )}
              </>
            ) : (
              <span className="mt-2 block rounded-xl border border-dashed border-[#0071E3]/20 bg-white/70 dark:bg-[#1c1c1e]/95 px-3 py-2 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                등록된 일정이 없습니다.
              </span>
            )}
          </button>

          {/* 🔵 뽀모도로 타이머 & 아침 자가 점검표 위젯 레이아웃 (가로 2열 그리드) */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            {/* 1. 뽀모도로 타이머 */}
            <PomodoroTimer
              student={student}
              setStudent={setStudent}
              setRewardBanner={setRewardBanner}
            />

            {/* 2. 아침 자가 점검표 & 코멘팅 팁 */}
            {(() => {
              const note = getSpecialNoteObj();
              const todayKey = getSeoulDateKey();
              const checklist = note.daily_checklist?.[todayKey];

              if (!checklist) {
                return (
                  <form id="morning-checklist-card" onSubmit={submitChecklist} className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm flex flex-col justify-between gap-5 sm:p-6">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">아침 자가 점검표</p>
                      <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400 dark:text-slate-400">매일 아침 본인의 컨디션과 환경을 스스로 기록하세요.</p>
                    </div>

                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label htmlFor="sleepHoursInput" className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">어젯밤 수면 시간</label>
                        <div className="flex items-center gap-2">
                          <select
                            id="sleepHoursInput"
                            value={checklistForm.sleepHours}
                            onChange={(e) => setChecklistForm(f => ({ ...f, sleepHours: Number(e.target.value) }))}
                            className="h-11 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 px-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                          >
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map(h => (
                              <option key={h} value={h}>{h}시간</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <label className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">등원 시 휴대폰</label>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            ['submitted', '제출완료', Smartphone],
                            ['locker', '임시보관함', Archive],
                            ['off_hold', '전원끄고소지', PowerOff],
                          ] as Array<['submitted' | 'locker' | 'off_hold', string, LucideIcon]>).map(([val, label, Icon]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setChecklistForm(f => ({ ...f, phoneStatus: val, phoneSubmitted: val === 'submitted' }))}
                              className={`min-h-14 rounded-2xl border px-1.5 py-2.5 text-[11px] font-semibold leading-tight transition active:scale-95 ${
                                checklistForm.phoneStatus === val
                                  ? 'bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 border-[#0071E3] text-[#0071E3]'
                                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                              }`}
                            >
                              <Icon className="mx-auto mb-0.5 h-4 w-4" />
                              {label}
                            </button>
                          ))}
                        </div>
                        {checklistForm.phoneStatus !== 'submitted' && (
                          <textarea
                            value={checklistForm.phoneReason}
                            onChange={(e) => setChecklistForm(f => ({ ...f, phoneReason: e.target.value }))}
                            rows={2}
                            placeholder="휴대폰을 제출하지 못하는 사유를 적어 주세요 (관리자에게 전달돼요)"
                            className="w-full rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/10 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-400 focus:outline-none resize-none"
                          />
                        )}
                        <p className="text-[11px] font-medium leading-5 text-slate-400 dark:text-slate-400">휴대폰은 원칙적으로 제출이에요. 부득이하면 임시보관함/전원끄고소지를 사유와 함께 신청해 주세요.</p>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={checklistSubmitting || (checklistForm.phoneStatus !== 'submitted' && !checklistForm.phoneReason.trim())}
                      className="w-full rounded-full bg-slate-900 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                    >
                      {checklistSubmitting ? '기록 중...' : '컨디션 기록 완료'}
                    </button>
                  </form>
                );
              }

              const isSleepShort = checklist.sleep_hours < 6;
              const phoneStatusLabel = checklist.phone_status === 'locker' ? '임시보관함'
                : checklist.phone_status === 'off_hold' ? '전원끄고 소지'
                : (checklist.phone_status === 'submitted' || checklist.phone_submitted) ? '제출 완료' : '미제출';
              const isPhoneNotSubmitted = checklist.phone_status ? checklist.phone_status !== 'submitted' : !checklist.phone_submitted;

              let bannerBg = 'bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-300';
              let BannerIcon = CheckCircle2;
              let bannerTitle = '기분 좋은 출발이에요! 아침 공부를 시작해 볼까요?';
              let bannerTips = '어젯밤 잠도 충분히 잤고 스마트폰도 깔끔하게 정리했네요. 오늘 계획 100% 달성에 도전해 봐요!';

              if (isSleepShort || isPhoneNotSubmitted) {
                bannerBg = 'bg-amber-50 border-amber-100/80 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-300';
                BannerIcon = AlertTriangle;
                bannerTitle = '오전 집중을 방해할 요인이 있어요.';

                if (isSleepShort && isPhoneNotSubmitted) {
                  bannerTips = '잠도 부족한데(6시간 미만) 스마트폰까지 옆에 있으면 쉽게 산만해져요. 가볍게 스트레칭하고 스마트폰부터 제출해 볼까요?';
                } else if (isSleepShort) {
                  bannerTips = '어젯밤 6시간도 못 잤네요. 잠이 부족하면 계획 달성률이 25%쯤 떨어지기 쉬워요. 가끔 찬물로 세수하며 잠을 깨워 봐요!';
                } else {
                  bannerTips = '스마트폰을 아직 제출하지 않았어요. 알림 하나가 몰입을 통째로 깨뜨려요. 지금 자습실 밖 수납함에 넣어 볼까요?';
                }
              }

              return (
                <div id="morning-checklist-card" className={`rounded-3xl border ${bannerBg} p-5 shadow-sm space-y-2.5 flex flex-col justify-between`}>
                  <div>
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">아침의 약속 & 코멘팅 팁</p>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500">기록 시각: {new Date(checklist.submitted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="space-y-1 mt-2">
                      <h4 className="text-xs font-black flex items-center gap-1">
                        <BannerIcon className="h-4 w-4 shrink-0" /> {bannerTitle}
                      </h4>
                      <p className="text-[10px] font-bold leading-relaxed opacity-90">{bannerTips}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 text-[9px] font-black text-slate-500/80 dark:text-slate-400 border-t border-slate-100/50 dark:border-white/10 pt-2.5">
                    <span>어젯밤 수면: <strong className="text-slate-800 dark:text-slate-200">{checklist.sleep_hours}시간</strong></span>
                    <span>휴대폰: <strong className="text-slate-800 dark:text-slate-200">{phoneStatusLabel}</strong></span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 홈 상태 카드 4개 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">지금 할 공부</p>
              <p className="mt-2 text-xs font-black text-slate-800 dark:text-slate-200 leading-tight truncate">{currentSubjectText}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-400">{currentStudyLabel}</p>
            </div>
            <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">오늘 누적 시간</p>
              <p className="mt-2 text-base font-black text-[#0071E3] tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtStudyMin(homeTotalMin)}
              </p>
              <p className="mt-1 text-[9px] font-bold text-slate-400 dark:text-slate-400">
                {homeAttend.checkedIn ? '등원 및 순공 합산' : '등원 기록 없음'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">관리자 배정 코멘터</p>
              <p className="mt-2 text-xs font-black text-slate-800 dark:text-slate-200 leading-tight truncate">{student.manager || '배정 대기'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-400">{getCampusLabel(student.campus)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">학습직렬</p>
              <p className="mt-2 text-xs font-black text-slate-800 dark:text-slate-200 leading-tight truncate">{student.contact || '등록 바람'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-400">목표시험 기준</p>
            </div>
          </div>

          {/* 생활·순공 지표 — 순공 리포트는 정보량이 많아 최소 1/2 폭 확보, 나머지 둘은 한 칼럼에 적층 */}
          <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-6">
            <StudyStatsCard stats={studyStats} />
            <div className="space-y-6">
              <AttendanceStatusCard />
              <LeaderboardCard studentId={student.id} />
            </div>
          </div>

          {/* 코멘터 코멘트 피드백 퀘스트 리스트 */}
          {renderCoachQuestList()}
        </div>
      ) : (
        // 학부모 리포트인 경우, 심플 브리핑 요약 렌더링
        <div className="w-full space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-white/10 pb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3]/5 dark:bg-[#0071E3]/15 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#0071E3]">
                <Sparkles className="h-3.5 w-3.5 text-[#0071E3]" />
                SSC SPARTA PARENT REPORT
              </div>
              <h2 className="mt-2 text-2xl font-black text-slate-800 dark:text-slate-200">
                {student.name} 원생 학습 결과 리포트
              </h2>
            </div>
            <span className="rounded-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-1 text-xs font-bold text-slate-500 dark:text-slate-400">
              학부모 브리핑 전용
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StudyStatsCard stats={studyStats} />
            <LeaderboardCard studentId={student.id} />
          </div>
        </div>
      )}
    </div>

    {isStudentReport && (
      <section id="attendance-status" className={`scroll-mt-24 print-card ${activeTab === 'attendance-status' ? '' : 'hidden print:block'}`}>
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#0071E3]" />
          <h3 className="text-xs font-black tracking-wider text-slate-800 dark:text-slate-200 uppercase">등하원 · 순공/랭킹</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <AttendanceStatusCard />
            <StudyStatsCard stats={studyStats} />
          </div>
          <LeaderboardCard studentId={student.id} />
        </div>
      </section>
    )}

    <section id="study-stats" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'study-stats' ? '' : 'hidden print:block'}`}>
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-[#0071E3]" />
        <h3 className="text-xs font-black tracking-wider text-slate-800 dark:text-slate-200 uppercase">순공 시간 및 랭킹</h3>
      </div>
      <div className={`grid grid-cols-1 gap-6 ${isStudentReport ? 'lg:grid-cols-2' : ''}`}>
        <StudyStatsCard stats={studyStats} />
        {isStudentReport && <LeaderboardCard studentId={student.id} />}
      </div>
    </section>

    <section id="coach-feedback" className={`scroll-mt-24 space-y-4 print-card ${!isStudentReport || activeTab === 'coach-feedback' ? '' : 'hidden print:block'}`}>
      {isStudentReport ? (
        <TabHero
          eyebrow="Feedback"
          icon={MessageSquare}
          title="코멘팅 소견"
          description="담당 코멘터가 남긴 학습·생활 피드백이에요."
        />
      ) : (
        <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-widest uppercase flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#0071E3]" />
          코멘팅 소견 및 생활 관리 피드백
        </h3>
      )}

      {isStudentReport ? (
        student.studentLifeComment ? (
          <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 md:p-6 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-700 dark:text-slate-300">
              {student.studentLifeComment}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-8 text-center">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400">아직 학생용 코멘팅 소견이 등록되지 않았습니다.</p>
          </div>
        )
      ) : (
        student.lifeComment ? (
          <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 md:p-6 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-700 dark:text-slate-300">
              {student.lifeComment}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-8 text-center">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400">아직 학부모용 코멘팅 소견이 등록되지 않았습니다.</p>
          </div>
        )
      )}

      {isStudentReport && renderCoachQuestList()}
    </section>

    {/* D-Day 관리 모달 */}
    {isStudentReport && ddayOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4 bg-black/30 backdrop-blur-sm no-print" onClick={() => setDdayOpen(false)}>
            <div
              className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/10 bg-[#FAFAFA] dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#0071E3]" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">D-Day 관리</h3>
                </div>
                <button onClick={() => setDdayOpen(false)} className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 등록 현황 */}
              <div className="px-5 py-3 max-h-56 overflow-y-auto space-y-2">
                {ddays.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 dark:text-slate-400 font-bold py-4">등록된 D-Day가 없습니다.</p>
                ) : (
                  [...ddays]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((d) => {
                      const diff = calcDiff(d.date);
                      const isPast = diff.startsWith('D+');
                      return (
                        <div key={d.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2.5">
                          <span className={`shrink-0 text-xs font-black min-w-[3rem] text-center ${
                            diff === 'D-Day' ? 'text-emerald-600' : isPast ? 'text-slate-400 dark:text-slate-400' : 'text-[#0071E3]'
                          }`}>{diff}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{d.title}</p>
                            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-400">{d.date}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteDday(d.id)}
                            disabled={ddayDeleting === d.id}
                            className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                )}
              </div>

              {/* 추가 폼 */}
              <div className="px-5 py-4 border-t border-black/[0.06] dark:border-white/10 bg-[#FAFAFA] dark:bg-white/5 space-y-2">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">새 D-Day 추가</p>
                <input
                  type="text"
                  value={ddayTitle}
                  onChange={(e) => setDdayTitle(e.target.value)}
                  placeholder="이름 (예: 수능, 중간고사)"
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                />
                <input
                  type="date"
                  value={ddayDate}
                  onChange={(e) => setDdayDate(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                />
                <button
                  onClick={handleAddDday}
                  disabled={ddayAdding || !ddayTitle.trim() || !ddayDate}
                  className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-black py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  {ddayAdding ? (
                    <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  D-Day 추가
                </button>
              </div>
            </div>
          </div>
    )}
    </>
  );
}
