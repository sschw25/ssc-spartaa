'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, Clock, Award, MessageSquare, CalendarDays, Plus, Trash2, X, Target, Smartphone, Archive, PowerOff, ChevronRight, Quote, type LucideIcon } from 'lucide-react';
import { Student, DDayEvent } from '@/lib/types/student';
import type { BookProgress, ConsultationBooking, LectureProgress } from '@/lib/types/student';
import type { DeadlineGoal } from '@/lib/deadline-goals';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AnimatedOverlay } from '@/components/ui/animated-overlay';
import { HomeHighlightsPanel } from './home-highlights-panel';
import { StudyStatsCard, StudyStats } from './study-stats-card';
import { LeaderboardCard } from './leaderboard-card';
import { DailyPlanAverageCard } from './daily-plan-average-card';
import { getDailyQuote } from '@/lib/daily-quote';
import { AttendanceStatusCard } from './attendance-status-card';
import { TabHero } from './tab-hero';
import { StreakCard } from './streak-card';
import { getMakeupLedger, getMakeupObligations } from '@/lib/makeup-ledger';
import { formatSlotLabel } from '@/lib/academy-timetable';
import { getMaterialColor } from '@/lib/material-color';
import { StudySlotControl } from './study-slot-control';
import { StartPointAdjustPanel, type StartPointAdjustResult } from './start-point-adjust-panel';

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
  studySlot: string;
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
  adjustStartPoint?: (materialType: 'book' | 'lecture', materialId: string, newValue: number, reason?: string) => Promise<StartPointAdjustResult>;
  saveMakeupDone?: (materialType: 'book' | 'lecture', materialId: string, amount: number) => Promise<boolean>;
  updateDeadlineProgress?: (materialType: 'book' | 'lecture', materialId: string, planId: string, amount: number) => Promise<boolean>;
  pendingPlanId: string | null;
  setPendingPlanId: (id: string | null) => void;
  pendingAmount: number;
  setPendingAmount: React.Dispatch<React.SetStateAction<number>>;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string, reviewMinutes?: number) => Promise<boolean>;
  homeAttend: { loading: boolean; checkedIn: boolean; todayMinutes: number; since: string | null; sinceToday: boolean };
  homeFocusMin: number; // 오늘 집중(타이머 순공)
  homeStayMin: number;  // 오늘 체류(등원~현재 재석)
  currentSubjectText: string;
  currentStudyLabel: string;
  timeGreeting: string;
  currentBriefingPhrase: string;
  briefingSubMessage: string;
  rewardBanner: { show: boolean; reasons: string[] };
  submitChecklist: (e: React.FormEvent, isEdit?: boolean) => Promise<boolean>;
  checklistForm: { sleepHours: number; phoneSubmitted: boolean; phoneStatus: 'submitted' | 'locker' | 'off_hold'; phoneReason: string };
  setChecklistForm: React.Dispatch<React.SetStateAction<{ sleepHours: number; phoneSubmitted: boolean; phoneStatus: 'submitted' | 'locker' | 'off_hold'; phoneReason: string }>>;
  checklistSubmitting: boolean;
  activeTab: string;
  studyTimeLabels: Record<string, string>;
  // 오늘 할 일 항목 id → 자동 배정 교시 라벨('3교시'). 있으면 '미지정' 대신 노출.
  scheduledSlotLabels?: Record<string, string>;
  studyStats: StudyStats | null;
  completedQuests: Record<number, boolean>;
  setCompletedQuests: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  deadlineGoals?: DeadlineGoal[];
  openWeeklyPlan?: () => void;
  openMakeup?: () => void;
  openTimetable?: () => void;
  // 홈 최상단 '확인할 특이사항' 패널 데이터·내비게이션 (학생 리포트 전용, 옵셔널 — 학부모 호출부 미전달).
  consultationBookings?: ConsultationBooking[];
  pendingMealCount?: number;
  pendingMockCount?: number;
  pendingOtCount?: number;
  pendingCampusCount?: number;
  pendingSaturdayCount?: number;
  openConsultation?: () => void;
  openNotifications?: () => void;
  openLeaveRequests?: () => void;
  // 자료 상세 시트 열기 — 오늘 계획·자율 목표·주말 보강·기간목표 항목 탭 시(학생 뷰 전용, 미전달 시 비활성).
  openMaterialDetail?: (materialType: 'book' | 'lecture', materialId: string) => void;
  // 학생 변경 신청 전송 — 주말 보강 '수정 요청'(makeup)에 사용(학생 뷰 전용, 미전달 시 버튼 숨김).
  sendRequest?: (type: string, message: string, proposedGoal?: undefined, proposedMaterial?: undefined, proposedMakeup?: { materialId: string; materialType: 'book' | 'lecture'; done: number }) => Promise<boolean>;
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
  adjustStartPoint,
  saveMakeupDone,
  updateDeadlineProgress,
  pendingPlanId,
  setPendingPlanId,
  pendingAmount,
  setPendingAmount,
  updatePlanCompletion,
  homeAttend,
  homeFocusMin,
  homeStayMin,
  currentSubjectText,
  currentStudyLabel,
  timeGreeting,
  currentBriefingPhrase,
  rewardBanner,
  submitChecklist,
  checklistForm,
  setChecklistForm,
  checklistSubmitting,
  activeTab,
  studyTimeLabels,
  scheduledSlotLabels,
  studyStats,
  completedQuests,
  setCompletedQuests,
  deadlineGoals = [],
  openWeeklyPlan,
  openMakeup,
  openTimetable,
  consultationBookings = [],
  pendingMealCount = 0,
  pendingMockCount = 0,
  pendingOtCount = 0,
  pendingCampusCount = 0,
  pendingSaturdayCount = 0,
  openConsultation,
  openNotifications,
  openLeaveRequests,
  openMaterialDetail,
  sendRequest,
}: HomeOverviewTabProps) {
  const confirm = useConfirm();
  // 자료(교재/인강) id → 학생 지정 색(hex). 오늘 할 일 태그에 색 점으로 쓴다(태그만, 카드 전체색 X).
  const allBooksHome = (student.subjects || []).flatMap((s) => s.books || []);
  const allLecturesHome = (student.subjects || []).flatMap((s) => s.lectures || []);
  const colorOf = (type: 'book' | 'lecture', id: string): string =>
    getMaterialColor((type === 'book' ? allBooksHome : allLecturesHome).find((x) => x.id === id) || { id });
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
  // 주간목표(deadline) 홈 진도 입력 — 자료별 누적 입력 초안 + 저장 중 id.
  const [deadlineDraft, setDeadlineDraft] = useState<Record<string, string>>({});
  const [deadlineSavingId, setDeadlineSavingId] = useState<string | null>(null);
  // '오늘 안 함'으로 미룬 항목(주간목표·자율목표 공용) 집합. 저장 id = `${오늘날짜}::${항목id}` 라
  // 날짜가 바뀌면 자동으로 다시 노출된다. localStorage 저장(기기별) — 서버 저장/마이그레이션 없음.
  const [daySkips, setDaySkips] = useState<Set<string>>(new Set());
  // 시작점 조정 패널 — 열린 항목 id 만 여기서 관리(입력 상태는 공용 StartPointAdjustPanel 내부).
  const [adjustOpenId, setAdjustOpenId] = useState<string | null>(null);

  // 주말 보강 입력(원장) — 홈 토/일 박스.
  const [makeupOpenId, setMakeupOpenId] = useState<string | null>(null);
  const [makeupAmount, setMakeupAmount] = useState(1);
  const [makeupSaving, setMakeupSaving] = useState(false);
  // 주말 보강 '수정 요청'(makeup) — 열린 항목 id·제안 분량·사유·전송 중.
  const [makeupEditId, setMakeupEditId] = useState<string | null>(null);
  const [makeupEditAmount, setMakeupEditAmount] = useState(0);
  const [makeupEditReason, setMakeupEditReason] = useState('');
  const [makeupEditSending, setMakeupEditSending] = useState(false);

  // 아침 자가 점검표 — 계획 항목과 동일한 토글 패턴(펼쳐서 입력 → 완료 → 수정 가능).
  const [checklistEditing, setChecklistEditing] = useState(false);

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

  // '오늘 안 함' 스킵 로드 — 오늘 날짜키로 시작하는 항목만 남기고 나머지(과거)는 정리한다.
  const daySkipKey = `ssc-day-skips:${student.id}`;
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(daySkipKey);
      if (!raw) return;
      const arr: string[] = JSON.parse(raw);
      const todayPrefix = `${getSeoulDateKey()}::`;
      const todays = arr.filter((id) => id.startsWith(todayPrefix));
      setDaySkips(new Set(todays));
      if (todays.length !== arr.length) window.localStorage.setItem(daySkipKey, JSON.stringify(todays));
    } catch { /* 무시 — 스킵 없음으로 취급 */ }
  }, [daySkipKey]);

  // 항목 id → 오늘자 스킵 키. 항목 종류(주간·자율) 무관하게 공용.
  const skipIdFor = (rawId: string) => `${getSeoulDateKey()}::${rawId}`;
  const isDaySkipped = (rawId: string) => daySkips.has(skipIdFor(rawId));
  const toggleDaySkip = (rawId: string) => {
    const key = skipIdFor(rawId);
    setDaySkips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { window.localStorage.setItem(daySkipKey, JSON.stringify([...next])); } catch { /* 무시 */ }
      return next;
    });
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

  // 시작점 조정용 자료 현황 — current/total/오늘 자동조정 사용량(adjustLog 의 auto 항목 |delta| 합).
  // 임계치는 전체 분량의 1/10(최소 1) — 서버(progress/adjust)와 동일 규칙(안내 표시용).
  const adjustInfoFor = (materialType: 'book' | 'lecture', materialId: string) => {
    const todayKey = getSeoulDateKey();
    const list: Array<BookProgress | LectureProgress> = materialType === 'book'
      ? [...(student.subjects || []).flatMap((s) => s.books || []), ...(student.books || [])]
      : [...(student.subjects || []).flatMap((s) => s.lectures || []), ...(student.lectures || [])];
    const found = list.find((m) => m.id === materialId);
    if (!found || found.goalType === 'selfPaced') return null;
    const total = materialType === 'book'
      ? (found as BookProgress).totalPages || 0
      : (found as LectureProgress).totalLectures || 0;
    if (total <= 0) return null;
    const current = materialType === 'book'
      ? (found as BookProgress).currentPage || 0
      : (found as LectureProgress).completedLectures || 0;
    const usedToday = (found.adjustLog || [])
      .filter((entry) => entry.date === todayKey && entry.auto)
      .reduce((sum, entry) => sum + Math.abs((Number(entry.to) || 0) - (Number(entry.from) || 0)), 0);
    const threshold = Math.max(1, Math.ceil(total / 10));
    return { current, total, usedToday, threshold };
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

  // 아침 자가 점검 코칭 멘트 — 히어로 카드 서브메시지로 노출(예전엔 별도 카드였음).
  const checklistIsSleepShort = !!todayChecklist && todayChecklist.sleep_hours < 6;
  const checklistPhoneStatus = todayChecklist ? (todayChecklist.phone_status || (todayChecklist.phone_submitted ? 'submitted' : 'locker')) : null;
  const checklistPhoneNotSubmitted = !!todayChecklist && checklistPhoneStatus !== 'submitted';
  const checklistPhoneStatusLabel = checklistPhoneStatus === 'locker' ? '임시보관함' : checklistPhoneStatus === 'off_hold' ? '전원끄고 소지' : '제출 완료';
  const checklistTone: 'pending' | 'warn' | 'ok' = !todayChecklist
    ? 'pending'
    : (checklistIsSleepShort || checklistPhoneNotSubmitted) ? 'warn' : 'ok';
  const checklistTip = !todayChecklist
    ? '아침 컨디션(수면·휴대폰)을 기록하면 오늘 브리핑이 더 정확해져요.'
    : checklistIsSleepShort && checklistPhoneNotSubmitted
      ? '잠도 부족한데(6시간 미만) 스마트폰까지 옆에 있으면 쉽게 산만해져요. 스마트폰부터 제출해 볼까요?'
      : checklistIsSleepShort
        ? '어젯밤 6시간도 못 잤네요. 잠이 부족하면 계획 달성률이 25%쯤 떨어지기 쉬워요.'
        : checklistPhoneNotSubmitted
          ? '스마트폰을 아직 제출하지 않았어요. 알림 하나가 몰입을 통째로 깨뜨려요.'
          : '어젯밤 잠도 충분히 잤고 스마트폰도 깔끔하게 정리했네요. 오늘 계획 100% 달성에 도전해 봐요!';
  const completedPlanCount = todayPlanEntries.filter((entry) => entry.isCompleted).length;
  const activeDeadlineGoals = isStudentReport ? deadlineGoals.filter((goal) => goal.targetAmount > 0) : [];
  // '오늘 안 함'으로 미룬 항목은 오늘 목록에서 제외(내일 다시 노출). 미룬 목록은 '되돌리기' 섹션에서 복구.
  const visibleDeadlineGoals = activeDeadlineGoals.filter((goal) => !isDaySkipped(goal.id));
  const skippedDeadlineGoals = activeDeadlineGoals.filter((goal) => isDaySkipped(goal.id));
  const visibleSelfPacedItems = todaySelfPacedItems.filter((item) => !isDaySkipped(item.id));
  const skippedSelfPacedItems = todaySelfPacedItems.filter((item) => isDaySkipped(item.id));
  // 주간목표 '오늘 완료' 판정 — 오늘까지 기대치(예상목표치) 90% 이상 채움(요약 배지와 동일 기준).
  const isDeadlineDoneToday = (g: DeadlineGoal) => g.expectedAmount <= 0 || g.actualAmount >= g.expectedAmount * 0.9;
  // 기간목표도 '오늘 할 일'에 포함 — 미룬 건 뺀 노출 목록 기준으로 집계.
  const deadlineDoneToday = visibleDeadlineGoals.filter(isDeadlineDoneToday).length;

  // 주말 보강 원장 — 남은 보강(remaining>0) 목록 + 발생분 전체(카운트 판정용).
  const makeupLedger = React.useMemo(
    () => (isStudentReport ? getMakeupLedger(student) : []),
    [isStudentReport, student],
  );
  const makeupObligations = React.useMemo(
    () => (isStudentReport ? getMakeupObligations(student) : []),
    [isStudentReport, student],
  );
  // 오늘이 토/일이면 보강을 '오늘 할 일'에 포함(평일엔 별도 알림/탭에서만).
  const isWeekendToday = React.useMemo(() => {
    // Asia/Seoul 요일 기준 — 파일 내 다른 날짜 로직(getSeoulDateKey)과 일관, 자정 경계 안전.
    const wk = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(new Date());
    return wk === 'Sat' || wk === 'Sun';
  }, []);
  // 토/일엔 보강 발생 자료를 '오늘 할 일'에 포함(remaining==0이면 완료). 평일엔 카운트 미포함.
  const makeupCountTotal = isWeekendToday ? makeupObligations.length : 0;
  const makeupCountDone = isWeekendToday ? makeupObligations.filter((it) => it.remaining <= 0).length : 0;
  const todayMissionTotal = todayPlanEntries.length + 1 + visibleDeadlineGoals.length + makeupCountTotal;
  const todayMissionDone = completedPlanCount + (todayChecklist ? 1 : 0) + deadlineDoneToday + makeupCountDone;
  const todayMissionPercent = todayMissionTotal > 0 ? Math.round((todayMissionDone / todayMissionTotal) * 100) : 0;

  // 최근(14일) 주말 보강 발생 알림 — 홈 알림 카드.
  const recentMakeupNotices = React.useMemo(() => {
    if (!isStudentReport) return [];
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    return (student.makeupNotices || [])
      .filter((n) => (n.createdAt || '') >= cutoff)
      .slice(-5)
      .reverse();
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
          {/* 홈 히어로 카드 — 인사·오늘 브리핑·아침 컨디션 코칭 멘트를 한 카드로 묶고, 연속출석·D-Day는 하단 칩으로. */}
          <div className="rounded-3xl border border-[#0071E3]/15 bg-gradient-to-br from-[#0071E3]/[0.07] via-white to-white dark:from-[#0071E3]/20 dark:via-[#1c1c1e] dark:to-[#1c1c1e] p-5 shadow-sm sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0071E3]">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </p>
            <h2 className="mt-1.5 text-[20px] font-semibold leading-tight text-slate-900 dark:text-slate-100">
              {student.name}님, {timeGreeting}
            </h2>
            <p className="mt-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">{currentBriefingPhrase}</p>
            <p className={`mt-3 rounded-2xl px-3 py-2.5 text-[11px] font-semibold leading-relaxed ${
              checklistTone === 'warn'
                ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                : checklistTone === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-[#0071E3]/[0.06] text-[#0071E3] dark:bg-[#0071E3]/15'
            }`}>
              {checklistTip}
            </p>

            {/* 오늘의 한마디 — 라운지 글귀 감성. 라벨 옆 작은 인용부호(장식 잘림 없이 깔끔). */}
            <div className="mt-3 rounded-2xl border border-[#0071E3]/12 bg-gradient-to-br from-[#0071E3]/[0.05] to-transparent px-4 py-3 dark:border-white/10 dark:from-[#0071E3]/12">
              <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#0071E3]/70">
                <Quote className="h-2.5 w-2.5 fill-current" /> 오늘의 한마디
              </p>
              <p className="mt-1 break-keep text-[13px] font-bold leading-relaxed text-slate-700 dark:text-slate-100">
                {getDailyQuote()}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <StreakCard compact />

              <button
                type="button"
                onClick={() => setDdayOpen(true)}
                className="flex h-full flex-col rounded-2xl border border-[#0071E3]/15 bg-white/70 dark:bg-white/5 p-3 text-center shadow-sm transition active:scale-[0.98]"
                aria-label="D-Day 관리"
              >
                <p className="text-[9px] font-semibold uppercase tracking-wide text-[#0071E3]">D-Day</p>
                {primaryDday ? (
                  <div className="mt-1.5 min-w-0 flex-1">
                    <p className="text-[17px] font-semibold leading-none text-[#0071E3] tabular-nums">
                      {calcDiff(primaryDday.date)}
                    </p>
                    <p className="mt-1.5 truncate text-[10px] font-medium leading-tight text-slate-600 dark:text-slate-400">{primaryDday.title}</p>
                  </div>
                ) : (
                  <p className="mt-1.5 flex-1 text-[10px] font-medium leading-tight text-slate-400 dark:text-slate-400">일정 추가</p>
                )}
              </button>
            </div>
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
                  오늘 계획 {todayPlanEntries.length}건{visibleDeadlineGoals.length > 0 ? ` + 주간목표 ${visibleDeadlineGoals.length}개` : ''} + 아침 점검표{todayDailyPlan ? ` · ${todayDailyPlan.dateLabel}` : ''}
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

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  const willOpen = !checklistEditing;
                  if (willOpen && todayChecklist) {
                    const status = checklistPhoneStatus || 'submitted';
                    setChecklistForm({
                      sleepHours: Number(todayChecklist.sleep_hours) || 7,
                      phoneStatus: status,
                      phoneSubmitted: status === 'submitted',
                      phoneReason: String(todayChecklist.phone_reason || ''),
                    });
                  }
                  setChecklistEditing(willOpen);
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
                      ? `수면 ${todayChecklist.sleep_hours}시간 · 휴대폰 ${checklistPhoneStatusLabel}`
                      : '컨디션을 기록하면 오늘 할 일 진행률에 반영돼요'}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                  todayChecklist ? 'bg-white text-emerald-700 dark:bg-white/10 dark:text-emerald-300' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'
                }`}>
                  {todayChecklist ? (checklistEditing ? '접기' : '수정') : (checklistEditing ? '접기' : '기록')}
                </span>
              </button>

              {checklistEditing && (
                <form
                  onSubmit={async (e) => {
                    const ok = await submitChecklist(e, !!todayChecklist);
                    if (ok) setChecklistEditing(false);
                  }}
                  className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 p-4 space-y-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label htmlFor="sleepHoursInput" className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">어젯밤 수면 시간</label>
                    <select
                      id="sleepHoursInput"
                      value={checklistForm.sleepHours}
                      onChange={(e) => setChecklistForm(f => ({ ...f, sleepHours: Number(e.target.value) }))}
                      className="h-11 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 text-[13px] font-semibold text-slate-700 dark:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                    >
                      {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map(h => (
                        <option key={h} value={h}>{h}시간</option>
                      ))}
                    </select>
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
                              : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'
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
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChecklistEditing(false)}
                      className="rounded-full border border-slate-200 dark:border-white/10 px-5 py-2.5 text-[12px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-white dark:hover:bg-white/5 active:scale-95"
                    >
                      닫기
                    </button>
                    <button
                      type="submit"
                      disabled={checklistSubmitting || (checklistForm.phoneStatus !== 'submitted' && !checklistForm.phoneReason.trim())}
                      className="flex-1 rounded-full bg-slate-900 dark:bg-white py-2.5 text-[12px] font-semibold text-white dark:text-slate-900 shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                    >
                      {checklistSubmitting ? '저장 중...' : todayChecklist ? '수정 저장' : '컨디션 기록 완료'}
                    </button>
                  </div>
                </form>
              )}

              {todayPlanEntries.length > 0 ? (
                todayPlanEntries.map((entry, index) => {
                  const isPending = pendingPlanId === entry.id;
                  const _r = entry.rangeText || '';
                  const unit = _r.includes('문제') ? '문제' : _r.includes('강') ? '강' : _r.toLowerCase().includes('p') ? 'p' : _r.replace(/\d+회독/g, '').includes('회') ? '회' : '';
                  // 시작점 조정 — 완료 항목·selfPaced·분량 미상 자료는 대상 아님(adjustInfoFor 가 null).
                  const adjustInfo = adjustStartPoint && !entry.isCompleted
                    ? adjustInfoFor(entry.materialType, entry.materialId)
                    : null;
                  const adjustUnit = unit || (entry.materialType === 'lecture' ? '강' : 'p');
                  const isAdjustOpen = adjustInfo !== null && adjustOpenId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      // 카드 아무 데나 탭 → 자료 상세 시트. 내부 버튼/입력/패널은 guard 로 제외해 오작동 방지.
                      onClick={openMaterialDetail ? (e) => {
                        if ((e.target as HTMLElement).closest('button, input, select, textarea, a, label, [data-stop]')) return;
                        openMaterialDetail(entry.materialType, entry.materialId);
                      } : undefined}
                      className={`rounded-2xl border p-3 transition ${openMaterialDetail ? 'cursor-pointer' : ''} ${
                      entry.isCompleted ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                    }`}>
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.isCompleted) {
                              updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, false, undefined, entry.dateKey);
                            } else {
                              setPendingPlanId(entry.id);
                              // '몇 X까지'(절대) 입력 — 자료 현황 있으면 현재 진도+오늘목표를 기본값(오늘 목표 끝)으로.
                              setPendingAmount(adjustInfo ? adjustInfo.current + (entry.dailyAmount ?? 1) : (entry.dailyAmount ?? 1));
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
                              {/* 제목/본문 탭 → 자료 상세 시트 (완료 체크·시작점 조정 버튼과 충돌 없게 별도 버튼) */}
                              <button
                                type="button"
                                disabled={!openMaterialDetail}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMaterialDetail?.(entry.materialType, entry.materialId);
                                }}
                                aria-label={`${entry.subject} ${entry.title} 상세 보기`}
                                className="block w-full min-w-0 text-left disabled:cursor-default"
                              >
                                <p className={`flex items-center gap-1 text-[13px] font-semibold ${entry.isCompleted ? 'text-emerald-800 dark:text-emerald-300 line-through decoration-emerald-500/40' : 'text-slate-900 dark:text-slate-100'}`}>
                                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(entry.materialType, entry.materialId) }} />
                                  <span className="truncate">{entry.subject} · {entry.title}</span>
                                  {openMaterialDetail && (
                                    <span className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-slate-300 dark:text-slate-600">
                                      자세히
                                      <ChevronRight className="h-3 w-3" />
                                    </span>
                                  )}
                                </p>
                                <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                  {scheduledSlotLabels?.[entry.id] || studyTimeLabels[entry.studyTime] || '미지정'} · {entry.type} · {entry.dailyLabel}
                                </p>
                              </button>
                              {reviewMinFor(entry.materialType, entry.materialId) > 0 && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  복습 {reviewMinFor(entry.materialType, entry.materialId)}분 ✅
                                </span>
                              )}
                              {adjustInfo && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    오늘은 <span className="font-semibold text-[#0071E3]">{Math.min(adjustInfo.total, adjustInfo.current + 1)}{adjustUnit}</span>부터 시작해요
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setAdjustOpenId((prev) => (prev === entry.id ? null : entry.id))}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition active:scale-95 ${isAdjustOpen ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400' : 'border-[#0071E3]/25 bg-[#0071E3]/[0.05] text-[#0071E3] hover:bg-[#0071E3]/10 dark:bg-[#0071E3]/15'}`}
                                  >
                                    {isAdjustOpen ? '닫기' : '시작점 조정'}
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                              entry.isCompleted ? 'bg-white text-emerald-700 dark:bg-white/10 dark:text-emerald-300' : isPending ? 'bg-white text-amber-700 dark:bg-white/10 dark:text-amber-300' : 'bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                            }`}>
                              {entry.isCompleted ? `완료 ${entry.actualAmount ?? '?'}${unit}` : `${index + 1}번`}
                            </span>
                          </div>

                          {/* 교시 배치(studySlot) + 오늘 진도 입력을 한 줄에 — 이 박스 안에서 다 처리. */}
                          {!entry.isCompleted && (
                            <div data-stop className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-slate-100 dark:border-white/10 pt-2.5">
                              {saveStudySlot && (
                                <StudySlotControl
                                  materialType={entry.materialType}
                                  materialId={entry.materialId}
                                  current={entry.studySlot || ''}
                                  saving={slotSavingId === entry.id}
                                  label="교시 배치"
                                  onSave={async (mt, mid, slot) => {
                                    setSlotSavingId(entry.id);
                                    try { return await saveStudySlot(mt, mid, slot); }
                                    finally { setSlotSavingId(null); }
                                  }}
                                />
                              )}
                              {/* 오늘 진도 입력 — 완료 패널 토글(왼쪽 체크 동그라미와 동일). '몇 X까지' 절대입력. */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (isPending) { setPendingPlanId(null); return; }
                                  setPendingPlanId(entry.id);
                                  setPendingAmount(adjustInfo ? adjustInfo.current + (entry.dailyAmount ?? 1) : (entry.dailyAmount ?? 1));
                                  setReviewMinutesInput(reviewMinFor(entry.materialType, entry.materialId));
                                }}
                                className={`ml-auto inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold transition active:scale-95 ${isPending ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400' : 'border-[#0071E3]/25 bg-[#0071E3]/[0.06] text-[#0071E3] hover:bg-[#0071E3]/10 dark:bg-[#0071E3]/15'}`}
                              >
                                {isPending ? '닫기' : '완료'}
                              </button>
                            </div>
                          )}

                          {isPending && (
                            <div data-stop className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{adjustInfo ? `지금 몇 ${adjustUnit}까지 했나요?` : '실제로 얼마나 했나요?'}</p>
                              {adjustInfo && (
                                <>
                                  <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">이전 {adjustInfo.current}{adjustUnit} · 오늘 목표 {entry.dailyAmount}{adjustUnit}</p>
                                  {/* '까지' = 오늘 한 양이 아니라 누적 현재 위치(절대값) — 개념 안내 상시 캡션 */}
                                  <p className="mt-0.5 break-keep text-[10px] font-medium text-slate-400 dark:text-slate-500">오늘 한 양이 아니라 지금까지 도달한 위치(누적)를 입력해요. 예: 어제 30{adjustUnit}, 오늘 3{adjustUnit} 했으면 33{adjustUnit}.</p>
                                </>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPendingAmount((v) => Math.max(adjustInfo ? adjustInfo.current : 0, v - 1))}
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
                                      // '까지'(절대) 입력이면 그날 한 양(delta)으로 환산해 저장. 자료 현황 없으면 기존 방식(당일 양) 그대로.
                                      const dayAmount = adjustInfo ? Math.max(0, pendingAmount - adjustInfo.current) : pendingAmount;
                                      const ok = await updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, true, dayAmount, entry.dateKey, reviewMinutesInput);
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

                          {isAdjustOpen && adjustInfo && adjustStartPoint && (
                            <div data-stop>
                              <StartPointAdjustPanel
                                materialType={entry.materialType}
                                materialId={entry.materialId}
                                unit={adjustUnit}
                                info={adjustInfo}
                                adjustStartPoint={adjustStartPoint}
                                onClose={() => setAdjustOpenId(null)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : visibleSelfPacedItems.length === 0 && visibleDeadlineGoals.length === 0 && skippedDeadlineGoals.length === 0 && skippedSelfPacedItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 px-4 py-5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  오늘 배정된 항목이 없어요. 학습 계획을 확인해 보세요.
                </p>
              ) : null}

              {/* 주간목표(기간목표) — 오늘 할 일 목록에 통합. '주간목표' 태그 + 오늘 목표량 + '오늘 안 함'(내일 다시 노출). */}
              {visibleDeadlineGoals.map((goal) => {
                const done = goal.actualAmount >= goal.targetAmount;
                const metToday = isDeadlineDoneToday(goal);
                const recommend = Math.min(Math.max(0, goal.targetAmount - goal.actualAmount), Math.max(0, goal.todayRecommend));
                const startAt = Math.min(goal.targetAmount, goal.actualAmount + 1); // 오늘 시작 위치(근사)
                const draftVal = deadlineDraft[goal.id] ?? String(goal.actualAmount);
                const isSaving = deadlineSavingId === goal.id;
                return (
                  <div
                    key={goal.id}
                    className={`rounded-2xl border p-3 transition ${
                      done || metToday
                        ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                        : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                        done || metToday ? 'border-emerald-200 bg-emerald-500 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-300 dark:text-slate-600'
                      }`}>
                        <Target className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              disabled={!openMaterialDetail}
                              onClick={(e) => { e.stopPropagation(); openMaterialDetail?.(goal.materialType, goal.materialId); }}
                              aria-label={`${goal.subject} ${goal.title} 상세 보기`}
                              className="block w-full min-w-0 text-left disabled:cursor-default"
                            >
                              <p className="flex flex-wrap items-center gap-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(goal.materialType, goal.materialId) }} />
                                <span className="truncate">{goal.subject} · {goal.title}</span>
                                <span className="inline-flex shrink-0 items-center rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#0071E3]">주간목표</span>
                                {openMaterialDetail && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                              </p>
                              <p className="mt-1 truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">이번 주 {goal.rangeText}</p>
                            </button>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                            done || metToday ? 'bg-white text-emerald-700 dark:bg-white/10 dark:text-emerald-300' : goal.behind ? 'bg-white text-amber-700 dark:bg-white/10 dark:text-amber-300' : 'bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                          }`}>
                            {done ? '주간 완료' : metToday ? '오늘 완료' : `${goal.actualAmount}/${goal.targetAmount}${goal.unit}`}
                          </span>
                        </div>

                        {!done && (
                          <p className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {metToday
                              ? '오늘치는 다 채웠어요. 더 해도 좋아요!'
                              : recommend > 0
                                ? <>오늘은 <span className="font-semibold text-[#0071E3]">{startAt}{goal.unit}</span>부터 · 오늘 목표 <span className="font-semibold text-[#0071E3]">{recommend}{goal.unit}</span></>
                                : '오늘 권장량 없음'}
                          </p>
                        )}

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-slate-100 dark:border-white/10 pt-2.5">
                          {saveStudySlot && (
                            <StudySlotControl
                              materialType={goal.materialType}
                              materialId={goal.materialId}
                              current={goal.studySlot || ''}
                              saving={slotSavingId === goal.id}
                              label="교시"
                              onSave={async (mt, mid, slot) => {
                                setSlotSavingId(goal.id);
                                try { return await saveStudySlot(mt, mid, slot); }
                                finally { setSlotSavingId(null); }
                              }}
                            />
                          )}
                          {updateDeadlineProgress && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">진행</span>
                              <input
                                type="number"
                                min={0}
                                max={goal.targetAmount}
                                value={draftVal}
                                onChange={(e) => setDeadlineDraft((d) => ({ ...d, [goal.id]: e.target.value }))}
                                className="h-8 w-16 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 text-right text-[12px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none"
                              />
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{goal.unit}</span>
                              <button
                                type="button"
                                disabled={isSaving || draftVal === String(goal.actualAmount)}
                                onClick={async () => {
                                  const val = Math.max(0, Math.round(Number(draftVal) || 0));
                                  setDeadlineSavingId(goal.id);
                                  try {
                                    const ok = await updateDeadlineProgress(goal.materialType, goal.materialId, goal.planId, val);
                                    if (ok) { toast.success('진도를 저장했어요.'); setDeadlineDraft((d) => { const n = { ...d }; delete n[goal.id]; return n; }); }
                                    else toast.error('진도 저장에 실패했어요.');
                                  } finally {
                                    setDeadlineSavingId(null);
                                  }
                                }}
                                className="h-8 rounded-full bg-[#0071E3] px-3 text-[11px] font-semibold text-white transition hover:bg-[#0077ED] active:scale-95 disabled:opacity-50"
                              >
                                {isSaving ? '저장 중' : '저장'}
                              </button>
                            </div>
                          )}
                          {!done && !metToday && (
                            <button
                              type="button"
                              onClick={() => {
                                toggleDaySkip(goal.id);
                                toast('오늘은 이 주간목표를 건너뛸게요. 아래 "오늘 미룬 목표"에서 되돌릴 수 있어요.', {
                                  action: { label: '되돌리기', onClick: () => toggleDaySkip(goal.id) },
                                });
                              }}
                              className="ml-auto inline-flex h-8 items-center rounded-full border border-slate-200 dark:border-white/10 px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                            >
                              오늘 안 함
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 자율목표 — selfPaced 자료(분량 자유·누적 입력). 주간목표처럼 태그 카드로 목록에 통일. 완료 카운트엔 미포함(별도). */}
              {visibleSelfPacedItems.map((item) => {
                    const isOpen = selfPacedOpenId === item.id;
                    const reviewMin = reviewMinFor(item.materialType, item.materialId);
                    return (
                      <div key={item.id} className={`rounded-2xl border p-3 transition ${
                        item.loggedToday ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-500/10' : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                      }`}>
                        <div className="flex items-start gap-3">
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${
                            item.loggedToday ? 'border-emerald-200 bg-emerald-500 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-300 dark:text-slate-600'
                          }`}>
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {/* 제목 탭 → 자료 상세 시트 ('오늘 입력' 버튼과 충돌 없게 별도 버튼) */}
                            <button
                              type="button"
                              disabled={!openMaterialDetail}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMaterialDetail?.(item.materialType, item.materialId);
                              }}
                              aria-label={`${item.subject} ${item.title} 상세 보기`}
                              className="block w-full min-w-0 text-left disabled:cursor-default"
                            >
                              <p className="flex flex-wrap items-center gap-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(item.materialType, item.materialId) }} />
                                <span className="truncate">{item.subject} · {item.title}</span>
                                <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">자율목표</span>
                                {openMaterialDetail && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                              </p>
                              <p className="mt-1 truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">
                                {formatSlotLabel(item.studyTime)} · {item.materialType === 'book' ? '교재' : '인강'} · 누적 {item.current}{item.unit}
                              </p>
                            </button>
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
                                setSelfPacedAmount(item.current); // '몇 X까지' 절대 입력 — 현재 누적에서 시작
                                setSelfPacedReview(reviewMin);
                              }}
                              className="shrink-0 rounded-full border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-3 py-1.5 text-[10px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/5 active:scale-95"
                            >
                              오늘 입력
                            </button>
                          )}
                        </div>

                        {/* 시간표 배치(선택) + 오늘 안 함 — 자료별 학생 지정 슬롯. 미지정이면 시간표엔 안 뜨고 여기에만 노출. */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-dashed border-slate-100 dark:border-white/10 pt-2.5">
                          {saveStudySlot && (
                            <StudySlotControl
                              materialType={item.materialType}
                              materialId={item.materialId}
                              current={item.studyTime || ''}
                              saving={slotSavingId === item.id}
                              label="시간표 배치"
                              onSave={async (mt, mid, slot) => {
                                setSlotSavingId(item.id);
                                try { return await saveStudySlot(mt, mid, slot); }
                                finally { setSlotSavingId(null); }
                              }}
                            />
                          )}
                          {!item.loggedToday && (
                            <button
                              type="button"
                              onClick={() => {
                                toggleDaySkip(item.id);
                                toast('오늘은 이 자율목표를 건너뛸게요. 아래 "오늘 미룬 목표"에서 되돌릴 수 있어요.', {
                                  action: { label: '되돌리기', onClick: () => toggleDaySkip(item.id) },
                                });
                              }}
                              className="ml-auto inline-flex h-8 items-center rounded-full border border-slate-200 dark:border-white/10 px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                            >
                              오늘 안 함
                            </button>
                          )}
                        </div>

                        {isOpen && !item.loggedToday && (
                          <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">지금 몇 {item.unit}까지 했나요?</p>
                            <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">이전 누적 {item.current}{item.unit}</p>
                            {/* '까지' = 오늘 한 양이 아니라 누적 현재 위치(절대값) — 개념 안내 상시 캡션 */}
                            <p className="mt-0.5 break-keep text-[10px] font-medium text-slate-400 dark:text-slate-500">오늘 한 양이 아니라 지금까지 도달한 위치(누적)를 입력해요. 예: 어제 30{item.unit}, 오늘 3{item.unit} 했으면 33{item.unit}.</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelfPacedAmount((v) => Math.max(item.current, v - 1))}
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
                                disabled={selfPacedSaving || !saveSelfPacedToday || (selfPacedAmount <= item.current && !selfPacedReview)}
                                onClick={async () => {
                                  if (selfPacedSaving || !saveSelfPacedToday) return;
                                  setSelfPacedSaving(true);
                                  try {
                                    // '까지'(절대) 입력 → 증가분(delta)만 저장 훅에 전달.
                                    const delta = Math.max(0, selfPacedAmount - item.current);
                                    const ok = await saveSelfPacedToday(item.materialType, item.materialId, delta, selfPacedReview);
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
                        </div>
                      </div>
                    );
                  })}

              {/* 오늘 미룬 목표(주간·자율 공용) — '오늘 안 함' 한 항목을 여기서 되돌린다. 내일이면 자동으로 다시 노출. */}
              {(skippedDeadlineGoals.length + skippedSelfPacedItems.length) > 0 && (
                <div className="mt-1 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    오늘 미룬 목표 {skippedDeadlineGoals.length + skippedSelfPacedItems.length}개 · 내일 다시 알려드려요
                  </p>
                  <div className="space-y-1.5">
                    {[
                      ...skippedDeadlineGoals.map((g) => ({ id: g.id, label: `${g.subject} · ${g.title}`, tag: '주간목표' })),
                      ...skippedSelfPacedItems.map((it) => ({ id: it.id, label: `${it.subject} · ${it.title}`, tag: '자율목표' })),
                    ].map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-[#1c1c1e] px-3 py-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${row.tag === '주간목표' ? 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-[#0071E3]/20' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'}`}>{row.tag}</span>
                          <span className="truncate text-[12px] font-semibold text-slate-700 dark:text-slate-300">{row.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleDaySkip(row.id)}
                          className="shrink-0 rounded-full border border-[#0071E3]/25 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-3 py-1 text-[11px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/10 active:scale-95"
                        >
                          되돌리기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 주말 보강 박스 — 오늘이 토/일이고 남은 보강이 있으면 '오늘 할 일'에 노출(입력 가능). */}
              {isWeekendToday && makeupLedger.length > 0 && (
                <div className="mt-1 space-y-2.5 rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/70 dark:bg-amber-500/10 p-3">
                  {/* 헤더 클릭 → 보강 탭으로 이동(자세한 관리·이력). */}
                  <button
                    type="button"
                    onClick={openMakeup}
                    disabled={!openMakeup}
                    className="flex w-full items-center justify-between gap-2 text-left transition active:scale-[0.99] disabled:cursor-default"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      <CalendarDays className="h-3.5 w-3.5" />
                      이번 주말 보강
                      {openMakeup && <ChevronRight className="h-3.5 w-3.5 text-amber-400 dark:text-amber-500" />}
                    </span>
                    <span className="rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      오늘 할 일에 포함
                    </span>
                  </button>
                  <p className="text-[11px] font-medium text-amber-800/80 dark:text-amber-300/80">
                    휴가로 빠진 만큼 보강할 분량이에요. 보강한 만큼 입력하면 진도도 함께 채워져요.
                  </p>

                  {makeupLedger.map((it) => {
                    const isOpen = makeupOpenId === it.id;
                    return (
                      <div key={it.id} className={`rounded-xl border p-3 transition ${
                        isOpen ? 'border-amber-300 bg-white dark:border-amber-500/30 dark:bg-[#1c1c1e]' : 'border-amber-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e]'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {/* 제목 탭 → 자료 상세 시트 (보강 입력 버튼과 충돌 없게 별도 버튼) */}
                            <button
                              type="button"
                              disabled={!openMaterialDetail}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMaterialDetail?.(it.materialType, it.materialId);
                              }}
                              aria-label={`${it.subjectName} ${it.materialTitle} 상세 보기`}
                              className="block w-full min-w-0 text-left disabled:cursor-default"
                            >
                              <p className="flex items-center gap-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                                <span className="truncate">{it.subjectName} · {it.materialTitle}</span>
                                {openMaterialDetail && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                              </p>
                              <p className="mt-1 truncate text-[11px] font-medium text-slate-400 dark:text-slate-400">
                                {it.materialType === 'book' ? '교재' : '인강'} · 완료 {it.done}{it.unit} / 발생 {it.owed}{it.unit}
                              </p>
                            </button>
                          </div>
                          {saveMakeupDone ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (isOpen) { setMakeupOpenId(null); return; }
                                setMakeupOpenId(it.id);
                                setMakeupAmount(Math.min(it.remaining, 1) || 1);
                              }}
                              className="shrink-0 rounded-full border border-amber-300/60 bg-white dark:bg-[#1c1c1e] px-3 py-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-50 dark:hover:bg-amber-500/10 active:scale-95"
                            >
                              남음 {it.remaining}{it.unit} · 입력
                            </button>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              남음 {it.remaining}{it.unit}
                            </span>
                          )}
                        </div>

                        {isOpen && saveMakeupDone && (
                          <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">이번에 얼마나 보강했나요?</p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setMakeupAmount((v) => Math.max(1, v - 1))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                              >
                                -
                              </button>
                              <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {makeupAmount}{it.unit}
                              </span>
                              <button
                                type="button"
                                onClick={() => setMakeupAmount((v) => Math.min(it.remaining, v + 1))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                              >
                                +
                              </button>
                              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">최대 {it.remaining}{it.unit}</span>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={makeupSaving || makeupAmount <= 0}
                                onClick={async () => {
                                  if (makeupSaving || makeupAmount <= 0) return;
                                  setMakeupSaving(true);
                                  try {
                                    const ok = await saveMakeupDone(it.materialType, it.materialId, makeupAmount);
                                    if (ok) setMakeupOpenId(null);
                                  } finally {
                                    setMakeupSaving(false);
                                  }
                                }}
                                className="flex-1 rounded-full bg-amber-500 py-2 text-[11px] font-semibold text-white hover:bg-amber-600 active:scale-[0.97] disabled:opacity-60"
                              >
                                {makeupSaving ? '저장 중...' : '보강 완료 기록'}
                              </button>
                              <button
                                type="button"
                                disabled={makeupSaving}
                                onClick={() => setMakeupOpenId(null)}
                                className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 보강 분량이 실제와 다를 때 — 사유와 함께 관리자에게 '수정 요청'(승인 시 반영). 학생 본인 뷰 전용. */}
                        {isStudentReport && sendRequest && (
                          makeupEditId === it.id ? (
                            <div className="mt-3 rounded-2xl border border-amber-100 dark:border-amber-500/25 bg-white dark:bg-[#1c1c1e] p-3">
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">실제 보강한 양 (제안)</p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setMakeupEditAmount((v) => Math.max(0, v - 1))}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                                >
                                  -
                                </button>
                                <span className="min-w-[3.5rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {makeupEditAmount}{it.unit}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMakeupEditAmount((v) => v + 1)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95"
                                >
                                  +
                                </button>
                              </div>
                              <p className="mt-3 text-[11px] font-semibold text-slate-600 dark:text-slate-400">수정 사유</p>
                              <textarea
                                value={makeupEditReason}
                                onChange={(e) => setMakeupEditReason(e.target.value)}
                                rows={2}
                                placeholder="예: 이미 평일에 따라잡아서 보강 분량이 달라요."
                                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[12px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
                              />
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  disabled={makeupEditSending || !makeupEditReason.trim()}
                                  onClick={async () => {
                                    if (makeupEditSending || !makeupEditReason.trim()) return;
                                    setMakeupEditSending(true);
                                    try {
                                      const reason = makeupEditReason.trim();
                                      const msg = `[보강 수정] ${it.subjectName} · ${it.materialTitle} · 제안 ${makeupEditAmount}${it.unit} · 사유: ${reason}`;
                                      // 성공 토스트는 sendRequest 안에서 뜬다 — 실패 시 입력 보존을 위해 폼을 닫지 않는다.
                                      const ok = await sendRequest('makeup', msg, undefined, undefined, {
                                        materialId: it.materialId,
                                        materialType: it.materialType,
                                        done: makeupEditAmount,
                                      });
                                      if (ok) {
                                        setMakeupEditId(null);
                                        setMakeupEditReason('');
                                      }
                                    } finally {
                                      setMakeupEditSending(false);
                                    }
                                  }}
                                  className="flex-1 rounded-full bg-amber-500 py-2 text-[11px] font-semibold text-white hover:bg-amber-600 active:scale-[0.97] disabled:opacity-60"
                                >
                                  {makeupEditSending ? '보내는 중...' : '요청 보내기'}
                                </button>
                                <button
                                  type="button"
                                  disabled={makeupEditSending}
                                  onClick={() => { setMakeupEditId(null); setMakeupEditReason(''); }}
                                  className="flex-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-60"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setMakeupOpenId(null);
                                setMakeupEditId(it.id);
                                setMakeupEditAmount(it.done);
                                setMakeupEditReason('');
                              }}
                              className="mt-2 text-[11px] font-semibold text-amber-700/90 dark:text-amber-300/90 underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-200"
                            >
                              보강 분량이 달라요 · 수정 요청
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 주간목표 주차별 상세·조정 빠른 링크 — 상세 진행/입력은 위 통합 카드에서, 주차별은 학습계획 탭에서. */}
            {visibleDeadlineGoals.length > 0 && openWeeklyPlan && (
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={openWeeklyPlan}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[11px] font-semibold text-[#0071E3] transition hover:bg-[#0071E3]/5 active:scale-[0.98]"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  주간 계획 확인·수정
                </button>
              </div>
            )}
          </div>

          {/* 확인할 특이사항 — 홈 최상단 통합 패널(휴가·도시락·상담·미응답요청·주말보강·외출반영). 특이사항 없으면 렌더 안 함. 오늘 할 일 요약 다음 순서. */}
          <HomeHighlightsPanel
            leaveRequests={student.leaveRequests || []}
            makeupNotices={recentMakeupNotices}
            awayReplans={recentAwayReplans}
            consultationBookings={consultationBookings}
            pendingMealCount={pendingMealCount}
            pendingMockCount={pendingMockCount}
            pendingOtCount={pendingOtCount}
            pendingCampusCount={pendingCampusCount}
            pendingSaturdayCount={pendingSaturdayCount}
            openConsultation={openConsultation}
            openNotifications={openNotifications}
            openLeaveRequests={openLeaveRequests}
            openWeeklyPlan={openWeeklyPlan}
            openMakeup={openMakeup}
          />

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

          {/* 홈 상태 카드 4개 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(() => {
              const Tag = openTimetable ? 'button' : 'div';
              return (
                <Tag
                  {...(openTimetable ? { type: 'button' as const, onClick: openTimetable } : {})}
                  className={`rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-3.5 text-left ${openTimetable ? 'transition hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03] active:scale-[0.99]' : ''}`}
                >
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    지금 할 공부
                    {openTimetable && <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
                  </p>
                  <p className="mt-2 text-xs font-black text-slate-800 dark:text-slate-200 leading-tight truncate">{currentSubjectText}</p>
                  <p className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-400">{currentStudyLabel}</p>
                </Tag>
              );
            })()}
            <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-3.5">
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">오늘 집중</p>
                <p className="text-base font-black text-[#0071E3] tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtStudyMin(homeFocusMin)}
                </p>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-1 border-t border-[#0071E3]/10 pt-1.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">오늘 체류</p>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtStudyMin(homeStayMin)}
                </p>
              </div>
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
              <DailyPlanAverageCard />
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
          <AnimatedOverlay
            onClose={() => setDdayOpen(false)}
            align="bottom"
            ariaLabel="D-Day 관리"
            backdropClassName="fixed inset-0 z-50 flex items-end justify-center pb-6 px-4 bg-black/30 backdrop-blur-sm no-print"
            panelClassName="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl overflow-hidden"
          >
          {(requestClose) => (
            <>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/10 bg-[#FAFAFA] dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-[#0071E3]" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">D-Day 관리</h3>
                </div>
                <button onClick={requestClose} className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
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
            </>
          )}
          </AnimatedOverlay>
    )}
    </>
  );
}
