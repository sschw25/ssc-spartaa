'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Home, Bell, Award, MessageSquare, ClipboardList, BookOpen, FileText, Shield, Target, Timer, CalendarDays } from 'lucide-react';
import { WEEKDAY_LABEL } from '@/lib/consultation-schedule';
import { Student, SubjectProgress, DetailedPlan, LeaveType, ConsultationLog, ProposedGoal, ProposedMaterial, MockExam, LeaveRequest, ThreadMessage } from '@/lib/types/student';
import {
  getMonthlyLeaveUsage,
  getLeaveCredits,
  MONTHLY_HALFDAY_QUOTA,
  MONTHLY_FULLDAY_QUOTA,
  kstYearMonth,
  formatLeaveLabel,
} from '@/lib/leave';
import { MaterialBenchmarkMap } from '@/lib/material-benchmark';
import { ACADEMY_TIMETABLE, STUDY_TIME_SLOTS, getStudyTimeSlot } from '@/lib/academy-timetable';
import { getGradeChartData, getGradeSubjects } from '@/lib/grade-chart';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import { deriveDeadlineGoals } from '@/lib/deadline-goals';
import { getMaterialStudyDays, getLeaveExemptions } from '@/lib/progress-plan';
import { getAwayImpactSlots } from '@/lib/away-impact';
import { getTodayScheduleItems, getBlockedPeriodKeys, assignItemsToPeriods, getPeriodNumLabel, type AssignedScheduleItem } from '@/lib/today-schedule';
import { buildDisplayThread } from '@/lib/thread';
import type { StudyStats } from '@/components/report/study-stats-card';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

const BRIEFING_MESSAGES: Record<string, string[]> = {
  studying: [
    '지금 이 한 과목이 합격을 만듭니다.',
    '딱 한 세션만 깊게 몰입해볼까요? 💪',
    '집중은 시작하는 순간 만들어져요.',
    '지금 흐름을 놓치지 말고 끝까지 가봐요.',
    '오늘의 이 시간이 내일의 점수예요.',
  ],
  selfStudy: [
    '오늘 부족했던 과목을 채울 시간이에요.',
    '스스로 정한 목표가 진짜 실력이 됩니다.',
    '자율 시간일수록 계획표가 길잡이예요.',
    '약점 한 가지만 정해서 공략해볼까요?',
  ],
  morning: [
    '오늘의 첫 페이지를 열어볼까요?',
    '아침 컨디션이 하루를 좌우해요.',
    '가벼운 복습으로 시동을 걸어봐요.',
    '오늘 목표 한 가지만 정하고 시작해요.',
  ],
  afternoon: [
    '잠깐의 휴식도 공부의 일부예요.',
    '물 한 잔 마시고 다시 가볼까요?',
    '오후의 집중력, 짧고 굵게 채워봐요.',
    '여기까지 온 것도 충분히 잘하고 있어요.',
  ],
  evening: [
    '오늘 하루 정말 고생 많았어요.',
    '마무리 정리가 내일을 가볍게 해요.',
    '오늘 푼 문제들이 내일의 자신감이 돼요.',
    '하루를 돌아보며 가볍게 정리해볼까요?',
  ],
  night: [
    '무리하지 말고 충분히 쉬어요. 🌙',
    '잠도 공부의 일부예요. 푹 자요.',
    '오늘의 노력은 이미 충분했어요.',
  ],
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  progress: '진도 정정',
  subject: '과목 변경',
  plan: '학습계획',
  halfDay: '휴식신청',
  restPass: '휴식권 신청',
  etc: '기타',
};

const getRequestTypeLabel = (type?: string) => REQUEST_TYPE_LABEL[type || 'etc'] || '기타 신청';
const notificationStorageKey = (studentId: string) => `ssc-dismissed-notifications:${studentId}`;

function readDismissedNotificationIds(studentId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(notificationStorageKey(studentId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// 스레드의 마지막 관리자 답변 시각. 답변 알림 id 에 포함해, 학생이 이전 답변을 확인(dismiss)한
// 뒤에도 같은 신청에 새 답변이 달리면 별개 알림으로 다시 노출되게 한다(상담 시간변경 제안과 동일 패턴).
function lastAdminReplyAt(thread: ThreadMessage[] | undefined, fallback?: string): string {
  for (let i = (thread?.length ?? 0) - 1; i >= 0; i--) {
    const msg = thread![i];
    if (msg.from === 'admin') return msg.at || fallback || '';
  }
  return fallback || '';
}

function writeDismissedNotificationIds(studentId: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(notificationStorageKey(studentId), JSON.stringify(ids));
}

function getDismissedNotificationIdsFromNote(specialNote?: string | null): string[] {
  const value = parseSpecialNoteObj(specialNote).dismissed_notifications;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function getInitialDismissedNotificationIds(student: Student): string[] {
  return Array.from(new Set([
    ...getDismissedNotificationIdsFromNote(student.specialNote),
    ...readDismissedNotificationIds(student.id),
  ]));
}

// ─── 모듈 스코프 순수 헬퍼 (렌더마다 재생성 방지) ───────────────────────────

const WEEKDAY_KEY_MAP: Record<string, 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = {
  Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
};

const WEEK_DAY_SLOTS = [
  { key: 'mon', label: '월요일' },
  { key: 'tue', label: '화요일' },
  { key: 'wed', label: '수요일' },
  { key: 'thu', label: '목요일' },
  { key: 'fri', label: '금요일' },
  { key: 'sat', label: '토요일' },
  { key: 'sun', label: '일요일' },
] as const;

const WEEK_DAY_SLOTS_BY_DATE = [
  { key: 'sun', label: '일요일' },
  { key: 'mon', label: '월요일' },
  { key: 'tue', label: '화요일' },
  { key: 'wed', label: '수요일' },
  { key: 'thu', label: '목요일' },
  { key: 'fri', label: '금요일' },
  { key: 'sat', label: '토요일' },
] as const;

const STUDY_TIME_ORDER: Record<string, number> = { morning: 0, afternoon: 1, night: 2, '': 3 };

const STUDY_TIME_LABELS: Record<string, string> = {
  morning: getStudyTimeSlot('morning')?.displayLabel || '오전',
  afternoon: getStudyTimeSlot('afternoon')?.displayLabel || '오후',
  night: getStudyTimeSlot('night')?.displayLabel || '야간',
  '': '미지정',
};

const STUDY_TIME_SLOTS_MAPPED = [
  ...STUDY_TIME_SLOTS.map((slot) => ({
    key: slot.key,
    label: slot.displayLabel,
    timeRange: slot.timeRange,
    periodLabel: slot.periodLabel,
    description: slot.description,
  })),
  { key: '' as const, label: '미지정', timeRange: '', periodLabel: '시간대 미지정', description: '아직 학원 시간표 구간이 배정되지 않았습니다.' },
];

type SpecialNoteEnvelope = {
  noteText?: string;
  pomodoro_minutes?: Record<string, number>;
  dismissed_notifications?: string[];
  daily_checklist?: Record<string, unknown>;
  [key: string]: unknown;
};

function getSeoulDateKey() {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year  = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day   = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function parseSpecialNoteObj(specialNote?: string | null): SpecialNoteEnvelope {
  if (!specialNote) return {};
  try {
    const obj = JSON.parse(specialNote);
    if (typeof obj === 'object' && obj !== null) return obj as SpecialNoteEnvelope;
    return { noteText: specialNote };
  } catch {
    return { noteText: specialNote };
  }
}

function extractQuestsFromComment(comment?: string): string[] {
  if (!comment) return [];
  const quests: string[] = [];
  for (const line of comment.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(?:(?:\d+[\.\)]\s*)|(?:[-\*]\s*)|(?:\[\s*\]\s*)|(?:[①-⑨]\s*))(.*)$/);
    if (match?.[1]) {
      const content = match[1].trim();
      if (content) quests.push(content);
    }
  }
  return quests;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function getKstNowParts(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return { weekday: value('weekday'), hour: Number(value('hour')), minute: Number(value('minute')) };
}

function formatDateKey(date: Date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function getDailyAmountLabel(plan: DetailedPlan) {
  const amount = plan.dailyAmount || Math.ceil(plan.targetAmount / 6);
  const range  = plan.rangeText || '';
  const rangeWithoutPass = range.replace(/\d+회독/g, '');
  const unit =
    range.includes('문제') ? '문제' :
    range.includes('강')   ? '강' :
    range.toLowerCase().includes('p') ? 'p' :
    rangeWithoutPass.includes('회') ? '회' :
    '';
  return `하루 ${amount}${unit}`;
}

function isPlanActiveOnDate(plan: DetailedPlan, dateKey: string) {
  return plan.startDate <= dateKey && dateKey <= plan.endDate;
}

function formatNotificationDate(value?: string) {
  if (!value) return '오늘';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(date);
}

function truncateNotificationText(value: string, max = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function parseDateOnly(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

// ────────────────────────────────────────────────────────────────────────────

type ProgressMaterialType = 'book' | 'lecture';

// `?tab=` 쿼리로 진입 가능한 학생 탭 id 화이트리스트 (구 /student/missions 리다이렉트 등)
const STUDENT_TAB_IDS = [
  'report-overview',
  'learning',
  'life',
  'student-notifications',
  'attendance-status',
  'study-stats',
  'timetable',
  'execution-plan',
  'coach-feedback',
  'student-requests',
  'student-suggestions',
  'clinic-booking',
  'coupon-exchange',
  // 신청 컨테이너 서브탭 raw id — 화면에 보이는 탭 id 그대로 딥링크 가능(별칭과 병행 유지)
  'learning-request',
  'leave',
  'consultation',
  'suggestion',
  'coupon',
  'student-coupons',
  'subject-progress',
  'grade-analysis',
  'student-penalties',
];

export function useReportState() {
  const confirm = useConfirm();
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const shareTokenParam = searchParams.get('token');
  const audience = shareTokenParam ? 'parent' : (searchParams.get('audience') === 'student' ? 'student' : 'parent');
  const isStudentReport = audience === 'student';
  const isParentReport = audience === 'parent';

  // 학부모 공유 링크 비밀번호 게이트
  const [sharePasswordInput, setSharePasswordInput] = useState('');
  const [sharePasswordError, setSharePasswordError] = useState('');
  const [sharePasswordVerified, setSharePasswordVerified] = useState(false);
  const [sharePasswordChecking, setSharePasswordChecking] = useState(false);

  const [student, setStudent] = useState<Student | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [materialBenchmarks, setMaterialBenchmarks] = useState<MaterialBenchmarkMap>({});
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visiblePlanWeeks, setVisiblePlanWeeks] = useState(1);
  // 학생 뷰에서만 ?tab= 초기 탭 허용 — 학부모/공유 뷰에는 학생 전용 탭이 없어 빈 화면이 된다.
  const initialTabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() =>
    isStudentReport && initialTabParam && STUDENT_TAB_IDS.includes(initialTabParam)
      ? initialTabParam
      : 'report-overview'
  );

  const paperRef = useRef<HTMLDivElement>(null);
  const slideDirRef = useRef(1);
  const firstTabRender = useRef(true);

  const [gradeForm, setGradeForm] = useState(() => ({
    testName: '',
    subject: '',
    score: '',
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
  }));
  const [gradeSubmitting, setGradeSubmitting] = useState(false);
  const [gradeError, setGradeError] = useState('');

  const [requestForm, setRequestForm] = useState({
    requestType: 'progress',
    message: '',
    materialId: '',
    materialType: 'book' as 'book' | 'lecture',
    goalType: 'deadlineWeeks' as 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced',
    goalValue: '',
    targetDate: '',
    studyDays: [] as Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>,
    currentProgress: '',
    proposedWeekNumber: '',
    proposedRangeText: '',
    speedMultiplier: '1.0',
    currentGoalSnapshot: null as { goalType?: string; goalValue?: number; speedMultiplier?: number } | null,
  });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [requestError, setRequestError] = useState('');
  const [requestCustomOpen, setRequestCustomOpen] = useState(false);

  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');

  const [checklistForm, setChecklistForm] = useState<{
    sleepHours: number;
    phoneSubmitted: boolean;
    phoneStatus: 'submitted' | 'locker' | 'off_hold';
    phoneReason: string;
  }>({ sleepHours: 7, phoneSubmitted: true, phoneStatus: 'submitted', phoneReason: '' });
  const [checklistSubmitting, setChecklistSubmitting] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ show: boolean; reasons: string[] }>({ show: false, reasons: [] });
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);

  const [completedQuests, setCompletedQuests] = useState<Record<number, boolean>>({});

  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [showSuggestionHistory, setShowSuggestionHistory] = useState(false);

  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [leaveForm, setLeaveForm] = useState<{ type: LeaveType; slot?: 'morning' | 'afternoon' | 'night' | 'fullday'; date: string; reason: string }>(() => ({
    type: 'morning',
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    reason: '',
  }));
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  const [homeAttend, setHomeAttend] = useState<{
    loading: boolean;
    checkedIn: boolean;
    todayMinutes: number;
    since: string | null;
    sinceToday: boolean;
  }>({
    loading: true,
    checkedIn: false,
    todayMinutes: 0,
    since: null,
    sinceToday: false,
  });
  const [homeAttendNow, setHomeAttendNow] = useState(0);
  const [realigningPlans, setRealigningPlans] = useState(false);

  // 1. 코멘터 퀘스트 상태 동기화 로드
  useEffect(() => {
    if (!student) return;
    const coachQuests = extractQuestsFromComment(student.studentLifeComment);
    const initialDone: Record<number, boolean> = {};
    coachQuests.forEach((quest, idx) => {
      const saved = window.localStorage.getItem(`ssc-coach-quest-done:${student.id}:${quest}:${idx}`);
      initialDone[idx] = saved === 'true';
    });
    setCompletedQuests(initialDone);
  }, [student]);

  // 2. 실시간 출결 로드 및 폴링
  useEffect(() => {
    if (!isStudentReport) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/attend', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setHomeAttend({
            loading: false,
            checkedIn: !!json.checkedIn,
            todayMinutes: json.todayMinutes || 0,
            since: json.since || null,
            sinceToday: !!json.sinceToday,
          });
        } else {
          setHomeAttend((s) => ({ ...s, loading: false }));
        }
      } catch {
        if (active) setHomeAttend((s) => ({ ...s, loading: false }));
      }
    };
    load();
    setHomeAttendNow(Date.now());
    const id = setInterval(() => {
      load();
      setHomeAttendNow(Date.now());
    }, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isStudentReport]);

  // 2-1. 탭 상태 ↔ URL 동기화 — setActiveTab 경로(클릭/스와이프/딥링크 소비) 전부를 한곳에서 커버.
  // replaceState 만 사용(리렌더/스크롤/히스토리 오염 없음, push 금지) → 새로고침해도 현재 탭 유지.
  useEffect(() => {
    if (!isStudentReport || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('tab');
    if (current === activeTab) return;
    // 최초 진입(파라미터 없음 + 기본 탭)에는 URL 을 건드리지 않는다.
    if (current === null && activeTab === 'report-overview') return;
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [activeTab, isStudentReport]);

  // 2-2. 포커스/가시성 복귀 시 조용한 재검증 — 다른 기기/관리자 변경분을 스피너 없이 반영.
  // admin/dashboard 의 focus/visibilitychange 패턴 재사용, 과도 호출 방지 30초 스로틀.
  const lastFocusRefreshRef = useRef(0);
  // 재조회 발사 후 도착 전에 로컬 저장(진도/점검표)이 반영되면 stale 응답이 그걸 화면에서 되돌린다
  // — 저장 성공 시마다 증가시키고, 발사 시점과 달라진 응답은 버린다.
  const mutationSeqRef = useRef(0);
  useEffect(() => {
    if (!isStudentReport || shareTokenParam) return;
    // 마운트 직후 첫 포커스에 곧바로 재조회하지 않도록 기준 시각을 지금으로 초기화
    lastFocusRefreshRef.current = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 30_000) return;
      lastFocusRefreshRef.current = now;
      const seqAtStart = mutationSeqRef.current;
      fetch(`/api/report/${studentId}?audience=${audience}&scope=core`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (mutationSeqRef.current !== seqAtStart) return; // 그 사이 저장 반영됨 — stale 응답 폐기
          if (json?.success && json.data) {
            setStudent(json.data);
            setMockExams(json.mockExams || []);
          }
        })
        .catch(() => {
          // 조용한 갱신 실패는 무시 — 기존 화면 유지, 다음 포커스 때 재시도
        });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isStudentReport, shareTokenParam, studentId, audience]);

  // 3. 탭 포커스/모션 이펙트
  useEffect(() => {
    const el = document.querySelector('[data-tab-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    if (firstTabRender.current) {
      firstTabRender.current = false;
      return;
    }
    paperRef.current?.animate(
      [
        { opacity: 0.3, transform: `translateX(${slideDirRef.current * 22}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  }, [activeTab]);

  // 4. 리포트 본 데이터 로드
  useEffect(() => {
    setMounted(true);
    // effect 재실행(학생/audience 변경) 후 늦게 도착한 응답이 새 데이터를 덮어쓰지 않게 가드
    let stale = false;
    async function loadReport() {
      try {
        if (shareTokenParam) {
          // 공유 링크(학부모): 토큰은 쿼리, 비밀번호는 URL에 남지 않도록 헤더 — 단일 전체 요청 유지.
          const res = await fetch(`/api/report/${studentId}?audience=${audience}&token=${encodeURIComponent(shareTokenParam)}`, {
            headers: { 'x-report-password': sharePasswordInput },
          });
          if (res.ok) {
            const json = await res.json();
            if (stale) return;
            if (json.success) {
              setStudent(json.data);
              setDismissedNotificationIds(json.data?.id ? getInitialDismissedNotificationIds(json.data) : []);
              setMaterialBenchmarks(json.materialBenchmarks || {});
              setStudyStats(json.studyStats || null);
              setMockExams(json.mockExams || []);
            } else {
              setError(true);
            }
          } else {
            setError(true);
          }
          return;
        }

        // 세션 접근(학생/관리자): 본문(core)을 먼저 받아 즉시 렌더하고,
        // 무거운 집계(벤치마크·순공통계)는 백그라운드(extras)로 뒤에 채운다 → 첫 로딩 체감 단축.
        const res = await fetch(`/api/report/${studentId}?audience=${audience}&scope=core`);
        if (res.ok) {
          const json = await res.json();
          if (stale) return;
          if (json.success) {
            setStudent(json.data);
            setDismissedNotificationIds(json.data?.id ? getInitialDismissedNotificationIds(json.data) : []);
            setMockExams(json.mockExams || []);
            fetch(`/api/report/${studentId}?audience=${audience}&scope=extras`)
              .then((extrasRes) => (extrasRes.ok ? extrasRes.json() : null))
              .then((extras) => {
                if (stale) return;
                if (extras?.success) {
                  setMaterialBenchmarks(extras.materialBenchmarks || {});
                  setStudyStats(extras.studyStats || null);
                }
              })
              .catch(() => {
                // 집계 실패는 본문 표시에 영향 없음(기존에도 null 허용)
              });
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      } catch (err) {
        setError(true);
      } finally {
        if (!stale) setLoading(false);
      }
    }
    if (studentId && (!shareTokenParam || sharePasswordVerified)) {
      loadReport();
    }
    return () => {
      stale = true;
    };
  }, [studentId, audience, sharePasswordVerified]);

  const getCampusLabel = (val: string) => {
    switch (val) {
      case 'wonju': return '원주 캠퍼스';
      case 'chuncheon': return '춘천 캠퍼스';
      case 'chungju': return '충주 캠퍼스';
      default: return '학습 센터';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/student/auth/logout', { method: 'POST' });
    } catch {
      // noop
    }
    window.location.href = '/student/login';
  };

  const commitDismissedNotifications = (ids: string[]) => {
    if (!student?.id) return;
    writeDismissedNotificationIds(student.id, ids);
    fetch('/api/student/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissedNotificationIds: ids }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && typeof json.specialNote === 'string') {
          setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote } : prev));
        }
      })
      .catch(() => {
        // 로컬 숨김 상태는 유지한다. 서버 동기화는 다음 조작 때 다시 시도된다.
      });
  };

  const dismissNotification = (notificationId: string) => {
    if (!student?.id) return;
    setDismissedNotificationIds((prev) => {
      if (prev.includes(notificationId)) return prev;
      const next = [...prev, notificationId];
      commitDismissedNotifications(next);
      return next;
    });
  };

  const restoreNotification = (notificationId: string) => {
    if (!student?.id) return;
    setDismissedNotificationIds((prev) => {
      const next = prev.filter((id) => id !== notificationId);
      commitDismissedNotifications(next);
      return next;
    });
  };

  const restoreAllNotifications = () => {
    if (!student?.id) return;
    commitDismissedNotifications([]);
    setDismissedNotificationIds([]);
  };

  // 학생이 코멘터 답변에 재답변 — 서버 append 후 로컬 스레드 낙관적 갱신
  const replyToThread = async (
    kind: 'request' | 'suggestion' | 'leave',
    id: string,
    text: string,
  ): Promise<boolean> => {
    if (!student?.id) return false;
    try {
      const res = await fetch('/api/student/thread-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, message: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return false;
      const msg = { id: `local_${Date.now()}`, from: 'student' as const, text, at: new Date().toISOString() };
      // 서버 seedLegacyThread와 동일하게: thread 비어있고 adminReply만 있으면 레거시 답변을 선승격
      const appendTo = (arr?: any[]) => (arr || []).map((it) => {
        if (it.id !== id) return it;
        const base = (it.thread && it.thread.length > 0)
          ? it.thread
          : (it.adminReply ? [{ id: 'legacy', from: 'admin', text: it.adminReply, at: it.repliedAt || '' }] : []);
        return { ...it, thread: [...base, msg] };
      });
      setStudent((prev) => {
        if (!prev) return prev;
        if (kind === 'leave') return { ...prev, leaveRequests: appendTo(prev.leaveRequests) };
        if (kind === 'request') return { ...prev, changeRequests: appendTo(prev.changeRequests) };
        return { ...prev, suggestionRequests: appendTo(prev.suggestionRequests) };
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleSharePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharePasswordInput.trim()) return;
    setSharePasswordChecking(true);
    setSharePasswordError('');
    try {
      // 비밀번호는 URL이 아니라 헤더로 전달 (히스토리/로그/리퍼러 노출 방지)
      const res = await fetch(
        `/api/report/${studentId}?audience=parent&token=${encodeURIComponent(shareTokenParam!)}`,
        { headers: { 'x-report-password': sharePasswordInput } }
      );
      const json = await res.json();
      if (json.success) {
        setSharePasswordVerified(true);
        setStudent(json.data);
        setDismissedNotificationIds(json.data?.id ? getInitialDismissedNotificationIds(json.data) : []);
        setMaterialBenchmarks(json.materialBenchmarks || {});
        setStudyStats(json.studyStats || null);
        setMockExams(json.mockExams || []);
        setLoading(false);
      } else {
        setSharePasswordError(json.message || '비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setSharePasswordError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSharePasswordChecking(false);
    }
  };

  const submitGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setGradeError('');
    const testName = gradeForm.testName.trim();
    const subject = gradeForm.subject.trim();
    const score = Number(gradeForm.score);
    const date = gradeForm.date;
    if (!testName || !subject || !gradeForm.score || !date) {
      setGradeError('모든 항목을 입력해 주세요.');
      return;
    }
    let maxAllowedScore = 100;
    const testNameLower = testName.toLowerCase();
    const subjectTrimmed = subject.trim();

    if (testNameLower.includes('모의고사') || testNameLower.includes('모평') || testNameLower.includes('학평') || testNameLower.includes('수능')) {
      if (testNameLower.includes('표점') || testNameLower.includes('표준점수')) {
        maxAllowedScore = 200;
      } else if (subjectTrimmed.includes('사탐') || subjectTrimmed.includes('과탐') || subjectTrimmed.includes('탐구') || subjectTrimmed === '한국사') {
        maxAllowedScore = 50;
      } else {
        maxAllowedScore = 100;
      }
    } else if (testNameLower.includes('주간테스트') || testNameLower.includes('단원평가') || testNameLower.includes('일일테스트') || testNameLower.includes('테스트')) {
      maxAllowedScore = 100;
    } else {
      maxAllowedScore = 200;
    }

    if (!Number.isFinite(score) || score < 0 || score > maxAllowedScore) {
      setGradeError(`점수를 0~${maxAllowedScore} 사이로 입력해 주세요. (판별된 시험/과목 만점: ${maxAllowedScore}점)`);
      return;
    }
    setGradeSubmitting(true);
    try {
      const res = await fetch('/api/student/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testName, subject, score, date }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, grades: [...(prev.grades || []), json.grade] } : prev));
        setGradeForm({
          testName: '',
          subject: '',
          score: '',
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
        });
        toast.success('성적을 저장했어요.');
      } else {
        setGradeError(json.message || '저장에 실패했습니다.');
        toast.error(json.message || '저장에 실패했어요.');
      }
    } catch {
      setGradeError('네트워크 오류가 발생했습니다.');
    } finally {
      setGradeSubmitting(false);
    }
  };
  
  const deleteGrade = async (id: string) => {
    try {
      const res = await fetch(`/api/student/grades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, grades: (prev.grades || []).filter((g) => g.id !== id) } : prev));
        toast.success('성적 기록을 삭제했어요.');
      }
    } catch {
      // noop
    }
  };

  const applyProgressPatch = (
    materialType: ProgressMaterialType,
    materialId: string,
    value: number,
    planId?: string,
    isCompleted?: boolean,
    solvedQuestions?: number,
    incorrectTags?: Record<string, number>,
    actualAmount?: number,
    dateKey?: string,
    reviewLog?: Record<string, number>,
    addInputToday?: boolean,
  ) => {
    setStudent((prev) => {
      if (!prev) return prev;

      // 자율 입력 저장 성공 시 inputLog 에 오늘을 낙관적으로 추가 → todaySelfPacedItems.loggedToday 즉시 반영.
      const seoulToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      const nextInputLog = (log?: string[]) =>
        addInputToday && !(log || []).includes(seoulToday) ? [...(log || []), seoulToday].slice(-120) : log;

      // 1. 최상위 books 패치
      const updatedBooks = (prev.books || []).map((b) => {
        if (materialType !== 'book' || b.id !== materialId) return b;
        return {
          ...b,
          currentPage: value,
          ...(reviewLog !== undefined ? { reviewLog } : {}),
          ...(addInputToday ? { inputLog: nextInputLog(b.inputLog) } : {}),
          ...(solvedQuestions !== undefined ? { solvedQuestions } : {}),
          ...(incorrectTags !== undefined ? { incorrectTags } : {}),
          ...(planId
            ? {
                detailedPlans: (b.detailedPlans || []).map((p) =>
                  p.id === planId
                      ? dateKey
                        ? {
                            ...p,
                            dailyCompletions: isCompleted
                              ? {
                                  ...(p.dailyCompletions || {}),
                                  [dateKey]: {
                                    isCompleted: true,
                                    ...(actualAmount !== undefined ? { actualAmount } : {}),
                                    completedAt: new Date().toISOString(),
                                  },
                                }
                              : Object.fromEntries(
                                  Object.entries(p.dailyCompletions || {}).filter(([key]) => key !== dateKey),
                                ),
                          }
                        : { ...p, isCompleted: Boolean(isCompleted), ...(actualAmount !== undefined && isCompleted ? { actualAmount } : isCompleted === false ? { actualAmount: undefined } : {}) }
                    : p,
                ),
              }
            : {}),
        };
      });

      // 2. 최상위 lectures 패치
      const updatedLectures = (prev.lectures || []).map((l) => {
        if (materialType !== 'lecture' || l.id !== materialId) return l;
        return {
          ...l,
          completedLectures: value,
          ...(reviewLog !== undefined ? { reviewLog } : {}),
          ...(addInputToday ? { inputLog: nextInputLog(l.inputLog) } : {}),
          ...(planId
            ? {
                detailedPlans: (l.detailedPlans || []).map((p) =>
                  p.id === planId
                      ? dateKey
                        ? {
                            ...p,
                            dailyCompletions: isCompleted
                              ? {
                                  ...(p.dailyCompletions || {}),
                                  [dateKey]: {
                                    isCompleted: true,
                                    ...(actualAmount !== undefined ? { actualAmount } : {}),
                                    completedAt: new Date().toISOString(),
                                  },
                                }
                              : Object.fromEntries(
                                  Object.entries(p.dailyCompletions || {}).filter(([key]) => key !== dateKey),
                                ),
                          }
                        : { ...p, isCompleted: Boolean(isCompleted), ...(actualAmount !== undefined && isCompleted ? { actualAmount } : isCompleted === false ? { actualAmount: undefined } : {}) }
                    : p,
                ),
              }
            : {}),
        };
      });

      // 3. subjects 내 books/lectures 패치
      const updatedSubjects = (prev.subjects || []).map((s) => ({
        ...s,
        books: (s.books || []).map((b) => {
          if (materialType !== 'book' || b.id !== materialId) return b;
          return {
            ...b,
            currentPage: value,
            ...(reviewLog !== undefined ? { reviewLog } : {}),
            ...(addInputToday ? { inputLog: nextInputLog(b.inputLog) } : {}),
            ...(solvedQuestions !== undefined ? { solvedQuestions } : {}),
            ...(incorrectTags !== undefined ? { incorrectTags } : {}),
            ...(planId
              ? {
                  detailedPlans: (b.detailedPlans || []).map((p) =>
                    p.id === planId
                        ? dateKey
                          ? {
                              ...p,
                              dailyCompletions: isCompleted
                                ? {
                                    ...(p.dailyCompletions || {}),
                                    [dateKey]: {
                                      isCompleted: true,
                                      ...(actualAmount !== undefined ? { actualAmount } : {}),
                                      completedAt: new Date().toISOString(),
                                    },
                                  }
                                : Object.fromEntries(
                                    Object.entries(p.dailyCompletions || {}).filter(([key]) => key !== dateKey),
                                  ),
                            }
                          : { ...p, isCompleted: Boolean(isCompleted), ...(actualAmount !== undefined && isCompleted ? { actualAmount } : isCompleted === false ? { actualAmount: undefined } : {}) }
                      : p,
                  ),
                }
              : {}),
          };
        }),
        lectures: (s.lectures || []).map((l) => {
          if (materialType !== 'lecture' || l.id !== materialId) return l;
          return {
            ...l,
            completedLectures: value,
            ...(reviewLog !== undefined ? { reviewLog } : {}),
            ...(addInputToday ? { inputLog: nextInputLog(l.inputLog) } : {}),
            ...(planId
              ? {
                  detailedPlans: (l.detailedPlans || []).map((p) =>
                    p.id === planId
                        ? dateKey
                          ? {
                              ...p,
                              dailyCompletions: isCompleted
                                ? {
                                    ...(p.dailyCompletions || {}),
                                    [dateKey]: {
                                      isCompleted: true,
                                      ...(actualAmount !== undefined ? { actualAmount } : {}),
                                      completedAt: new Date().toISOString(),
                                    },
                                  }
                                : Object.fromEntries(
                                    Object.entries(p.dailyCompletions || {}).filter(([key]) => key !== dateKey),
                                  ),
                            }
                          : { ...p, isCompleted: Boolean(isCompleted), ...(actualAmount !== undefined && isCompleted ? { actualAmount } : isCompleted === false ? { actualAmount: undefined } : {}) }
                      : p,
                  ),
                }
              : {}),
          };
        }),
      }));

      return {
        ...prev,
        books: updatedBooks,
        lectures: updatedLectures,
        subjects: updatedSubjects,
      };
    });
  };

  // 기간 목표(deadline) plan 의 actualAmount/isCompleted + 자료 current 를 루트/subjects 양쪽에 반영.
  const applyDeadlineProgressPatch = (
    materialType: ProgressMaterialType,
    materialId: string,
    planId: string,
    actualAmount: number,
    isCompleted: boolean,
    currentValue?: number,
  ) => {
    setStudent((prev) => {
      if (!prev) return prev;
      const patchPlan = (p: DetailedPlan) =>
        p.id === planId ? { ...p, actualAmount, isCompleted } : p;
      const patchBook = (b: typeof prev.books[number]) =>
        materialType === 'book' && b.id === materialId
          ? {
              ...b,
              ...(currentValue !== undefined ? { currentPage: currentValue } : {}),
              detailedPlans: (b.detailedPlans || []).map(patchPlan),
            }
          : b;
      const patchLecture = (l: typeof prev.lectures[number]) =>
        materialType === 'lecture' && l.id === materialId
          ? {
              ...l,
              ...(currentValue !== undefined ? { completedLectures: currentValue } : {}),
              detailedPlans: (l.detailedPlans || []).map(patchPlan),
            }
          : l;
      return {
        ...prev,
        books: (prev.books || []).map(patchBook),
        lectures: (prev.lectures || []).map(patchLecture),
        subjects: (prev.subjects || []).map((s) => ({
          ...s,
          books: (s.books || []).map(patchBook),
          lectures: (s.lectures || []).map(patchLecture),
        })),
      };
    });
  };

  const saveProgressPatch = async (
    materialType: ProgressMaterialType,
    materialId: string,
    payload: { value?: number; planId?: string; isCompleted?: boolean; dateKey?: string; actualAmount?: number; solvedQuestions?: number; incorrectTags?: Record<string, number>; reviewMinutes?: number },
    // 자율 입력(selfPaced) 저장 — 성공 시 inputLog 에 오늘을 낙관적으로 추가(loggedToday 즉시 반영).
    addInputToday?: boolean,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, ...payload }),
      });
      const json = await res.json();
      if (res.ok && json.success && typeof json.value === 'number') {
        mutationSeqRef.current += 1;
        applyProgressPatch(
          materialType,
          materialId,
          json.value,
          json.planId,
          json.isCompleted,
          json.solvedQuestions,
          json.incorrectTags,
          json.actualAmount ?? payload.actualAmount,
          json.dateKey ?? payload.dateKey,
          json.reviewLog,
          addInputToday,
        );
        return true;
      }
      // 서버 거절 — 낙관적 갱신을 하지 않았으므로 화면은 저장 전 상태 그대로. 사유만 안내.
      toast.error(json?.message || '진도 저장에 실패했어요. 다시 시도해 주세요.');
      return false;
    } catch {
      // 네트워크 실패 — 입력값은 호출부(패널)에서 보존, 여기서는 재시도 안내만.
      toast.error('네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요.');
      return false;
    }
  };

  const updateProgress = (materialType: ProgressMaterialType, materialId: string, value: number) =>
    saveProgressPatch(materialType, materialId, { value });

  const updateBookSolvedQuestions = (materialId: string, solvedQuestions: number) => {
    saveProgressPatch('book', materialId, { solvedQuestions });
  };

  const updatePlanCompletion = (
    materialType: ProgressMaterialType,
    materialId: string,
    planId: string,
    isCompleted: boolean,
    actualAmount?: number,
    dateKey?: string,
    reviewMinutes?: number,
  ) => saveProgressPatch(materialType, materialId, { planId, isCompleted, ...(actualAmount !== undefined ? { actualAmount } : {}), ...(dateKey ? { dateKey } : {}), ...(reviewMinutes !== undefined ? { reviewMinutes } : {}) });

  // 자율 입력(selfPaced) 자료 — 오늘 한 양(addAmount)을 현재 누적에 더한 절대값으로 저장 + 복습 분(옵션).
  // 계획/완료 카운트와 무관한 순수 누적 기록. 저장 성공 시 inputLog 에 오늘 추가(loggedToday 반영).
  const saveSelfPacedToday = (
    materialType: ProgressMaterialType,
    materialId: string,
    addAmount: number,
    reviewMinutes?: number,
  ): Promise<boolean> => {
    const seoulToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    // 현재 누적값 조회(루트/subjects 어디든 최초 매칭). selfPaced 는 subjects 에만 있으나 폴백 포함.
    let current = 0;
    if (materialType === 'book') {
      const b = (student?.books || []).find((it) => it.id === materialId)
        || (student?.subjects || []).flatMap((s) => s.books || []).find((it) => it.id === materialId);
      current = b?.currentPage || 0;
    } else {
      const l = (student?.lectures || []).find((it) => it.id === materialId)
        || (student?.subjects || []).flatMap((s) => s.lectures || []).find((it) => it.id === materialId);
      current = l?.completedLectures || 0;
    }
    const value = Math.max(0, current + Math.round(Number(addAmount) || 0));
    return saveProgressPatch(
      materialType,
      materialId,
      { value, dateKey: seoulToday, ...(reviewMinutes !== undefined ? { reviewMinutes } : {}) },
      true,
    );
  };

  // 자율 입력(selfPaced) 자료의 학생 지정 시간대(studySlot) 저장 — 시간표 노출 결정. 즉시 반영(승인 불필요).
  // 성공 시 subjects 내 해당 자료의 studySlot 낙관적 갱신.
  const saveStudySlot = async (
    materialType: ProgressMaterialType,
    materialId: string,
    slot: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, studySlot: slot }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        setStudent((prev) => {
          if (!prev) return prev;
          const patchList = <T extends { id: string; studySlot?: string }>(list?: T[]) =>
            (list || []).map((m) => (m.id === materialId ? { ...m, studySlot: slot } : m));
          return {
            ...prev,
            subjects: (prev.subjects || []).map((s) => ({
              ...s,
              ...(materialType === 'book' ? { books: patchList(s.books) } : { lectures: patchList(s.lectures) }),
            })),
            ...(materialType === 'book'
              ? { books: patchList(prev.books) }
              : { lectures: patchList(prev.lectures) }),
          };
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 자료 색상 지정 — 학생이 교재/인강별 색을 고른다. 시간표·캘린더·홈 등 어디서나 이 색으로 표시. 즉시 반영.
  const saveMaterialColor = async (
    materialType: ProgressMaterialType,
    materialId: string,
    color: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, color }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        setStudent((prev) => {
          if (!prev) return prev;
          const patchList = <T extends { id: string; color?: string }>(list?: T[]) =>
            (list || []).map((m) => (m.id === materialId ? { ...m, color: color || undefined } : m));
          return {
            ...prev,
            subjects: (prev.subjects || []).map((s) => ({
              ...s,
              ...(materialType === 'book' ? { books: patchList(s.books) } : { lectures: patchList(s.lectures) }),
            })),
            ...(materialType === 'book'
              ? { books: patchList(prev.books) }
              : { lectures: patchList(prev.lectures) }),
          };
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 자율 입력(selfPaced) 자료의 예상 총 분량 입력 — 학생 셀프서비스(관리자 개입 없음). 즉시 반영.
  // total(totalPages/totalLectures) 만 바꾸고 goalType 은 selfPaced 유지(계획 생성 안 함). totalIsEstimate=true.
  const saveEstimatedTotal = async (
    materialType: ProgressMaterialType,
    materialId: string,
    estimatedTotal: number,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, estimatedTotal }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        const nextTotal = Number(json.total) || 0;
        const hasEstimate = nextTotal > 0;
        setStudent((prev) => {
          if (!prev) return prev;
          const patchList = <T extends { id: string }>(list?: T[]) =>
            (list || []).map((m) =>
              m.id === materialId
                ? {
                    ...m,
                    ...(materialType === 'book' ? { totalPages: nextTotal } : { totalLectures: nextTotal }),
                    totalIsEstimate: hasEstimate ? true : undefined,
                  }
                : m,
            );
          return {
            ...prev,
            subjects: (prev.subjects || []).map((s) => ({
              ...s,
              ...(materialType === 'book' ? { books: patchList(s.books) } : { lectures: patchList(s.lectures) }),
            })),
            ...(materialType === 'book'
              ? { books: patchList(prev.books) }
              : { lectures: patchList(prev.lectures) }),
          };
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 오늘 시작점 조정 — /api/student/progress/adjust 호출.
  // 자동 승인(auto=true): 서버가 current+계획을 오늘 anchor 로 재생성 → 최소 데이터(subjects 등)만 병합(조용한 갱신).
  //   (리포트 student 는 마스킹 투영이라 전체 교체 대신 진도 관련 필드만 덮는다 — changeRequests 등 파생 필드 보존)
  // 범위 초과(auto=false): pending 신청 생성 → changeRequests 에 낙관적 추가(sendRequest 패턴).
  // 한도 소진(needsReason): 토스트 없이 그대로 반환 — 패널이 사유 입력 모드로 전환해 안내한다.
  const adjustStartPoint = async (
    materialType: ProgressMaterialType,
    materialId: string,
    newValue: number,
    reason?: string,
  ): Promise<{ ok: boolean; auto?: boolean; needsReason?: boolean; threshold?: number }> => {
    try {
      const res = await fetch('/api/student/progress/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, newValue, ...(reason ? { reason } : {}) }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        if (json.auto && json.data) {
          setStudent((prev) => (prev
            ? {
                ...prev,
                subjects: json.data.subjects ?? prev.subjects,
                books: json.data.books ?? prev.books,
                lectures: json.data.lectures ?? prev.lectures,
                updatedAt: json.data.updatedAt ?? prev.updatedAt,
              }
            : prev));
          toast.success('시작점을 옮겼어요. 오늘 계획도 다시 맞춰뒀어요.');
          return { ok: true, auto: true };
        }
        if (json.request) {
          setStudent((prev) => (prev ? { ...prev, changeRequests: [json.request, ...(prev.changeRequests || [])] } : prev));
        }
        toast.success('신청을 보냈어요! 관리자 확인 후 반영돼요.');
        return { ok: true, auto: false };
      }
      if (json?.needsReason) {
        // 에러 토스트 대신 패널 내 안내 — 사유 입력 모드 전환은 StartPointAdjustPanel 몫.
        return { ok: false, needsReason: true, threshold: typeof json.threshold === 'number' ? json.threshold : undefined };
      }
      toast.error(json?.message || '시작점 조정에 실패했어요. 다시 시도해 주세요.');
      return { ok: false };
    } catch {
      toast.error('네트워크 오류로 조정하지 못했어요. 다시 시도해 주세요.');
      return { ok: false };
    }
  };

  // 기간 목표(모드 B) 누적 진행량 입력 — deadline plan 의 actualAmount 를 갱신하고
  // 자료 current(currentPage/completedLectures)를 parsePlanBounds 기준으로 best-effort 동기화.
  // 저장은 전용 progress API(deadlineAmount)를 재사용. 낙관적 갱신은 서버 응답값으로 확정.
  const updateDeadlineProgress = async (
    materialType: ProgressMaterialType,
    materialId: string,
    planId: string,
    amount: number,
  ): Promise<boolean> => {
    const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, planId, deadlineAmount: safeAmount }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        applyDeadlineProgressPatch(
          materialType,
          materialId,
          planId,
          typeof json.actualAmount === 'number' ? json.actualAmount : safeAmount,
          Boolean(json.isCompleted),
          typeof json.value === 'number' ? json.value : undefined,
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // 저장 promise 를 반환한다 — 오답노트 탭의 낙관적 스테퍼가 저장 완료 시점을 알아야 연속 탭을 정확히 반영한다.
  const incrementBookIncorrectTag = (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined): Promise<boolean> => {
    const nextTags = { ...(currentTags || {}) };
    nextTags[tagKey] = (nextTags[tagKey] || 0) + 1;
    return saveProgressPatch('book', materialId, { incorrectTags: nextTags });
  };

  // 오답노트 태그 카운트를 정확한 값으로 수정(잘못 누른 것 되돌리기·직접 조정). 0 이하는 0으로.
  const setBookIncorrectTag = (materialId: string, tagKey: string, nextCount: number, currentTags: Record<string, number> | undefined): Promise<boolean> => {
    const nextTags = { ...(currentTags || {}) };
    nextTags[tagKey] = Math.max(0, Math.round(nextCount));
    return saveProgressPatch('book', materialId, { incorrectTags: nextTags });
  };

  const submitChecklist = async (e: React.FormEvent, isEdit = false): Promise<boolean> => {
    e.preventDefault();
    setChecklistSubmitting(true);
    try {
      const res = await fetch('/api/student/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleepHours: checklistForm.sleepHours,
          phoneStatus: checklistForm.phoneStatus,
          phoneSubmitted: checklistForm.phoneStatus === 'submitted',
          phoneReason: checklistForm.phoneReason,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        mutationSeqRef.current += 1;
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 5000);
        } else {
          toast.success(isEdit ? '아침 점검 기록을 수정했어요.' : '오늘 컨디션을 기록했어요.');
        }
        return true;
      } else {
        toast.error(json?.message || '기록에 실패했어요. 다시 시도해 주세요.');
        return false;
      }
    } catch {
      // 네트워크 실패 — 입력한 폼 값은 그대로 남아 있어 재시도 가능
      toast.error('네트워크 오류로 기록하지 못했어요. 다시 시도해 주세요.');
      return false;
    } finally {
      setChecklistSubmitting(false);
    }
  };

  const sendRequest = async (
    requestType: string,
    rawMessage: string,
    proposedGoal?: ProposedGoal,
    proposedMaterial?: ProposedMaterial,
    proposedMakeup?: { materialId: string; materialType: 'book' | 'lecture'; done: number },
  ) => {
    const message = (rawMessage || '').trim();
    if (!message) {
      setRequestError('신청 내용을 입력해 주세요.');
      return;
    }
    setRequestError('');
    setRequestSubmitting(true);
    try {
      const res = await fetch('/api/student/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType, message, proposedGoal, proposedMaterial, proposedMakeup }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, changeRequests: [json.request, ...(prev.changeRequests || [])] } : prev));
        setRequestForm({
          requestType: 'progress',
          message: '',
          materialId: '',
          materialType: 'book',
          goalType: 'deadlineWeeks',
          goalValue: '',
          targetDate: '',
          studyDays: [],
          currentProgress: '',
          proposedWeekNumber: '',
          proposedRangeText: '',
          speedMultiplier: '1.0',
          currentGoalSnapshot: null,
        });
        setRequestCustomOpen(false);
        toast.success('신청이 접수되었어요.', { description: '코멘터 확인 후 알림으로 결과를 알려드릴게요.' });
      } else {
        setRequestError(json.message || '신청에 실패했습니다.');
        toast.error(json.message || '신청에 실패했어요.');
      }
    } catch {
      setRequestError('네트워크 오류가 발생했습니다.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const cancelRequest = async (id: string) => {
    if (!(await confirm({ title: '이 신청을 취소할까요?', tone: 'danger', confirmText: '신청 취소' }))) return;
    try {
      const res = await fetch(`/api/student/requests?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, changeRequests: (prev.changeRequests || []).filter((r) => r.id !== id) } : prev));
        toast.success('신청을 취소했어요.');
      } else {
        toast.error(json?.message || '신청 취소에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 취소하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const submitLeave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (leaveSubmitting) return;
    if (!leaveForm.date) {
      setLeaveError('사용 희망일을 선택해 주세요.');
      return;
    }
    setLeaveError('');

    const isHalfday = leaveForm.type === 'morning' || leaveForm.type === 'afternoon' || leaveForm.type === 'night';
    let urgent = false;
    if (isHalfday) {
      const targetDate = new Date(`${leaveForm.date}T00:00:00+09:00`);
      const deadline = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
      deadline.setHours(18, 0, 0, 0);
      const now = new Date();
      if (now.getTime() > deadline.getTime()) {
        urgent = true;
        const ok = await confirm({
          title: '긴급 반차로 신청할까요?',
          description:
            '반차는 사용 전날 18:00까지 신청하는 게 원칙이에요. 당일 등 급하게 신청하는 경우는 긴급한 상황에만 사용해 주세요.',
          confirmText: '긴급 신청',
        });
        if (!ok) return;
      }
    }

    setLeaveSubmitting(true);
    try {
      const res = await fetch('/api/student/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: leaveForm.type, slot: leaveForm.slot, date: leaveForm.date, reason: leaveForm.reason, urgent }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, leaveRequests: [json.request, ...(prev.leaveRequests || [])] } : prev));
        setLeaveForm((f) => ({ ...f, reason: '' }));
        // 반차 자동 승인 시 즉시 안내 — 학생이 '자동 승인됨'을 바로 인지하도록
        if (json.request?.autoApproved) {
          toast.success(`${json.request.date} 반차가 자동 승인되었어요.`, { description: '신청 내역에서 확인할 수 있어요.' });
        } else {
          toast.success('신청이 접수되었어요.', { description: '코멘터 확인 후 알림으로 결과를 알려드릴게요.' });
        }
      } else {
        setLeaveError(json.message || '신청에 실패했습니다.');
        toast.error(json.message || '신청에 실패했어요.');
      }
    } catch {
      setLeaveError('네트워크 오류가 발생했습니다.');
    } finally {
      setLeaveSubmitting(false);
    }
  };
  
  const cancelLeave = async (id: string) => {
    if (!(await confirm({ title: '이 휴가 신청을 취소할까요?', tone: 'danger', confirmText: '신청 취소' }))) return;
    try {
      const res = await fetch(`/api/student/leave?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, leaveRequests: (prev.leaveRequests || []).filter((r) => r.id !== id) } : prev));
        toast.success('신청을 취소했어요.');
      } else {
        toast.error(json?.message || '휴가 신청 취소에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 취소하지 못했어요. 다시 시도해 주세요.');
    }
  };

  // 반려된 휴가 신청에 대해 추가 메시지와 함께 재승인 요청 — 다시 '대기중'으로 전환
  const reappealLeave = async (id: string, note: string) => {
    try {
      const res = await fetch('/api/student/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reappealId: id, reason: note }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.request) {
        const updated = json.request as LeaveRequest;
        setStudent((prev) => (prev ? { ...prev, leaveRequests: (prev.leaveRequests || []).map((r) => (r.id === id ? updated : r)) } : prev));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const submitSuggestion = async () => {
    const message = suggestionMessage.trim();
    if (!message) {
      setSuggestionError('건의 내용을 입력해 주세요.');
      return;
    }
    setSuggestionError('');
    setSuggestionSubmitting(true);
    try {
      const res = await fetch('/api/student/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, message }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, suggestionRequests: [json.suggestion as ConsultationLog, ...(prev.suggestionRequests || [])] } : prev));
        setSuggestionMessage('');
        toast.success('건의가 접수되었어요.', { description: '코멘터 확인 후 알림으로 답변드릴게요.' });
      } else {
        setSuggestionError(json.message || '건의사항 등록에 실패했습니다.');
        toast.error(json.message || '건의 등록에 실패했어요.');
      }
    } catch {
      setSuggestionError('네트워크 오류가 발생했습니다.');
    } finally {
      setSuggestionSubmitting(false);
    }
  };

  const cancelSuggestion = async (id: string) => {
    if (!(await confirm({ title: '이 건의를 취소할까요?', tone: 'danger', confirmText: '건의 취소' }))) return;
    try {
      const res = await fetch(`/api/student/suggestions?id=${encodeURIComponent(id)}&studentId=${encodeURIComponent(studentId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, suggestionRequests: (prev.suggestionRequests || []).filter((r) => r.id !== id) } : prev));
        toast.success('건의를 취소했어요.');
      } else {
        toast.error(json?.message || '건의 취소에 실패했어요. 다시 시도해 주세요.');
      }
    } catch {
      toast.error('네트워크 오류로 취소하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const handleSwipeStart = (e: React.TouchEvent) => {
    let node = e.target as HTMLElement | null;
    while (node && node !== e.currentTarget) {
      if (node.scrollWidth > node.clientWidth + 4) {
        const ox = window.getComputedStyle(node).overflowX;
        if (ox === 'auto' || ox === 'scroll') { setSwipeStart(null); return; }
      }
      node = node.parentElement;
    }
    const t = e.touches[0];
    setSwipeStart({ x: t.clientX, y: t.clientY });
  };

  const goAdjacentTab = (dir: number) => {
    const idx = tabIds.indexOf(activeTab);
    if (idx === -1) return;
    const next = Math.min(tabIds.length - 1, Math.max(0, idx + dir));
    if (next !== idx) {
      slideDirRef.current = dir;
      setActiveTab(tabIds[next]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeStart;
    setSwipeStart(null);
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      goAdjacentTab(dx < 0 ? 1 : -1);
    }
  };

  // ─── useMemo: 고비용 파생 연산 (Rules of Hooks — 조건부 return 이전) ──────

  const chartData = useMemo(
    () => getGradeChartData(student?.grades ?? []),
    [student?.grades],
  );

  const gradeSubjects = useMemo(
    () => getGradeSubjects(student?.grades ?? []),
    [student?.grades],
  );

  // 30 초 폴링으로 갱신되는 homeAttendNow 를 dep 으로 삼아 30 초마다만 재계산
  const kstNow = useMemo(() => getKstNowParts(homeAttendNow), [homeAttendNow]);

  const weeklyDailyPlans = useMemo(() => {
    if (!student) return [];
    const _today = new Date();
    _today.setHours(0, 0, 0, 0);
    const _weekStart = new Date(_today);
    _weekStart.setDate(_today.getDate() - _today.getDay());

    // 오늘 계획 슬롯 제외용 — 일회성 휴가(날짜별 면제)·정기 외출(요일별 상실 슬롯).
    // 슬롯(오전/오후/야간)이 지정된 계획만 제외한다. studyTime 미지정 계획은 제외하지 않음(사용자 규칙).
    const _leaveExemptions = getLeaveExemptions(student);
    const _awayImpact = getAwayImpactSlots(student.awaySchedules, formatDateKey(_today));

    return Array.from({ length: visiblePlanWeeks }, (_, weekOffset) => {
      const start = new Date(_weekStart);
      start.setDate(_weekStart.getDate() + weekOffset * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const days = Array.from({ length: 7 }, (_, dayIndex) => {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + dayIndex);
        const dateKey = formatDateKey(currentDate);
        const day = WEEK_DAY_SLOTS_BY_DATE[currentDate.getDay()];

        // 요일 판정은 과목이 아니라 자료별로 한다 — 자료별 요일이 있으면 그걸, 없으면 과목 요일 폴백.
        // (자료 요일 미설정 시 과목 요일과 동일해 기존 동작과 100% 일치)
        const isMaterialOnDay = (materialStudyDays?: string[], subjectStudyDays?: string[]) => {
          const ds = getMaterialStudyDays(subjectStudyDays, materialStudyDays) || [];
          return ds.length === 0 || ds.includes(day.key);
        };
        const entries = (student.subjects || [])
          .sort((a, b) => {
            const timeDiff = STUDY_TIME_ORDER[a.studyTime || ''] - STUDY_TIME_ORDER[b.studyTime || ''];
            return timeDiff || a.name.localeCompare(b.name);
          })
          .flatMap((subject) => {
            const lectures = (subject.lectures || [])
              .filter((lecture) => isMaterialOnDay(lecture.studyDays, subject.studyDays))
              .flatMap((lecture) =>
              (lecture.detailedPlans || [])
                .filter((plan) => !plan.periodType && isPlanActiveOnDate(plan, dateKey))
                .map((plan) => {
                  const dailyCompletion = getPlanDailyCompletion(plan, dateKey);
                  return {
                    id: `${dateKey}_${subject.id}_${lecture.id}_${plan.id}`,
                    dateKey,
                    subject: subject.name,
                    title: lecture.name,
                    type: '강의',
                    materialType: 'lecture' as const,
                    materialId: lecture.id,
                    planId: plan.id,
                    isCompleted: dailyCompletion.isCompleted,
                    actualAmount: dailyCompletion.actualAmount,
                    studyTime: subject.studyTime || '',
                    // 자료별 학생 지정 슬롯 — 오늘 할 일에서 교시 배치 select 값. 없으면 '' (과목 슬롯/자동배치로 표시).
                    studySlot: lecture.studySlot || '',
                    rangeText: plan.rangeText,
                    dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
                    dailyLabel: getDailyAmountLabel(plan),
                  };
                })
            );
            const books = (subject.books || [])
              .filter((book) => isMaterialOnDay(book.studyDays, subject.studyDays))
              .flatMap((book) =>
              (book.detailedPlans || [])
                .filter((plan) => !plan.periodType && isPlanActiveOnDate(plan, dateKey))
                .map((plan) => {
                  const dailyCompletion = getPlanDailyCompletion(plan, dateKey);
                  return {
                    id: `${dateKey}_${subject.id}_${book.id}_${plan.id}`,
                    dateKey,
                    subject: subject.name,
                    title: book.title,
                    type: '교재',
                    materialType: 'book' as const,
                    materialId: book.id,
                    planId: plan.id,
                    isCompleted: dailyCompletion.isCompleted,
                    actualAmount: dailyCompletion.actualAmount,
                    studyTime: subject.studyTime || '',
                    // 자료별 학생 지정 슬롯 — 오늘 할 일에서 교시 배치 select 값. 없으면 '' (과목 슬롯/자동배치로 표시).
                    studySlot: book.studySlot || '',
                    rangeText: plan.rangeText,
                    dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
                    dailyLabel: getDailyAmountLabel(plan),
                  };
                })
            );
            return [...lectures, ...books];
          });

        // 이 날 휴가/외출로 비는 슬롯 — 슬롯 지정 계획만 제외(미지정은 유지).
        const coveredSlots = new Set<string>();
        const lx = _leaveExemptions.get(dateKey);
        if (lx) {
          if (lx.full) { coveredSlots.add('morning'); coveredSlots.add('afternoon'); coveredSlots.add('night'); }
          else lx.slots.forEach((s) => coveredSlots.add(s));
        }
        _awayImpact.get(day.key as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')?.forEach((s) => coveredSlots.add(s));
        const visibleEntries = entries.filter((entry) => !(entry.studyTime && coveredSlots.has(entry.studyTime)));

        return { key: day.key, label: day.label, dateKey, dateLabel: formatShortDate(currentDate), entries: visibleEntries };
      });

      return {
        weekNumber: weekOffset + 1,
        rangeLabel: `${formatShortDate(start)} ~ ${formatShortDate(end)}`,
        startDate: formatDateKey(start),
        endDate: formatDateKey(end),
        days,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.subjects, student?.leaveRequests, student?.awaySchedules, visiblePlanWeeks]);

  // 기간 목표(모드 B) — deadline plan 을 서버(missions-hub)와 동일 소스로 파생.
  const deadlineDerivation = useMemo(() => {
    if (!student) return { deadlineGoals: [], deadlineSummary: null };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return deriveDeadlineGoals(student, now, formatDateKey(now));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.subjects]);

  // 자율 입력(selfPaced) 자료 — detailedPlans 가 없어 오늘 할 일/시간표에 안 뜬다.
  // 오늘이 그 자료의 학습요일이면 홈·시간표에 "자율 학습"으로 노출한다(완료 카운트 무영향).
  const todaySelfPacedItems = useMemo(() => {
    if (!student) return [] as Array<{
      id: string; subject: string; title: string; materialType: 'book' | 'lecture';
      materialId: string; unit: string; current: number; studyTime: string; loggedToday: boolean;
    }>;
    const todayKey = getSeoulDateKey();
    // getSeoulDateKey 는 'ko-KR' → 요일 판정용 요일키가 필요하므로 별도 산출(en-US short → sun/mon...)
    const wk = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(new Date());
    const dayKey = WEEKDAY_KEY_MAP[wk] || 'mon';
    // 학습요일: 자료/과목 요일 union. 지정 없으면 월~토(일 제외) 기본.
    const isOnToday = (subjectDays?: string[], materialDays?: string[]) => {
      const ds = getMaterialStudyDays(subjectDays, materialDays) || [];
      if (ds.length === 0) return dayKey !== 'sun';
      return ds.includes(dayKey);
    };
    return (student.subjects || []).flatMap((subject) => {
      // 시간표 노출은 자료별 학생 지정 슬롯(studySlot)이 단독 결정. 과목 studyTime 상속 제거.
      const books = (subject.books || [])
        .filter((b) => b.goalType === 'selfPaced' && isOnToday(subject.studyDays, b.studyDays))
        .map((b) => ({
          id: `selfpaced_${subject.id}_${b.id}`,
          subject: subject.name,
          title: b.title,
          materialType: 'book' as const,
          materialId: b.id,
          unit: b.unit || 'p',
          current: b.currentPage || 0,
          studyTime: b.studySlot || '',
          loggedToday: !!b.inputLog?.includes(todayKey),
        }));
      const lectures = (subject.lectures || [])
        .filter((l) => l.goalType === 'selfPaced' && isOnToday(subject.studyDays, l.studyDays))
        .map((l) => ({
          id: `selfpaced_${subject.id}_${l.id}`,
          subject: subject.name,
          title: l.name,
          materialType: 'lecture' as const,
          materialId: l.id,
          unit: '강',
          current: l.completedLectures || 0,
          studyTime: l.studySlot || '',
          loggedToday: !!l.inputLog?.includes(todayKey),
        }));
      return [...books, ...lectures];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.subjects]);

  // 오늘 계획 자동 배치(Phase 1) — 미지정 자료도 빈 교시에 배정해 "시간표처럼" 노출.
  // 타임테이블(교시별 렌더)과 홈 '오늘 할 일'(배정 교시 라벨)이 공유하는 단일 소스.
  // 훅 순서 규칙상 아래 `if (!student)` early-return 앞에 둔다(날짜 키는 내부에서 산출).
  const todaySchedule = useMemo(() => {
    if (!student) return new Map<string, AssignedScheduleItem[]>();
    const _today = new Date();
    _today.setHours(0, 0, 0, 0);
    const dateKey = formatDateKey(_today);
    const dayKey = WEEK_DAY_SLOTS_BY_DATE[_today.getDay()].key;
    const items = getTodayScheduleItems(student, dateKey, dayKey);
    const blocked = getBlockedPeriodKeys(student, dateKey, dayKey);
    return assignItemsToPeriods(items, blocked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.subjects, student?.leaveRequests, student?.awaySchedules]);

  // 홈 '오늘 할 일' 항목 id → 배정 교시 라벨('3교시'). '미지정' 대체 표시용.
  // + 항목 id → 교시 순위(정렬용). p0=0 … p8=8, 미배정=99.
  const PERIOD_ORDER = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const scheduledSlotLabels = useMemo(() => {
    const rec: Record<string, string> = {};
    todaySchedule.forEach((items) => {
      items.forEach((it) => {
        const label = getPeriodNumLabel(it.periodKey);
        // 시:분 슬롯은 여러 교시에 걸칠 수 있음 — 첫 배정 교시를 대표 라벨로(마지막 덮어쓰기 방지).
        if (label && !rec[it.id]) rec[it.id] = label;
      });
    });
    return rec;
  }, [todaySchedule]);

  // 항목 id → 배정 교시 순위(홈 '오늘 할 일' 교시순 정렬용).
  const scheduledPeriodRank = useMemo(() => {
    const rec: Record<string, number> = {};
    todaySchedule.forEach((items, periodKey) => {
      const rank = PERIOD_ORDER.indexOf(periodKey);
      // 여러 교시에 걸친 항목은 가장 이른 교시 기준으로 정렬한다.
      items.forEach((it) => {
        const next = rank < 0 ? 99 : rank;
        if (!(it.id in rec) || next < rec[it.id]) rec[it.id] = next;
      });
    });
    return rec;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaySchedule]);

  // ────────────────────────────────────────────────────────────────────────────

  // ---------------- 데이터 가공 연산들 ----------------
  if (!student) {
    return {
      loading,
      error,
      student,
      shareTokenParam,
      sharePasswordInput,
      setSharePasswordInput,
      sharePasswordError,
      setSharePasswordError,
      sharePasswordVerified,
      sharePasswordChecking,
      handleSharePasswordSubmit,
      isStudentReport,
      isParentReport,
      mounted,
    } as any;
  }

  // chartData, gradeSubjects, kstNow, weeklyDailyPlans 는 위의 useMemo 에서 계산됨

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // 모든 detailedPlans 의 endDate 를 모으되, 가장 늦은(=계획이 가장 늦게 끝나는) 자료가
  // 어느 과목/교재(or 강의)인지도 함께 잡아둔다 → "왜 상담 예정인지" 안내에 사용.
  type EndDateSource = { endDate: string; subjectName: string; materialTitle: string; type: 'book' | 'lecture' };
  const allEndDateSources: EndDateSource[] = (student.subjects || []).flatMap(sub => [
    ...(sub.books || []).flatMap(b => (b.detailedPlans || []).map(p => ({
      endDate: p.endDate, subjectName: sub.name, materialTitle: b.title, type: 'book' as const,
    }))),
    ...(sub.lectures || []).flatMap(l => (l.detailedPlans || []).map(p => ({
      endDate: p.endDate, subjectName: sub.name, materialTitle: l.name, type: 'lecture' as const,
    }))),
  ]);

  const latestEndDateSource = allEndDateSources.length > 0
    ? allEndDateSources.reduce((max, cur) => (cur.endDate > max.endDate ? cur : max), allEndDateSources[0])
    : null;

  const finishDateStr = latestEndDateSource ? latestEndDateSource.endDate : null;

  // 학생 상담 패널용: 가장 늦게 끝나는 학습 계획의 과목/자료 정보 (없으면 null)
  const whyConsultation = latestEndDateSource
    ? {
        subjectName: latestEndDateSource.subjectName,
        materialTitle: latestEndDateSource.materialTitle,
        type: latestEndDateSource.type,
        planEndDate: latestEndDateSource.endDate,
      }
    : null;

  let nextConsultationText = '추후 안내';
  if (finishDateStr) {
    const finishDate = new Date(finishDateStr);
    const startDate = new Date(finishDate);
    startDate.setDate(finishDate.getDate() - 7);

    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    nextConsultationText = `${formatDate(startDate)} ~ ${finishDateStr} 예정`;
  }

  // 모듈 스코프 상수 참조: WEEK_DAY_SLOTS, WEEK_DAY_SLOTS_BY_DATE, STUDY_TIME_ORDER, STUDY_TIME_LABELS
  // 모듈 스코프 함수 참조: formatDateKey, formatShortDate, getDailyAmountLabel, toMinutes, getKstNowParts

  const currentMinutes = kstNow.hour * 60 + kstNow.minute;
  const currentPeriod = ACADEMY_TIMETABLE.find((period) => {
    const start = toMinutes(period.start);
    const end = toMinutes(period.end);
    return start <= currentMinutes && currentMinutes < end;
  });
  const currentStudyTimeKey = currentPeriod?.studyTime || '';
  const todayDayKey = WEEKDAY_KEY_MAP[kstNow.weekday] || 'mon';

  // 지금 교시에 배정된 인강이 있으면 "강의 수강 중" — 집중(뽀모도로) 탭 자동 전체화면 여부 판정에 사용.
  const isLectureTime = !!(currentPeriod?.periodKey && todaySchedule.get(currentPeriod.periodKey)?.some(
    (item) => item.materialType === 'lecture' && !item.isCompleted,
  ));
  
  // 과목이 "오늘 학습 대상"인지 판정 — 자료별 요일을 union 으로 반영한다.
  // 과목 요일 또는 그 과목의 어떤 자료 요일이라도 오늘을 포함하면 오늘 대상.
  // (자료 요일 미설정 시 과목 요일 폴백이라 기존 동작과 동일)
  const subjectMatchesToday = (subject: SubjectProgress) => {
    const materials = [...(subject.books || []), ...(subject.lectures || [])];
    if (materials.length === 0) {
      const subjectDays = subject.studyDays || [];
      return subjectDays.length === 0 || subjectDays.includes(todayDayKey);
    }
    return materials.some((m) => {
      const ds = getMaterialStudyDays(subject.studyDays, m.studyDays) || [];
      return ds.length === 0 || ds.includes(todayDayKey);
    });
  };

  const todaySubjects = (student.subjects || []).filter(subjectMatchesToday);

  const currentSubjects = (student.subjects || []).filter((subject) =>
    subjectMatchesToday(subject) && (subject.studyTime || '') === currentStudyTimeKey,
  );

  const nonStudyPeriodLabel = currentPeriod && !currentPeriod.studyTime ? currentPeriod.label : '';
  const timeGreeting = kstNow.hour < 6
    ? '늦은 밤까지 애쓰고 있네요'
    : kstNow.hour < 12
      ? '좋은 아침이에요'
      : kstNow.hour < 18
        ? '좋은 오후예요'
        : '좋은 저녁이에요';
  
  const hasCurrentSubjects = currentSubjects.length > 0;
  const currentSubjectText = hasCurrentSubjects
    ? currentSubjects.map((subject) => subject.name).join(' · ')
    : currentStudyTimeKey
      ? '자율 학습'
      : nonStudyPeriodLabel || '운영 시간 외';
  
  const offHoursPhrase = kstNow.hour < 6
    ? '오늘도 푹 쉬고 내일 또 만나요'
    : kstNow.hour < 12
      ? '오늘 하루도 힘차게 시작해봐요'
      : kstNow.hour < 18
        ? '잠깐 쉬어가는 시간이에요'
        : '오늘도 충분히 잘했어요';
        
  const currentBriefingPhrase = hasCurrentSubjects
    ? `지금은 ${currentSubjectText} 시간이에요`
    : currentStudyTimeKey
      ? `지금은 ${STUDY_TIME_LABELS[currentStudyTimeKey]} 자율 학습 시간이에요`
      : offHoursPhrase;
      
  const briefingContext = hasCurrentSubjects
    ? 'studying'
    : currentStudyTimeKey
      ? 'selfStudy'
      : kstNow.hour < 6
        ? 'night'
        : kstNow.hour < 12
          ? 'morning'
          : kstNow.hour < 18
            ? 'afternoon'
            : 'evening';
  const briefingPool = BRIEFING_MESSAGES[briefingContext];
  const briefingSeed = `${todayDayKey}-${kstNow.hour}-${studentId}`
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const briefingSubMessage = briefingPool[briefingSeed % briefingPool.length];
  const currentStudyLabel = currentStudyTimeKey
    ? STUDY_TIME_LABELS[currentStudyTimeKey]
    : nonStudyPeriodLabel || '운영 시간 외';

  const thisMonthLeaveUsage = isStudentReport ? getMonthlyLeaveUsage(student.leaveRequests || [], kstYearMonth()) : null;
  // 교환 추가권(반차권/휴식권) 잔여를 기본 잔여에 합산
  const homeLeaveCredits = isStudentReport ? getLeaveCredits(student.rewardRedemptions, student.leaveRequests) : { halfday: 0, fullday: 0 };
  const homeHalfLeft = (thisMonthLeaveUsage ? Math.max(0, MONTHLY_HALFDAY_QUOTA - thisMonthLeaveUsage.halfday) : MONTHLY_HALFDAY_QUOTA) + homeLeaveCredits.halfday;
  const homeFullLeft = (thisMonthLeaveUsage ? Math.max(0, MONTHLY_FULLDAY_QUOTA - thisMonthLeaveUsage.fullday) : MONTHLY_FULLDAY_QUOTA) + homeLeaveCredits.fullday;
  const homeLeaveCoupons = isStudentReport ? (student.leaveCoupons ?? 0) : 0;
  
  const homeElapsedMin = homeAttend.checkedIn && homeAttend.sinceToday && homeAttend.since && homeAttendNow > 0
    ? Math.max(0, Math.floor((homeAttendNow - new Date(homeAttend.since).getTime()) / 60_000))
    : 0;
  
  const homePomodoroMin = parseSpecialNoteObj(student.specialNote).pomodoro_minutes?.[getSeoulDateKey()] || 0;
  const homeTotalMin = homeAttend.todayMinutes + homeElapsedMin + homePomodoroMin;

  // weeklyDailyPlans 는 위의 useMemo 로 계산됨

  const todayDateKey = formatDateKey(today);
  const todayDailyPlan = weeklyDailyPlans
    .flatMap((week) => week.days)
    .find((day) => day.dateKey === todayDateKey);
  // 배정 교시 순서로 정렬(0교시→심야). 교시 미배정은 뒤로, 동순위는 기존 순서 유지(안정 정렬).
  const todayPlanEntries = [...(todayDailyPlan?.entries || [])].sort(
    (a, b) => (scheduledPeriodRank[a.id] ?? 99) - (scheduledPeriodRank[b.id] ?? 99),
  );

  // formatNotificationDate, truncateNotificationText, parseDateOnly 는 모듈 스코프 함수

  const weekStartKey = formatDateKey(weekStart);
  const weekEndKey = formatDateKey(weekEnd);
  const hasGradeThisWeek = (student.grades || []).some((grade) => {
    const date = grade.date || '';
    return weekStartKey <= date && date <= weekEndKey;
  });
  const enrollmentEndDate = parseDateOnly(student.enrollmentEndDate);
  const daysUntilEnrollmentEnd = enrollmentEndDate
    ? Math.ceil((enrollmentEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isEnrollmentExpiredLocked = isStudentReport && daysUntilEnrollmentEnd !== null && daysUntilEnrollmentEnd < -3;
  const showEnrollmentWarning = isStudentReport && daysUntilEnrollmentEnd !== null && daysUntilEnrollmentEnd >= -3 && daysUntilEnrollmentEnd < 0;

  const requestNotifications = (student.changeRequests || []).map((request) => {
    const requestLabel = getRequestTypeLabel(request.requestType);
    const notificationDate = request.repliedAt || request.resolvedAt || request.createdAt || request.date;

    const requestConvo = buildDisplayThread({
      headText: request.content || '',
      headAt: request.createdAt,
      adminReply: request.adminReply,
      repliedAt: request.repliedAt,
      thread: request.thread,
    }).slice(1);

    if (request.adminReply || (request.thread && request.thread.length > 0)) {
      return {
        id: `request-reply-${request.id}-${lastAdminReplyAt(request.thread, request.repliedAt)}`,
        tone: 'blue' as const,
        label: '답변 도착',
        title: `${requestLabel}에 답변이 도착했어요`,
        body: request.adminReply || '',
        meta: truncateNotificationText(request.content || ''),
        date: notificationDate,
        priority: 1,
        thread: requestConvo,
        replyKind: 'request' as const,
        replyId: request.id,
      };
    }

    if (request.status === 'resolved') {
      return {
        id: `request-resolved-${request.id}`,
        tone: 'emerald' as const,
        label: '처리완료',
        title: `${requestLabel}이 처리완료됐어요`,
        body: '담당 코멘터가 신청을 확인하고 처리했습니다.',
        meta: truncateNotificationText(request.content || ''),
        date: notificationDate,
        priority: 3,
        thread: requestConvo,
        replyKind: 'request' as const,
        replyId: request.id,
      };
    }

    return {
      id: `request-pending-${request.id}`,
      tone: 'amber' as const,
      label: '확인 대기',
      title: `${requestLabel} 확인을 기다리고 있어요`,
      body: '담당 코멘터가 확인하면 이 알림 영역에서 바로 볼 수 있어요.',
      meta: truncateNotificationText(request.content || ''),
      date: notificationDate,
      priority: 4,
    };
  });

  const suggestionNotifications = (student.suggestionRequests || []).map((suggestion) => {
    const notificationDate = suggestion.repliedAt || suggestion.resolvedAt || suggestion.createdAt || suggestion.date;

    const suggestionConvo = buildDisplayThread({
      headText: suggestion.content || '',
      headAt: suggestion.createdAt,
      adminReply: suggestion.adminReply,
      repliedAt: suggestion.repliedAt,
      thread: suggestion.thread,
    }).slice(1);

    if (suggestion.adminReply || (suggestion.thread && suggestion.thread.length > 0)) {
      return {
        id: `suggestion-reply-${suggestion.id}-${lastAdminReplyAt(suggestion.thread, suggestion.repliedAt)}`,
        tone: 'blue' as const,
        label: '건의 답변',
        title: '건의사항에 답변이 도착했어요',
        body: suggestion.adminReply || '',
        meta: truncateNotificationText(suggestion.content || ''),
        date: notificationDate,
        priority: 1,
        thread: suggestionConvo,
        replyKind: 'suggestion' as const,
        replyId: suggestion.id,
      };
    }

    if (suggestion.status === 'resolved') {
      return {
        id: `suggestion-resolved-${suggestion.id}`,
        tone: 'emerald' as const,
        label: '처리완료',
        title: '건의사항이 처리완료됐어요',
        body: '담당 코멘터가 건의사항을 확인하고 처리했습니다.',
        meta: truncateNotificationText(suggestion.content || ''),
        date: notificationDate,
        priority: 3,
        thread: suggestionConvo,
        replyKind: 'suggestion' as const,
        replyId: suggestion.id,
      };
    }

    return {
      id: `suggestion-pending-${suggestion.id}`,
      tone: 'amber' as const,
      label: '확인 대기',
      title: '건의사항 확인을 기다리고 있어요',
      body: '담당 코멘터가 확인하면 이 알림 영역에서 바로 볼 수 있어요.',
      meta: truncateNotificationText(suggestion.content || ''),
      date: notificationDate,
      priority: 4,
    };
  });

  // 휴가/반차 신청에 코멘터 답변(또는 양방향 대화)이 달린 건 — 알림 영역에서 대화·재답장 노출.
  // 답변/스레드가 없는 신청은 전용 휴가 화면에서만 다루므로 알림 중복을 피해 제외한다.
  const leaveNotifications = (student.leaveRequests || [])
    .filter((leave) => leave.adminReply || (leave.thread && leave.thread.length > 0))
    .map((leave) => {
      const leaveLabel = formatLeaveLabel(leave.type, leave.slot);
      const notificationDate = leave.repliedAt || leave.reviewedAt || leave.createdAt || leave.date;
      const leaveConvo = buildDisplayThread({
        headText: leave.reason || leaveLabel,
        headAt: leave.createdAt,
        adminReply: leave.adminReply,
        repliedAt: leave.repliedAt || leave.reviewedAt,
        thread: leave.thread,
      }).slice(1);

      return {
        id: `leave-reply-${leave.id}-${lastAdminReplyAt(leave.thread, leave.repliedAt || leave.reviewedAt)}`,
        tone: 'blue' as const,
        label: '휴가 답변',
        title: `${leaveLabel} 신청에 답변이 도착했어요`,
        body: leave.adminReply || '',
        meta: truncateNotificationText(leave.reason || leaveLabel),
        date: notificationDate,
        priority: 1,
        thread: leaveConvo,
        replyKind: 'leave' as const,
        replyId: leave.id,
      };
    });

  // 자리이동 신청 — 학생이 확인해야 할 상태변화(승인/반려)만 알림으로. 대기 중 건은 신청 화면(SeatMoveCard)에서 다룬다.
  // id 에 processedAt(처리 시각)을 포함해, 확인(dismiss) 후 다시 처리되면(재신청→재처리) 새 알림으로 재노출된다.
  const seatMoveNotifications = (student.seatMoveRequests || [])
    .filter((r) => r.status === 'approved' || r.status === 'rejected')
    .map((r) => {
      const seatPath = `${r.fromSeat != null ? `${r.fromSeat}번` : '미배정'} → ${r.toSeat}번`;
      if (r.status === 'approved') {
        return {
          id: `seat-move-approved-${r.id}-${r.processedAt || ''}`,
          tone: 'emerald' as const,
          label: '자리이동 승인',
          title: '자리이동 신청이 승인됐어요',
          body: `${seatPath} 자리로 옮겨졌어요. 새 자리에서 학습을 이어가 주세요.`,
          date: r.processedAt || r.createdAt,
          priority: 2,
        };
      }
      return {
        id: `seat-move-rejected-${r.id}-${r.processedAt || ''}`,
        tone: 'red' as const,
        label: '자리이동 반려',
        title: '자리이동 신청이 반려됐어요',
        body: `${seatPath} 신청이 반려됐어요.${r.rejectReason ? `\n사유: ${r.rejectReason}` : ''}\n자리이동 탭에서 다른 자리로 다시 신청할 수 있어요.`,
        date: r.processedAt || r.createdAt,
        priority: 1,
      };
    });

  // 상담 결과/취소 알림은 최근 14일 이내만 노출(오래된 히스토리 홍수 방지).
  const recentConsultationCutoffKey = formatDateKey(new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000));
  const consultationHistoryEntries = ((student as any).consultationHistory as Array<{
    id: string; date: string; slot: string; status: 'done' | 'noshow'; counselor: string; note?: string;
  }> | undefined) || [];

  // 쿠폰 지급 알림은 최근 3일 이내 지급 건만 노출(오래된 내역 홍수 방지). 전체 이력은 미션 카드 '최근 적립'에서.
  const couponGrantCutoffIso = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const systemNotifications = [
    // 쿠폰 지급(미션 달성·OT·행사 참여) — 언제/왜 받았는지 학생 홈 알림으로 즉시 노출.
    // grantedAt(실제 지급 시각)이 있는 신규 지급만 대상(레거시 항목은 오래됐고 시각이 없어 제외).
    ...((student.couponGrants || [])
      .filter((g) => (g.grantedAt || '') >= couponGrantCutoffIso)
      .map((g) => ({
        id: `coupon-grant-${g.grantedAt || g.periodKey}-${g.missionName}`,
        tone: 'emerald' as const,
        label: '쿠폰 지급',
        title: `쿠폰 ${g.coupons}장이 지급됐어요`,
        body: `'${g.missionName}' 달성으로 쿠폰 ${g.coupons}장을 받았어요. 쿠폰 교환소에서 반차·휴식 추가권 등으로 바꿀 수 있어요.`,
        date: g.grantedAt || g.periodKey,
        priority: 2,
      }))),
    // 정기 외출 반영으로 관리자가 계획을 조정했을 때 — 학생 홈 알림으로 노출.
    ...((student.awayReplanNotices || []).map((n) => ({
      id: `away-replan-${n.id}`,
      tone: 'blue' as const,
      label: '계획 조정',
      title: '외출 반영으로 학습 계획이 조정됐어요',
      body: `${n.subjectName} ${n.materialTitle}\n${n.summary}\n정기 외출 시간이 반영되어 계획이 자동으로 조정됐어요.`,
      date: n.appliedAt,
      priority: 2,
    }))),
    // 출결판 미착석 알림(관리자 발송) — 확인(dismiss) 전까지 누적 노출
    ...((student.seatAlerts || []).map((alert) => ({
      id: `seat-alert-${alert.id}`,
      tone: 'red' as const,
      label: '출석 확인',
      title: `${alert.periodLabel}교시 자리 비움 확인 요청`,
      body: alert.message,
      date: alert.createdAt || alert.date,
      priority: 1,
    }))),
    // 관리자가 대신 잡아준 상담 예약(source==='admin') — 학생이 상담 탭을 열지 않아도 알림으로 즉시 인지.
    // 본인이 직접 예약한 건(source==='student')은 이미 알고 있으므로 제외. 지난 날짜는 알리지 않는다.
    ...((student.consultationBookings || [])
      .filter((b) => b.status === 'booked' && b.source === 'admin' && b.kind === 'regular' && b.date >= todayDateKey)
      .map((b) => ({
        id: `consultation-admin-${b.id}`,
        tone: 'blue' as const,
        label: '상담 예약',
        title: '담당 선생님이 상담을 예약했어요',
        body: `${b.date}${b.weekday ? `(${WEEKDAY_LABEL[b.weekday]})` : ''} ${b.slot} · 담당 ${b.counselor}\n상담 예약 탭에서 확인할 수 있어요. 시간이 안 맞으면 변경을 요청할 수 있어요.`,
        date: b.createdAt || b.date,
        priority: 2,
      }))),
    // 관리자가 시간 변경을 제안한 상담 — 학생이 수락/거절해야 하므로 알림으로 노출.
    // id 에 requestedAt 을 포함해 새 제안은 별개 알림으로 뜨게 한다(이전 제안을 확인처리해도 새 제안은 재노출).
    ...((student.consultationBookings || [])
      .filter((b) => b.status === 'booked' && b.reschedule?.by === 'admin' && (b.reschedule?.date || '') >= todayDateKey)
      .map((b) => ({
        id: `consultation-reschedule-${b.id}-${b.reschedule!.requestedAt || ''}`,
        tone: 'amber' as const,
        label: '시간 변경 제안',
        title: '담당 선생님이 상담 시간 변경을 제안했어요',
        body: `${b.date}${b.weekday ? `(${WEEKDAY_LABEL[b.weekday]})` : ''} ${b.slot} → ${b.reschedule!.date}${b.reschedule!.weekday ? `(${WEEKDAY_LABEL[b.reschedule!.weekday]})` : ''} ${b.reschedule!.slot}${b.reschedule!.reason ? `\n사유: ${b.reschedule!.reason}` : ''}\n상담 예약 탭에서 수락하거나 거절할 수 있어요.`,
        date: b.reschedule!.requestedAt || b.createdAt || b.date,
        priority: 2,
      }))),
    // 관리자/시스템(담당자 휴무·출장)에 의해 취소된 상담 — 본인 취소는 리포트 API에서 이미 제외됨.
    ...((student.consultationCancellations || [])
      .map((b) => ({
        id: `consultation-cancelled-${b.id}`,
        tone: 'red' as const,
        label: '상담 취소',
        title: '예약된 상담이 취소되었어요',
        body: `${b.date}${b.weekday ? `(${WEEKDAY_LABEL[b.weekday]})` : ''} ${b.slot} 상담이 취소되었어요.${b.adminReply ? `\n사유: ${b.adminReply}` : ''}\n필요하면 상담 예약 탭에서 다시 예약해 주세요.`,
        date: b.cancelledAt || b.date,
        priority: 1,
      }))),
    // 상담 결과 기록(완료: 결과 노트가 있을 때 / 노쇼: 항상) — 최근 14일 이내만.
    ...(consultationHistoryEntries
      .filter((h) => h.date >= recentConsultationCutoffKey && (h.status === 'noshow' || !!h.note))
      .map((h) => h.status === 'noshow'
        ? {
            id: `consultation-noshow-${h.id}`,
            tone: 'amber' as const,
            label: '상담 불참',
            title: '상담에 참석하지 못했어요',
            body: `${h.date} ${h.slot} 상담이 미참석으로 처리됐어요. 다시 예약이 필요하면 상담 예약 탭에서 신청해 주세요.`,
            date: h.date,
            priority: 3,
          }
        : {
            id: `consultation-result-${h.id}`,
            tone: 'emerald' as const,
            label: '상담 결과',
            title: '상담 결과가 기록됐어요',
            body: `${h.date} ${h.slot} 상담 결과가 정리됐어요.${h.note ? `\n${truncateNotificationText(h.note, 160)}` : ''}\n상담 예약 탭의 지난 상담에서 확인할 수 있어요.`,
            date: h.date,
            priority: 4,
          })),
    ...(student.weeklyGradeCheck && !hasGradeThisWeek
      ? [{
          id: 'weekly-grade-check',
          tone: 'amber' as const,
          label: '성적 입력',
          title: '이번 주 성적 입력이 필요해요',
          body: '주간 테스트나 모의고사 성적을 입력하면 담당 코멘터가 이번 주 학습 흐름을 더 정확히 확인할 수 있어요.',
          date: todayDateKey,
          priority: 2,
        }]
      : []),
    ...(daysUntilEnrollmentEnd !== null && daysUntilEnrollmentEnd <= 3
      ? [{
          id: 'enrollment-end',
          tone: daysUntilEnrollmentEnd < 0 ? 'red' as const : 'amber' as const,
          label: daysUntilEnrollmentEnd < 0 ? '등록 만료' : '등록 안내',
          title: daysUntilEnrollmentEnd < 0 ? '등록 기간이 만료됐어요' : `등록 종료까지 D-${daysUntilEnrollmentEnd}`,
          body: daysUntilEnrollmentEnd < 0
            ? '데스크 또는 담당 코멘터에게 등록 상태를 확인해 주세요.'
            : `${student.enrollmentEndDate}까지 등록 기간이 예정되어 있어요.`,
          date: student.enrollmentEndDate,
          priority: daysUntilEnrollmentEnd < 0 ? 1 : 2,
        }]
      : []),
    ...(student.studentLifeComment
      ? [{
          id: 'student-life-comment',
          tone: 'blue' as const,
          label: '코멘터 소견',
          title: '코멘터 선생님의 피드백이 도착했어요',
          body: truncateNotificationText(student.studentLifeComment, 160),
          date: student.updatedAt,
          priority: 5,
        }]
      : []),
    // 이미 예약된 정기상담(예정일 이후)이 있으면 "다음 상담 예정 기간" 안내는 중복이라 숨긴다.
    ...(finishDateStr && !(student.consultationBookings || []).some((b) => b.status === 'booked' && b.kind === 'regular' && b.date >= todayDateKey)
      ? [{
          id: 'next-consultation-window',
          tone: 'slate' as const,
          label: '상담 예정',
          title: '다음 클리닉 상담 예정 기간',
          body: whyConsultation
            ? `${nextConsultationText} · ${whyConsultation.subjectName} 『${whyConsultation.materialTitle}』 계획 종료 기준`
            : nextConsultationText,
          date: finishDateStr,
          priority: 6,
        }]
      : []),
  ];

  const allStudentNotifications = [...requestNotifications, ...suggestionNotifications, ...leaveNotifications, ...seatMoveNotifications, ...systemNotifications].sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return (b.date || '').localeCompare(a.date || '');
  });
  const dismissedNotificationIdSet = new Set(dismissedNotificationIds);
  const studentNotifications = allStudentNotifications.filter((notification) => !dismissedNotificationIdSet.has(notification.id));
  const dismissedStudentNotifications = allStudentNotifications.filter((notification) => dismissedNotificationIdSet.has(notification.id));
  const notificationCount = studentNotifications.length;
  const notificationPreview = studentNotifications.slice(0, 5);

  // student 은 위 `if (!student) return` 가드 이후라 항상 존재 — 훅이 아닌 일반 연산이어야
  // 조건부 훅 호출(Rules of Hooks 위반)이 발생하지 않는다.
  const totalPenaltyPoints = (student.penalties || []).reduce(
    (sum: number, p: any) => sum + (p.type === 'penalty' ? p.points : -p.points),
    0
  );
  const reportNavItems = isStudentReport
    ? [
        { href: '#report-overview', label: '홈', meta: getCampusLabel(student.campus), icon: Home },
        { href: '#learning', label: '학습', meta: `오늘 ${todaySubjects.length}개 · 진도·성적`, icon: BookOpen },
        { href: '#focus', label: '집중', meta: isLectureTime ? '강의 수강 중' : '뽀모도로 타이머', icon: Timer },
        { href: '#wrong-note', label: '오답 노트', meta: '교재별 오답 사유', icon: Target },
        { href: '#student-requests', label: '신청', meta: `상담 · 반차 ${homeHalfLeft}회`, icon: ClipboardList },
        { href: '#calendar', label: '캘린더', meta: '내 수험 스케줄러', icon: CalendarDays },
        { href: '#life', label: '생활', meta: `등하원 · 벌점 ${totalPenaltyPoints}점`, icon: Shield },
        { href: '#student-notifications', label: '알림', meta: `${notificationCount}개`, icon: Bell },
        { href: '#coach-feedback', label: '코멘팅 소견', meta: '학생 피드백', icon: MessageSquare },
      ]
    : [
        { href: '#report-overview', label: '홈', meta: getCampusLabel(student.campus), icon: Home },
        { href: '#study-stats', label: '학습 통계', meta: '학습 시간 비교', icon: Award },
        { href: '#coach-feedback', label: '코멘팅 소견', meta: '학부모 브리핑', icon: MessageSquare },
        { href: '#subject-progress', label: '과목별 진도', meta: '교재/인강', icon: BookOpen },
        { href: '#grade-analysis', label: '성적 분석', meta: `${(student.grades || []).length}건`, icon: FileText },
        { href: '#student-penalties', label: '벌점 내역', meta: `누적 ${totalPenaltyPoints}점`, icon: Shield },
      ];

  const realignStudentPlans = async (mode: 'keepTargetDate' | 'keepPace') => {
    setRealigningPlans(true);
    try {
      const res = await fetch('/api/student/progress/realign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent(json.data);
        toast.success('학습 계획이 현재 진도 기준으로 성공적으로 재조정되었습니다.');
      } else {
        toast.error(json.message || '계획 재조정에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setRealigningPlans(false);
    }
  };

  const tabIds = reportNavItems.map((item) => item.href.slice(1));

  // 주말 보강 완료 입력 — /api/student/makeup 호출 후 조용한 낙관적 갱신(makeupDone 누적 + 진도 회복).
  // 성공 시 자료의 makeupDone·currentPage/completedLectures 를 서버가 적용한 applied 만큼 반영한다.
  const saveMakeupDone = async (
    materialType: ProgressMaterialType,
    materialId: string,
    amount: number,
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/makeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialType, materialId, amount }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const applied = Math.max(0, Math.round(Number(json.applied) || 0));
        if (applied > 0) {
          setStudent((prev) => {
            if (!prev) return prev;
            const patch = <T extends { id: string; makeupDone?: number; currentPage?: number; totalPages?: number; completedLectures?: number; totalLectures?: number }>(m: T): T => {
              if (m.id !== materialId) return m;
              const next: T = { ...m, makeupDone: (m.makeupDone || 0) + applied };
              if (materialType === 'book') {
                next.currentPage = Math.min(next.totalPages ?? Infinity, (m.currentPage || 0) + applied);
              } else {
                next.completedLectures = Math.min(next.totalLectures ?? Infinity, (m.completedLectures || 0) + applied);
              }
              return next;
            };
            return {
              ...prev,
              subjects: (prev.subjects || []).map((s) => ({
                ...s,
                ...(materialType === 'book' ? { books: (s.books || []).map(patch) } : { lectures: (s.lectures || []).map(patch) }),
              })),
              ...(materialType === 'book'
                ? { books: (prev.books || []).map(patch) }
                : { lectures: (prev.lectures || []).map(patch) }),
            };
          });
          toast.success(`보강 ${applied}${materialType === 'lecture' ? '강' : ''} 완료로 기록했어요.`);
        } else {
          toast.success('남은 보강이 없어요.');
        }
        return true;
      }
      toast.error(json?.message || '보강 저장에 실패했어요. 다시 시도해 주세요.');
      return false;
    } catch {
      toast.error('네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요.');
      return false;
    }
  };

  return {
    studentId,
    shareTokenParam,
    audience,
    isStudentReport,
    isParentReport,
    sharePasswordInput,
    setSharePasswordInput,
    sharePasswordError,
    setSharePasswordError,
    sharePasswordVerified,
    sharePasswordChecking,
    handleSharePasswordSubmit,
    student,
    setStudent,
    whyConsultation,
    consultationBookings: student.consultationBookings || [],
    consultationHistory: (student as any).consultationHistory || [],
    materialBenchmarks,
    studyStats,
    mockExams,
    loading,
    error,
    mounted,
    visiblePlanWeeks,
    setVisiblePlanWeeks,
    activeTab,
    setActiveTab,
    paperRef,
    slideDirRef,
    gradeForm,
    setGradeForm,
    gradeSubmitting,
    gradeError,
    submitGrade,
    deleteGrade,
    requestForm,
    setRequestForm,
    requestSubmitting,
    pendingPlanId,
    setPendingPlanId,
    pendingAmount,
    setPendingAmount,
    requestError,
    requestCustomOpen,
    setRequestCustomOpen,
    sendRequest,
    cancelRequest,
    suggestionMessage,
    setSuggestionMessage,
    suggestionSubmitting,
    suggestionError,
    submitSuggestion,
    cancelSuggestion,
    checklistForm,
    setChecklistForm,
    checklistSubmitting,
    rewardBanner,
    setRewardBanner,
    swipeStart,
    completedQuests,
    setCompletedQuests,
    showRequestHistory,
    setShowRequestHistory,
    showLeaveHistory,
    setShowLeaveHistory,
    showSuggestionHistory,
    setShowSuggestionHistory,
    leaveForm,
    setLeaveForm,
    leaveSubmitting,
    leaveError,
    submitLeave,
    cancelLeave,
    reappealLeave,
    homeAttend,
    homeAttendNow,
    getCampusLabel,
    handlePrint,
    handleLogout,
    chartData,
    gradeSubjects,
    todaySubjects,
    currentSubjects,
    currentSubjectText,
    timeGreeting,
    currentBriefingPhrase,
    briefingSubMessage,
    currentStudyLabel,
    homeHalfLeft,
    homeFullLeft,
    homeLeaveCoupons,
    homeTotalMin,
    weeklyDailyPlans,
    todayDailyPlan,
    todayPlanEntries,
    todaySchedule,
    scheduledSlotLabels,
    todaySelfPacedItems,
    saveSelfPacedToday,
    saveStudySlot,
    saveMaterialColor,
    saveEstimatedTotal,
    adjustStartPoint,
    formatNotificationDate,
    notificationCount,
    notificationPreview,
    studentNotifications,
    dismissedStudentNotifications,
    dismissNotification,
    restoreNotification,
    restoreAllNotifications,
    replyToThread,
    reportNavItems,
    tabIds,
    hasGradeThisWeek,
    daysUntilEnrollmentEnd,
    showEnrollmentWarning,
    isEnrollmentExpiredLocked,
    handleSwipeStart,
    handleSwipeEnd,
    realignStudentPlans,
    realigningPlans,
    updateProgress,
    updateBookSolvedQuestions,
    updatePlanCompletion,
    updateDeadlineProgress,
    deadlineGoals: deadlineDerivation.deadlineGoals,
    deadlineSummary: deadlineDerivation.deadlineSummary,
    incrementBookIncorrectTag,
    setBookIncorrectTag,
    saveMakeupDone,
    submitChecklist,
    studyTimeLabels: STUDY_TIME_LABELS,
    weekDaySlots: WEEK_DAY_SLOTS,
    studyTimeSlots: STUDY_TIME_SLOTS_MAPPED,
    currentMinutes,
    todayDayKey,
    isLectureTime,
  };
}
