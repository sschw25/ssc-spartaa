'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Home, Bell, Clock, Award, Target, Sparkles, MessageSquare, Calendar, BookOpen, FileText, Shield, Ticket } from 'lucide-react';
import { Student, DetailedPlan, LeaveType, ConsultationLog, ProposedGoal, MockExam, LeaveRequest } from '@/lib/types/student';
import {
  getMonthlyLeaveUsage,
  getLeaveCredits,
  MONTHLY_HALFDAY_QUOTA,
  MONTHLY_FULLDAY_QUOTA,
  kstYearMonth,
} from '@/lib/leave';
import { MaterialBenchmarkMap } from '@/lib/material-benchmark';
import { ACADEMY_TIMETABLE, STUDY_TIME_SLOTS, getStudyTimeSlot } from '@/lib/academy-timetable';
import { getGradeChartData, getGradeSubjects } from '@/lib/grade-chart';
import { getPlanDailyCompletion } from '@/lib/student-activity';
import { buildDisplayThread } from '@/lib/thread';
import type { StudyStats } from '@/components/report/study-stats-card';
import { toast } from 'sonner';

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
  halfDay: '반차 신청',
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

export function useReportState() {
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
  const [activeTab, setActiveTab] = useState('report-overview');

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
    goalType: 'weeks' as 'weeks' | 'weeklyAmount' | 'dailyAmount',
    goalValue: '',
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
    async function loadReport() {
      try {
        const tokenQuery = shareTokenParam ? `&token=${encodeURIComponent(shareTokenParam)}&pw=${encodeURIComponent(sharePasswordInput)}` : '';
        const res = await fetch(`/api/report/${studentId}?audience=${audience}${tokenQuery}`);
        if (res.ok) {
          const json = await res.json();
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
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (studentId && (!shareTokenParam || sharePasswordVerified)) {
      loadReport();
    }
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
      const res = await fetch(
        `/api/report/${studentId}?audience=parent&token=${encodeURIComponent(shareTokenParam!)}&pw=${encodeURIComponent(sharePasswordInput)}`
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
      } else {
        setGradeError(json.message || '저장에 실패했습니다.');
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
  ) => {
    setStudent((prev) => {
      if (!prev) return prev;

      // 1. 최상위 books 패치
      const updatedBooks = (prev.books || []).map((b) => {
        if (materialType !== 'book' || b.id !== materialId) return b;
        return {
          ...b,
          currentPage: value,
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

  const saveProgressPatch = async (
    materialType: ProgressMaterialType,
    materialId: string,
    payload: { value?: number; planId?: string; isCompleted?: boolean; dateKey?: string; actualAmount?: number; solvedQuestions?: number; incorrectTags?: Record<string, number> },
  ) => {
    try {
      const res = await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, materialId, ...payload }),
      });
      const json = await res.json();
      if (res.ok && json.success && typeof json.value === 'number') {
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
        );
      }
    } catch {
      // noop
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
  ) => saveProgressPatch(materialType, materialId, { planId, isCompleted, ...(actualAmount !== undefined ? { actualAmount } : {}), ...(dateKey ? { dateKey } : {}) });

  const incrementBookIncorrectTag = (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined) => {
    const nextTags = { ...(currentTags || {}) };
    nextTags[tagKey] = (nextTags[tagKey] || 0) + 1;
    saveProgressPatch('book', materialId, { incorrectTags: nextTags });
  };

  const submitChecklist = async (e: React.FormEvent) => {
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
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 5000);
        }
      } else if (json?.message) {
        if (typeof window !== 'undefined') window.alert(json.message);
      }
    } catch {
      // noop
    } finally {
      setChecklistSubmitting(false);
    }
  };

  const sendRequest = async (requestType: string, rawMessage: string, proposedGoal?: ProposedGoal) => {
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
        body: JSON.stringify({ requestType, message, proposedGoal }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, changeRequests: [json.request, ...(prev.changeRequests || [])] } : prev));
        setRequestForm({
          requestType: 'progress',
          message: '',
          materialId: '',
          materialType: 'book',
          goalType: 'weeks',
          goalValue: '',
          proposedWeekNumber: '',
          proposedRangeText: '',
          speedMultiplier: '1.0',
          currentGoalSnapshot: null,
        });
        setRequestCustomOpen(false);
      } else {
        setRequestError(json.message || '신청에 실패했습니다.');
      }
    } catch {
      setRequestError('네트워크 오류가 발생했습니다.');
    } finally {
      setRequestSubmitting(false);
    }
  };
  
  const cancelRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/student/requests?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, changeRequests: (prev.changeRequests || []).filter((r) => r.id !== id) } : prev));
      }
    } catch {
      // noop
    }
  };

  const submitLeave = async () => {
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
        const ok = window.confirm(
          '반차는 기본적으로 사용 전날 18:00까지 신청해야 합니다. 당일 오전 등 급하게 신청하는 경우, 긴급한 상황에만 사용해 주시기 바랍니다. 신청하시겠습니까?'
        );
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
      } else {
        setLeaveError(json.message || '신청에 실패했습니다.');
      }
    } catch {
      setLeaveError('네트워크 오류가 발생했습니다.');
    } finally {
      setLeaveSubmitting(false);
    }
  };
  
  const cancelLeave = async (id: string) => {
    try {
      const res = await fetch(`/api/student/leave?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, leaveRequests: (prev.leaveRequests || []).filter((r) => r.id !== id) } : prev));
      }
    } catch {
      // noop
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
      } else {
        setSuggestionError(json.message || '건의사항 등록에 실패했습니다.');
      }
    } catch {
      setSuggestionError('네트워크 오류가 발생했습니다.');
    } finally {
      setSuggestionSubmitting(false);
    }
  };

  const cancelSuggestion = async (id: string) => {
    try {
      const res = await fetch(`/api/student/suggestions?id=${encodeURIComponent(id)}&studentId=${encodeURIComponent(studentId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, suggestionRequests: (prev.suggestionRequests || []).filter((r) => r.id !== id) } : prev));
      }
    } catch {
      // noop
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

        const entries = (student.subjects || [])
          .filter((subject) => {
            const ds = subject.studyDays || [];
            return ds.length === 0 || ds.includes(day.key);
          })
          .sort((a, b) => {
            const timeDiff = STUDY_TIME_ORDER[a.studyTime || ''] - STUDY_TIME_ORDER[b.studyTime || ''];
            return timeDiff || a.name.localeCompare(b.name);
          })
          .flatMap((subject) => {
            const lectures = (subject.lectures || []).flatMap((lecture) =>
              (lecture.detailedPlans || [])
                .filter((plan) => isPlanActiveOnDate(plan, dateKey))
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
                    rangeText: plan.rangeText,
                    dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
                    dailyLabel: getDailyAmountLabel(plan),
                  };
                })
            );
            const books = (subject.books || []).flatMap((book) =>
              (book.detailedPlans || [])
                .filter((plan) => isPlanActiveOnDate(plan, dateKey))
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
                    rangeText: plan.rangeText,
                    dailyAmount: plan.dailyAmount ?? Math.ceil((plan.targetAmount || 1) / 6),
                    dailyLabel: getDailyAmountLabel(plan),
                  };
                })
            );
            return [...lectures, ...books];
          });

        return { key: day.key, label: day.label, dateKey, dateLabel: formatShortDate(currentDate), entries };
      });

      return {
        weekNumber: weekOffset + 1,
        rangeLabel: `${formatShortDate(start)} ~ ${formatShortDate(end)}`,
        days,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.subjects, visiblePlanWeeks]);

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

  const allEndDates = (student.subjects || []).flatMap(sub => [
    ...(sub.books || []).flatMap(b => (b.detailedPlans || []).map(p => p.endDate)),
    ...(sub.lectures || []).flatMap(l => (l.detailedPlans || []).map(p => p.endDate))
  ]);

  const finishDateStr = allEndDates.length > 0
    ? allEndDates.reduce((max, cur) => cur > max ? cur : max, allEndDates[0])
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
  
  const todaySubjects = (student.subjects || []).filter((subject) => {
    const subjectDays = subject.studyDays || [];
    return subjectDays.length === 0 || subjectDays.includes(todayDayKey);
  });
  
  const currentSubjects = (student.subjects || []).filter((subject) => {
    const subjectDays = subject.studyDays || [];
    const matchesDay = subjectDays.length === 0 || subjectDays.includes(todayDayKey);
    return matchesDay && (subject.studyTime || '') === currentStudyTimeKey;
  });

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
  const currentStudyRange = currentPeriod
    ? `${currentPeriod.start}~${currentPeriod.end}`
    : '시간표 외 구간';

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
  const todayPlanEntries = todayDailyPlan?.entries || [];

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
        id: `request-reply-${request.id}`,
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
        id: `suggestion-reply-${suggestion.id}`,
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

  const systemNotifications = [
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
    ...(finishDateStr
      ? [{
          id: 'next-consultation-window',
          tone: 'slate' as const,
          label: '상담 예정',
          title: '다음 클리닉 상담 예정 기간',
          body: nextConsultationText,
          date: finishDateStr,
          priority: 6,
        }]
      : []),
  ];

  const allStudentNotifications = [...requestNotifications, ...suggestionNotifications, ...systemNotifications].sort((a, b) => {
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
        { href: '#student-notifications', label: '알림', meta: `${notificationCount}개`, icon: Bell },
        { href: '#attendance-status', label: '등하원', meta: '실시간 출결', icon: Clock },
        { href: '#study-stats', label: '순공/랭킹', meta: '학습 시간 비교', icon: Award },
        { href: '#timetable', label: '오늘 계획', meta: `${todaySubjects.length}개 과목`, icon: Target },
        { href: '#execution-plan', label: '실행 계획표', meta: '학습 플래너', icon: Sparkles },
        { href: '#coach-feedback', label: '코멘팅 소견', meta: '학생 피드백', icon: MessageSquare },
        { href: '#student-requests', label: '반차 신청', meta: `반차 ${homeHalfLeft}회 남음`, icon: Calendar },
        { href: '#student-missions', label: '쿠폰 미션', meta: `쿠폰 ${student.leaveCoupons ?? 0}장`, icon: Ticket },
        { href: '#subject-progress', label: '과목별 진도', meta: '교재/인강', icon: BookOpen },
        { href: '#grade-analysis', label: '성적 분석', meta: `${student.grades.length}건`, icon: FileText },
        { href: '#student-penalties', label: '벌점', meta: `누적 ${totalPenaltyPoints}점`, icon: Shield },
      ]
    : [
        { href: '#report-overview', label: '홈', meta: getCampusLabel(student.campus), icon: Home },
        { href: '#study-stats', label: '학습 통계', meta: '학습 시간 비교', icon: Award },
        { href: '#coach-feedback', label: '코멘팅 소견', meta: '학부모 브리핑', icon: MessageSquare },
        { href: '#subject-progress', label: '과목별 진도', meta: '교재/인강', icon: BookOpen },
        { href: '#grade-analysis', label: '성적 분석', meta: `${student.grades.length}건`, icon: FileText },
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
    currentStudyRange,
    homeHalfLeft,
    homeFullLeft,
    homeLeaveCoupons,
    homeTotalMin,
    weeklyDailyPlans,
    todayDailyPlan,
    todayPlanEntries,
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
    incrementBookIncorrectTag,
    submitChecklist,
    studyTimeLabels: STUDY_TIME_LABELS,
    weekDaySlots: WEEK_DAY_SLOTS,
    studyTimeSlots: STUDY_TIME_SLOTS_MAPPED,
    currentMinutes,
    todayDayKey,
  };
}
