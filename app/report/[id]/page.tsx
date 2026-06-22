'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Tv, Calendar, FileText, Printer, MessageSquare, AlertCircle, CheckCircle2, Clock, LayoutDashboard, Sparkles, Award, User, Target, LogOut, Menu, Plus, Trash2, Bell, X, Home, Pencil } from 'lucide-react';
import { Student, DetailedPlan, LeaveType, ConsultationLog } from '@/lib/types/student';
import {
  LEAVE_TYPES,
  LEAVE_TYPE_ORDER,
  getLeaveTypeLabel,
  getMonthlyLeaveUsage,
  MONTHLY_HALFDAY_QUOTA,
  MONTHLY_FULLDAY_QUOTA,
  COUPONS_PER_EXTRA_HALFDAY,
  kstYearMonth,
  yearMonthOf,
} from '@/lib/leave';
import {
  MaterialBenchmarkMap,
  formatPaceComparison,
  getMaterialBenchmark,
  getMaterialDailyPace,
} from '@/lib/material-benchmark';
import { ACADEMY_TIMETABLE, STUDY_TIME_SLOTS, getStudyTimeSlot } from '@/lib/academy-timetable';
import { getGradeChartData, getGradeSubjects } from '@/lib/grade-chart';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { StudyStatsCard } from '@/components/report/study-stats-card';
import { LeaderboardCard } from '@/components/report/leaderboard-card';
import { AttendanceStatusCard } from '@/components/report/attendance-status-card';

// 히어로 서브 문구 풀 — 상황(공부중/자율/시간대)별로 다양한 멘트를 결정적으로 선택
const BRIEFING_MESSAGES: Record<string, string[]> = {
  studying: [
    '지금 이 한 과목이 합격을 만듭니다.',
    '딱 25분만 깊게 몰입해볼까요? 💪',
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

type StudentNotificationTone = 'blue' | 'emerald' | 'amber' | 'red' | 'slate';

type StudentNotification = {
  id: string;
  tone: StudentNotificationTone;
  label: string;
  title: string;
  body: string;
  meta?: string;
  date?: string;
  priority: number;
};

type ProgressMaterialType = 'book' | 'lecture';

const NOTIFICATION_TONE_ICON: Record<StudentNotificationTone, React.ElementType> = {
  blue: MessageSquare,
  emerald: CheckCircle2,
  amber: AlertCircle,
  red: AlertCircle,
  slate: Calendar,
};

const NOTIFICATION_TONE_CLASS: Record<StudentNotificationTone, { item: string; icon: string; label: string }> = {
  blue: {
    item: 'border-[#0071E3]/15 bg-[#0071E3]/[0.04]',
    icon: 'bg-[#0071E3] text-white',
    label: 'bg-[#0071E3]/10 text-[#0071E3]',
  },
  emerald: {
    item: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-600 text-white',
    label: 'bg-emerald-100 text-emerald-700',
  },
  amber: {
    item: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-500 text-white',
    label: 'bg-amber-100 text-amber-700',
  },
  red: {
    item: 'border-red-200 bg-red-50/70',
    icon: 'bg-red-500 text-white',
    label: 'bg-red-100 text-red-700',
  },
  slate: {
    item: 'border-slate-200 bg-slate-50/80',
    icon: 'bg-slate-500 text-white',
    label: 'bg-slate-200 text-slate-600',
  },
};

// 원탭 빠른 신청 (학생이 타이핑 없이 버튼으로 신청)
const QUICK_REQUESTS: { type: string; label: string; icon: string; message: string }[] = [
  { type: 'etc', label: '상담 신청할래요', icon: '💬', message: '상담을 신청합니다.' },
  { type: 'progress', label: '진도가 너무 빨라요', icon: '🏃', message: '진도가 너무 빨라요. 속도를 조정하고 싶어요.' },
  { type: 'progress', label: '진도가 너무 느려요', icon: '🐢', message: '진도가 너무 느려요. 계획을 조정하고 싶어요.' },
  { type: 'subject', label: '과목 추가/변경', icon: '📚', message: '과목 추가 또는 변경을 신청합니다.' },
  { type: 'plan', label: '학습계획 바꾸고 싶어요', icon: '🗓️', message: '학습계획 조정을 신청합니다.' },
  { type: 'progress', label: '진도 숫자 정정', icon: '✏️', message: '진도 숫자 정정이 필요해요.' },
];

export default function StudentReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const audience = searchParams.get('audience') === 'student' ? 'student' : 'parent';
  const isStudentReport = audience === 'student';
  const isParentReport = audience === 'parent';

  const [student, setStudent] = useState<Student | null>(null);
  const [materialBenchmarks, setMaterialBenchmarks] = useState<MaterialBenchmarkMap>({});
  const [studyStats, setStudyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visiblePlanWeeks, setVisiblePlanWeeks] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('report-overview');
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
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
  const [requestForm, setRequestForm] = useState({ requestType: 'progress', message: '' });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestCustomOpen, setRequestCustomOpen] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  // Phase 2 & 3: 아침 자가 점검표 및 뽀모도로 상태
  const [checklistForm, setChecklistForm] = useState({ sleepHours: 7, phoneSubmitted: true });
  const [checklistSubmitting, setChecklistSubmitting] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(3000); // 50분 집중 = 3000초
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState<'focus' | 'rest'>('focus');
  const [rewardBanner, setRewardBanner] = useState<{ show: boolean; reasons: string[] }>({ show: false, reasons: [] });

  // 뽀모도로 타이머 루프 및 30초마다 로컬 저장소 동기화
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (pomodoroActive && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((prev) => {
          const next = prev - 1;
          if (next % 30 === 0 && student) {
            window.localStorage.setItem(`ssc-pomodoro-seconds:${student.id}`, String(next));
          }
          return next;
        });
      }, 1000);
    } else if (pomodoroSeconds === 0 && student) {
      if (pomodoroMode === 'focus') {
        handlePomodoroComplete();
      } else {
        alert('휴식 시간이 완료되었습니다! 다시 집중해볼까요? 🔵');
        setPomodoroMode('focus');
        setPomodoroSeconds(3000);
      }
      setPomodoroActive(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pomodoroActive, pomodoroSeconds, pomodoroMode, student]);

  useEffect(() => {
    if (student) {
      const saved = window.localStorage.getItem(`ssc-pomodoro-seconds:${student.id}`);
      if (saved) {
        const secs = Number(saved);
        if (Number.isFinite(secs) && secs > 0) {
          setPomodoroSeconds(secs);
        }
      }
    }
  }, [student]);

  const [completedQuests, setCompletedQuests] = useState<Record<number, boolean>>({});

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

  // 지난 요청 보기 토글 상태
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [showSuggestionHistory, setShowSuggestionHistory] = useState(false);

  // 휴가/반차/휴식권/병가 신청
  const [leaveForm, setLeaveForm] = useState<{ type: LeaveType; date: string; reason: string }>(() => ({
    type: 'morning',
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()),
    reason: '',
  }));
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [homeAttend, setHomeAttend] = useState<{ loading: boolean; checkedIn: boolean; todayMinutes: number; since: string | null; sinceToday: boolean }>({ loading: true, checkedIn: false, todayMinutes: 0, since: null, sinceToday: false });
  const [homeAttendNow, setHomeAttendNow] = useState(0);

  // 홈 탭용 실시간 순공 시간 fetch (30초 갱신)
  useEffect(() => {
    if (!isStudentReport) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/attend', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setHomeAttend({ loading: false, checkedIn: !!json.checkedIn, todayMinutes: json.todayMinutes || 0, since: json.since || null, sinceToday: !!json.sinceToday });
        } else {
          setHomeAttend((s) => ({ ...s, loading: false }));
        }
      } catch {
        if (active) setHomeAttend((s) => ({ ...s, loading: false }));
      }
    };
    load();
    setHomeAttendNow(Date.now());
    const id = setInterval(() => { load(); setHomeAttendNow(Date.now()); }, 30_000);
    return () => { active = false; clearInterval(id); };
  }, [isStudentReport]);

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

  // specialNote 파싱 헬퍼
  const getSpecialNoteObj = () => {
    if (!student) return {};
    try {
      if (!student.specialNote) return {};
      const obj = JSON.parse(student.specialNote);
      if (typeof obj === 'object' && obj !== null) return obj;
      return { noteText: student.specialNote };
    } catch {
      return { noteText: student.specialNote || '' };
    }
  };

  // 뽀모도로 시간 포맷팅 헬퍼
  const formatPomodoroTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 성적 하락 감지 함수
  const detectScoreDrop = () => {
    if (!student || !student.grades || student.grades.length < 2) return null;
    
    // 과목별로 시험을 날짜순 정렬
    const gradesBySubject: Record<string, typeof student.grades> = {};
    student.grades.forEach(g => {
      const sub = (g.subject || '').trim();
      if (!sub) return;
      if (!gradesBySubject[sub]) {
        gradesBySubject[sub] = [];
      }
      gradesBySubject[sub].push(g);
    });
    
    const drops: { subject: string; prevScore: number; currentScore: number; testName: string; dropPercent: number }[] = [];
    
    for (const subject in gradesBySubject) {
      const list = [...gradesBySubject[subject]].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (list.length < 2) continue;
      
      for (let i = 1; i < list.length; i++) {
        const prev = Number(list[i-1].score) || 0;
        const curr = Number(list[i].score) || 0;
        if (prev > 0 && curr < prev) {
          const dropPercent = ((prev - curr) / prev) * 100;
          if (dropPercent >= 15) {
            drops.push({
              subject,
              prevScore: prev,
              currentScore: curr,
              testName: list[i].testName,
              dropPercent: Math.round(dropPercent * 10) / 10
            });
          }
        }
      }
    }
    
    // 가장 최근에 발생한 하락을 반환 (날짜 기준 가장 최신)
    return drops.length > 0 ? drops[drops.length - 1] : null;
  };

  // 3단계 실시간 추적 타임라인 뱃지 헬퍼 (학생용)
  const getTimelineStatusBadge = (status: string, adminReply?: string) => {
    if (status === 'approved') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          승인
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-black text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          반려
        </span>
      );
    }
    if (status === 'resolved' || status === 'completed') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          처리완료
        </span>
      );
    }
    if (adminReply && adminReply.trim()) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 px-2.5 py-0.5 text-[10px] font-black text-[#0071E3]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
          처리중
        </span>
      );
    }
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        접수중
      </span>
    );
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

  // 탭 전환 시: 활성 탭을 가로 스크롤로 보이게 + 방향에 맞춘 콘텐츠 슬라이드 전환
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

  useEffect(() => {
    setMounted(true);
    async function loadReport() {
      try {
        const res = await fetch(`/api/report/${studentId}?audience=${audience}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setStudent(json.data);
            setMaterialBenchmarks(json.materialBenchmarks || {});
            setStudyStats(json.studyStats || null);
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
    if (studentId) {
      loadReport();
    }
  }, [studentId, audience]);

  const getCampusLabel = (val: string) => {
    switch(val) {
      case 'wonju': return '원주 캠퍼스';
      case 'chuncheon': return '춘천 캠퍼스';
      case 'chungju': return '충주 캠퍼스';
      default: return '학습 센터';
    }
  };

  // 인쇄 대화 상자 열기
  const handlePrint = () => {
    window.print();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/student/auth/logout', { method: 'POST' });
    } catch {
      // 로그아웃 요청 실패 시에도 로그인 화면으로 이동
    }
    window.location.href = '/student/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] flex flex-col items-center justify-center font-sans gap-5">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-9 h-9 text-[#0071E3] animate-spin" />
          <p className="text-xs text-[#86868B] font-medium tracking-tight">결과 리포트 카드 불러오는 중...</p>
        </div>
        <div className="w-64 space-y-2.5 mt-2">
          {[100, 80, 90].map((w, i) => (
            <div key={i} className="h-3 rounded-full bg-slate-200/80 animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] flex flex-col items-center justify-center font-sans px-4">
        <div className="text-center space-y-4 max-w-md p-8 bg-white rounded-3xl border border-black/[0.04] shadow-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold tracking-tight text-[#1D1D1F]">리포트를 불러올 수 없습니다.</h2>
          <p className="text-xs text-[#86868B] leading-relaxed">
            리포트 공유 주소가 올바르지 않거나, 삭제된 학생일 수 있습니다. 학원 관리자에게 다시 문의해 주시기 바랍니다.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0071E3] px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,113,227,0.3)] transition hover:bg-[#005DB9] active:scale-[0.98]"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const chartData = getGradeChartData(student.grades);
  const gradeSubjects = getGradeSubjects(student.grades);

  const getExpectedAmountFromPlans = (plans?: DetailedPlan[]) => {
    if (!plans || plans.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const currentPlan = plans.find((plan) => plan.startDate <= today && today <= plan.endDate);
    const plan = currentPlan || plans.find((item) => item.endDate >= today) || plans[plans.length - 1];
    if (!plan?.rangeText) return null;
    const values = plan.rangeText.match(/\d+/g)?.map(Number) || [];
    return values.length > 0 ? values[values.length - 1] : null;
  };

  const getPlanStatus = (current: number, expected: number | null) => {
    if (expected === null) return null;
    if (current === expected) return '계획대로 진행';
    if (current > expected) return '계획보다 빠름';
    return current === 0 ? '진도 정체' : '계획보다 느림';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '계획보다 빠름':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case '계획대로 진행':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '계획보다 느림':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case '진도 정체':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };


  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const doesPlanStartInRange = (plan: DetailedPlan, start: Date, end: Date) => {
    const planStart = new Date(plan.startDate);
    planStart.setHours(0, 0, 0, 0);
    return start <= planStart && planStart <= end;
  };

  const collectPlans = (start: Date, end: Date) => {
    return (student.subjects || []).flatMap((subject) => [
      ...(subject.books || []).flatMap((book) =>
        (book.detailedPlans || [])
          .filter((plan) => doesPlanStartInRange(plan, start, end))
          .map((plan) => ({ ...plan, subject: subject.name, title: book.title, type: '교재', materialType: 'book' as const, materialId: book.id }))
      ),
      ...(subject.lectures || []).flatMap((lecture) =>
        (lecture.detailedPlans || [])
          .filter((plan) => doesPlanStartInRange(plan, start, end))
          .map((plan) => ({ ...plan, subject: subject.name, title: lecture.name, type: '인강', materialType: 'lecture' as const, materialId: lecture.id }))
      ),
    ]);
  };

  const weeklyPlans = collectPlans(weekStart, weekEnd);
  const monthlyPlans = collectPlans(monthStart, monthEnd);

  const getPlanUnitLabel = (rangeText: string) => {
    const rangeWithoutPass = rangeText.replace(/\d+회독/g, '');
    if (rangeText.includes('문제')) return '문제';
    if (rangeText.includes('강')) return '강';
    if (rangeText.toLowerCase().includes('p')) return 'p';
    if (rangeWithoutPass.includes('회')) return '회';
    return '';
  };

  const monthlyPlanSummaries = Array.from(monthlyPlans.reduce((acc, plan) => {
    const key = `${plan.type}_${plan.materialId}_${plan.subject}_${plan.title}`;
    const unit = getPlanUnitLabel(plan.rangeText || '');
    const current = acc.get(key) || {
      key,
      subject: plan.subject,
      title: plan.title,
      type: plan.type,
      totalAmount: 0,
      unit,
      startDate: plan.startDate,
      endDate: plan.endDate,
      planCount: 0,
    };

    current.totalAmount += Number(plan.targetAmount || 0);
    current.planCount += 1;
    current.startDate = plan.startDate < current.startDate ? plan.startDate : current.startDate;
    current.endDate = plan.endDate > current.endDate ? plan.endDate : current.endDate;
    current.unit = current.unit || unit;
    acc.set(key, current);
    return acc;
  }, new Map<string, {
    key: string;
    subject: string;
    title: string;
    type: string;
    totalAmount: number;
    unit: string;
    startDate: string;
    endDate: string;
    planCount: number;
  }>()).values()).sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));

  // 오늘 기준 1개월치 상세 계획 필터링 (지난 1주 ~ 향후 3주, 약 4~5주 분량)
  const getOneMonthPlans = (plans: DetailedPlan[] | undefined) => {
    if (!plans || plans.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startLimit = new Date(today);
    startLimit.setDate(today.getDate() - 7);
    const endLimit = new Date(today);
    endLimit.setDate(today.getDate() + 24);

    const filtered = plans.filter(plan => {
      const pStart = new Date(plan.startDate);
      const pEnd = new Date(plan.endDate);
      pStart.setHours(0, 0, 0, 0);
      pEnd.setHours(0, 0, 0, 0);
      return pStart <= endLimit && pEnd >= startLimit;
    });

    if (filtered.length === 0) {
      return plans.slice(-4);
    }
    return filtered;
  };

  // 모든 상세 계획에서 가장 늦은 종료예정일 탐색
  const allEndDates = (student?.subjects || []).flatMap(sub => [
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

  const studyTimeSlots = [
    ...STUDY_TIME_SLOTS.map((slot) => ({
      key: slot.key,
      label: slot.displayLabel,
      timeRange: slot.timeRange,
      periodLabel: slot.periodLabel,
      description: slot.description,
    })),
    { key: '', label: '미지정', timeRange: '', periodLabel: '시간대 미지정', description: '아직 학원 시간표 구간이 배정되지 않았습니다.' },
  ] as const;
  const weekDaySlots = [
    { key: 'mon', label: '월요일' },
    { key: 'tue', label: '화요일' },
    { key: 'wed', label: '수요일' },
    { key: 'thu', label: '목요일' },
    { key: 'fri', label: '금요일' },
    { key: 'sat', label: '토요일' },
    { key: 'sun', label: '일요일' },
  ] as const;
  const weekDaySlotsByDate = [
    { key: 'sun', label: '일요일' },
    { key: 'mon', label: '월요일' },
    { key: 'tue', label: '화요일' },
    { key: 'wed', label: '수요일' },
    { key: 'thu', label: '목요일' },
    { key: 'fri', label: '금요일' },
    { key: 'sat', label: '토요일' },
  ] as const;

  // 요일별 은은한 캡슐 색상 헬퍼
  const planWeekOptions = [1, 2, 3, 4, 5, 6, 7, 8];
  const studyTimeOrder: Record<string, number> = { morning: 0, afternoon: 1, night: 2, '': 3 };
  const studyTimeLabels: Record<string, string> = {
    morning: getStudyTimeSlot('morning')?.displayLabel || '오전',
    afternoon: getStudyTimeSlot('afternoon')?.displayLabel || '오후',
    night: getStudyTimeSlot('night')?.displayLabel || '야간',
    '': '미지정',
  };
  const studyTimeRanges: Record<string, string> = {
    morning: '08:20~12:30',
    afternoon: '13:50~17:40',
    night: '18:50~23:20',
    '': '',
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatShortDate = (date: Date) =>
    `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

  const getDailyAmountLabel = (plan: DetailedPlan) => {
    const amount = plan.dailyAmount || Math.ceil(plan.targetAmount / 6);
    const range = plan.rangeText || '';
    const rangeWithoutPass = range.replace(/\d+회독/g, '');
    const unit =
      range.includes('문제') ? '문제' :
      range.includes('강') ? '강' :
      range.toLowerCase().includes('p') ? 'p' :
      rangeWithoutPass.includes('회') ? '회' :
      '';
    return `하루 ${amount}${unit}`;
  };

  const getKstNowParts = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return {
      weekday: value('weekday'),
      hour: Number(value('hour')),
      minute: Number(value('minute')),
    };
  };

  const toMinutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };

  const kstNow = getKstNowParts();
  const currentMinutes = kstNow.hour * 60 + kstNow.minute;
  const currentPeriod = ACADEMY_TIMETABLE.find((period) => {
    const start = toMinutes(period.start);
    const end = toMinutes(period.end);
    return start <= currentMinutes && currentMinutes < end;
  });
  const currentStudyTimeKey = currentPeriod?.studyTime || '';
  const weekdayKeyMap: Record<string, 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = {
    Sun: 'sun',
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
  };
  const todayDayKey = weekdayKeyMap[kstNow.weekday] || 'mon';
  const currentSubjects = (student.subjects || []).filter((subject) => {
    const subjectDays = subject.studyDays || [];
    const matchesDay = subjectDays.length === 0 || subjectDays.includes(todayDayKey);
    return matchesDay && (subject.studyTime || '') === currentStudyTimeKey;
  });
  const todaySubjects = (student.subjects || []).filter((subject) => {
    const subjectDays = subject.studyDays || [];
    return subjectDays.length === 0 || subjectDays.includes(todayDayKey);
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
  // 수업/자율 시간이 아닌 '운영 시간 외'에는 시간대에 맞춰 문구를 분기
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
      ? `지금은 ${studyTimeLabels[currentStudyTimeKey]} 자율 학습 시간이에요`
      : offHoursPhrase;
  // 상황별 다양한 서브 멘트 (시간·요일·학생 기반 결정적 선택 → 매 시간 자연스레 바뀜)
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
    ? studyTimeLabels[currentStudyTimeKey]
    : nonStudyPeriodLabel || '운영 시간 외';
  const currentStudyRange = currentPeriod
    ? `${currentPeriod.start}~${currentPeriod.end}`
    : '시간표 외 구간';

  const fmtStudyMin = (min: number) => {
    if (!min || min <= 0) return '0분';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  };

  const thisMonthLeaveUsage = isStudentReport ? getMonthlyLeaveUsage(student.leaveRequests || [], kstYearMonth()) : null;
  const homeHalfLeft = thisMonthLeaveUsage ? Math.max(0, MONTHLY_HALFDAY_QUOTA - thisMonthLeaveUsage.halfday) : MONTHLY_HALFDAY_QUOTA;
  const homeFullLeft = thisMonthLeaveUsage ? Math.max(0, MONTHLY_FULLDAY_QUOTA - thisMonthLeaveUsage.fullday) : MONTHLY_FULLDAY_QUOTA;
  const homeLeaveCoupons = isStudentReport ? (student.leaveCoupons ?? 0) : 0;
  const homeElapsedMin = homeAttend.checkedIn && homeAttend.sinceToday && homeAttend.since && homeAttendNow > 0
    ? Math.max(0, Math.floor((homeAttendNow - new Date(homeAttend.since).getTime()) / 60_000))
    : 0;
  const homeTotalMin = homeAttend.todayMinutes + homeElapsedMin;

  const isPlanActiveOnDate = (plan: DetailedPlan, dateKey: string) =>
    plan.startDate <= dateKey && dateKey <= plan.endDate;

  const weeklyDailyPlans = Array.from({ length: visiblePlanWeeks }, (_, weekOffset) => {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + dayIndex);
      const dateKey = formatDateKey(currentDate);
      const day = weekDaySlotsByDate[currentDate.getDay()];

      const entries = (student.subjects || [])
        .filter((subject) => {
          const days = subject.studyDays || [];
          return days.length === 0 || days.includes(day.key);
        })
        .sort((a, b) => {
          const timeDiff = studyTimeOrder[a.studyTime || ''] - studyTimeOrder[b.studyTime || ''];
          return timeDiff || a.name.localeCompare(b.name);
        })
        .flatMap((subject) => {
          const lectures = (subject.lectures || []).flatMap((lecture) =>
            (lecture.detailedPlans || [])
              .filter((plan) => isPlanActiveOnDate(plan, dateKey))
              .map((plan) => ({
                id: `${subject.id}_${lecture.id}_${plan.id}`,
                subject: subject.name,
                title: lecture.name,
                type: '강의',
                materialType: 'lecture' as const,
                materialId: lecture.id,
                planId: plan.id,
                isCompleted: plan.isCompleted,
                studyTime: subject.studyTime || '',
                rangeText: plan.rangeText,
                dailyLabel: getDailyAmountLabel(plan),
              }))
          );
          const books = (subject.books || []).flatMap((book) =>
            (book.detailedPlans || [])
              .filter((plan) => isPlanActiveOnDate(plan, dateKey))
              .map((plan) => ({
                id: `${subject.id}_${book.id}_${plan.id}`,
                subject: subject.name,
                title: book.title,
                type: '교재',
                materialType: 'book' as const,
                materialId: book.id,
                planId: plan.id,
                isCompleted: plan.isCompleted,
                studyTime: subject.studyTime || '',
                rangeText: plan.rangeText,
                dailyLabel: getDailyAmountLabel(plan),
              }))
          );
          return [...lectures, ...books];
        });

      return {
        key: day.key,
        label: day.label,
        dateKey,
        dateLabel: formatShortDate(currentDate),
        entries,
      };
    });

    return {
      weekNumber: weekOffset + 1,
      rangeLabel: `${formatShortDate(start)} ~ ${formatShortDate(end)}`,
      days,
    };
  });
  const todayDateKey = formatDateKey(today);
  const todayDailyPlan = weeklyDailyPlans
    .flatMap((week) => week.days)
    .find((day) => day.dateKey === todayDateKey);
  const todayPlanEntries = todayDailyPlan?.entries || [];

  const formatNotificationDate = (value?: string) => {
    if (!value) return '오늘';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: value.includes('T') ? '2-digit' : undefined,
      minute: value.includes('T') ? '2-digit' : undefined,
    }).format(date);
  };

  const truncateNotificationText = (value: string, max = 120) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  };

  const parseDateOnly = (value?: string) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

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

  const requestNotifications: StudentNotification[] = (student.changeRequests || []).map((request) => {
    const requestLabel = getRequestTypeLabel(request.requestType);
    const notificationDate = request.repliedAt || request.resolvedAt || request.createdAt || request.date;

    if (request.adminReply) {
      return {
        id: `request-reply-${request.id}`,
        tone: 'blue',
        label: '답변 도착',
        title: `${requestLabel}에 답변이 도착했어요`,
        body: request.adminReply,
        meta: truncateNotificationText(request.content || ''),
        date: notificationDate,
        priority: 1,
      };
    }

    if (request.status === 'resolved') {
      return {
        id: `request-resolved-${request.id}`,
        tone: 'emerald',
        label: '처리완료',
        title: `${requestLabel}이 처리완료됐어요`,
        body: '담당 코치가 신청을 확인하고 처리했습니다.',
        meta: truncateNotificationText(request.content || ''),
        date: notificationDate,
        priority: 3,
      };
    }

    return {
      id: `request-pending-${request.id}`,
      tone: 'amber',
      label: '확인 대기',
      title: `${requestLabel} 확인을 기다리고 있어요`,
      body: '담당 코치가 확인하면 이 알림 영역에서 바로 볼 수 있어요.',
      meta: truncateNotificationText(request.content || ''),
      date: notificationDate,
      priority: 4,
    };
  });

  const suggestionNotifications: StudentNotification[] = (student.suggestionRequests || []).map((suggestion) => {
    const notificationDate = suggestion.repliedAt || suggestion.resolvedAt || suggestion.createdAt || suggestion.date;

    if (suggestion.adminReply) {
      return {
        id: `suggestion-reply-${suggestion.id}`,
        tone: 'blue',
        label: '건의 답변',
        title: '건의사항에 답변이 도착했어요',
        body: suggestion.adminReply,
        meta: truncateNotificationText(suggestion.content || ''),
        date: notificationDate,
        priority: 1,
      };
    }

    if (suggestion.status === 'resolved') {
      return {
        id: `suggestion-resolved-${suggestion.id}`,
        tone: 'emerald',
        label: '처리완료',
        title: '건의사항이 처리완료됐어요',
        body: '담당 코치가 건의사항을 확인하고 처리했습니다.',
        meta: truncateNotificationText(suggestion.content || ''),
        date: notificationDate,
        priority: 3,
      };
    }

    return {
      id: `suggestion-pending-${suggestion.id}`,
      tone: 'amber',
      label: '확인 대기',
      title: '건의사항 확인을 기다리고 있어요',
      body: '담당 코치가 확인하면 이 알림 영역에서 바로 볼 수 있어요.',
      meta: truncateNotificationText(suggestion.content || ''),
      date: notificationDate,
      priority: 4,
    };
  });

  const systemNotifications: StudentNotification[] = [
    ...(student.weeklyGradeCheck && !hasGradeThisWeek
      ? [{
          id: 'weekly-grade-check',
          tone: 'amber' as const,
          label: '성적 입력',
          title: '이번 주 성적 입력이 필요해요',
          body: '주간 테스트나 모의고사 성적을 입력하면 담당 코치가 이번 주 학습 흐름을 더 정확히 확인할 수 있어요.',
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
            ? '데스크 또는 담당 코치에게 등록 상태를 확인해 주세요.'
            : `${student.enrollmentEndDate}까지 등록 기간이 예정되어 있어요.`,
          date: student.enrollmentEndDate,
          priority: daysUntilEnrollmentEnd < 0 ? 1 : 2,
        }]
      : []),
    ...(student.studentLifeComment
      ? [{
          id: 'student-life-comment',
          tone: 'blue' as const,
          label: '코치 소견',
          title: '코치 선생님의 피드백이 도착했어요',
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

  const studentNotifications = [...requestNotifications, ...suggestionNotifications, ...systemNotifications].sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return (b.date || '').localeCompare(a.date || '');
  });
  const notificationCount = studentNotifications.length;
  const notificationPreview = studentNotifications.slice(0, 5);

  const getSubjectColorClass = (subjectName?: string) => {
    void subjectName;
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  const reportNavItems = isStudentReport
    ? [
        { href: '#report-overview', label: '홈', meta: getCampusLabel(student.campus), icon: Home },
        { href: '#student-notifications', label: '알림', meta: `${notificationCount}개`, icon: Bell },
        { href: '#attendance-status', label: '등하원', meta: '실시간 출결', icon: Clock },
        { href: '#study-stats', label: '순공/랭킹', meta: '학습 시간 비교', icon: Award },
        { href: '#timetable', label: '오늘 계획', meta: `${todaySubjects.length}개 과목`, icon: Target },
        { href: '#execution-plan', label: '실행 계획표', meta: '학습 플래너', icon: Sparkles },
        { href: '#coach-feedback', label: '코칭 소견', meta: '학생 피드백', icon: MessageSquare },
        { href: '#student-requests', label: '반차 신청', meta: `반차 ${homeHalfLeft}회 남음`, icon: Calendar },
        { href: '#period-plan', label: '주·월간 계획', meta: '핵심 범위', icon: BookOpen },
        { href: '#subject-progress', label: '과목별 진도', meta: '교재/인강', icon: BookOpen },
        { href: '#grade-analysis', label: '성적 분석', meta: `${student.grades.length}건`, icon: FileText },
      ]
    : [
        { href: '#report-overview', label: '홈', meta: getCampusLabel(student.campus), icon: Home },
        { href: '#study-stats', label: '학습 통계', meta: '학습 시간 비교', icon: Award },
        { href: '#coach-feedback', label: '코칭 소견', meta: '학부모 브리핑', icon: MessageSquare },
        { href: '#subject-progress', label: '과목별 진도', meta: '교재/인강', icon: BookOpen },
        { href: '#grade-analysis', label: '성적 분석', meta: `${student.grades.length}건`, icon: FileText },
      ];

  // 좌우 스와이프로 탭 전환 (앱형 제스처)
  const tabIds = reportNavItems.map((item) => item.href.slice(1));
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
  const handleSwipeStart = (e: React.TouchEvent) => {
    // 가로 스크롤되는 내부 요소(탭바/리스트)에서 시작하면 스와이프 무시
    let node = e.target as HTMLElement | null;
    while (node && node !== e.currentTarget) {
      if (node.scrollWidth > node.clientWidth + 4) {
        const ox = window.getComputedStyle(node).overflowX;
        if (ox === 'auto' || ox === 'scroll') { swipeStart.current = null; return; }
      }
      node = node.parentElement;
    }
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      goAdjacentTab(dx < 0 ? 1 : -1);
    }
  };

  const openNotificationTab = () => {
    slideDirRef.current = tabIds.indexOf('student-notifications') >= tabIds.indexOf(activeTab) ? 1 : -1;
    setActiveTab('student-notifications');
    setMobileMenuOpen(false);
    setNotificationPanelOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 학생 본인 성적 추가/삭제
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
    // 시험 유형 및 과목별 적정 만점(최대 한계값) 동적 판별
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
      /* noop */
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
  ) => {
    setStudent((prev) =>
      prev
        ? {
            ...prev,
            subjects: (prev.subjects || []).map((s) => ({
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
                          p.id === planId ? { ...p, isCompleted: Boolean(isCompleted) } : p,
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
                          p.id === planId ? { ...p, isCompleted: Boolean(isCompleted) } : p,
                        ),
                      }
                    : {}),
                };
              }),
            })),
          }
        : prev,
    );
  };

  const saveProgressPatch = async (
    materialType: ProgressMaterialType,
    materialId: string,
    payload: { value?: number; planId?: string; isCompleted?: boolean; solvedQuestions?: number; incorrectTags?: Record<string, number> },
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
          json.incorrectTags
        );
      }
    } catch {
      /* noop */
    }
  };

  // 학생 본인 교재/인강 진도 직접 갱신 (즉시 반영, 서버 클램프값 적용)
  const updateProgress = (materialType: ProgressMaterialType, materialId: string, value: number) =>
    saveProgressPatch(materialType, materialId, { value });

  // 학생 본인 교재 문항수 갱신 헬퍼
  const updateBookSolvedQuestions = (materialId: string, solvedQuestions: number) => {
    saveProgressPatch('book', materialId, { solvedQuestions });
  };

  // 학습 계획 완료 처리 시 해당 계획 종료 범위까지 진도도 함께 반영
  const updatePlanCompletion = (
    materialType: ProgressMaterialType,
    materialId: string,
    planId: string,
    isCompleted: boolean,
  ) => saveProgressPatch(materialType, materialId, { planId, isCompleted });

  // 학생 본인 교재 오답 태그 누적 헬퍼
  const incrementBookIncorrectTag = (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined) => {
    const nextTags = { ...(currentTags || {}) };
    nextTags[tagKey] = (nextTags[tagKey] || 0) + 1;
    saveProgressPatch('book', materialId, { incorrectTags: nextTags });
  };

  // 아침 자가 점검표 제출 핸들러
  const submitChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecklistSubmitting(true);
    try {
      const res = await fetch('/api/student/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleepHours: checklistForm.sleepHours,
          phoneSubmitted: checklistForm.phoneSubmitted,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 5000);
        }
      }
    } catch {
      /* noop */
    } finally {
      setChecklistSubmitting(false);
    }
  };

  // 뽀모도로 세션 완료 시 백엔드 API 호출
  const handlePomodoroComplete = async () => {
    try {
      const res = await fetch('/api/student/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, specialNote: json.specialNote, leaveCoupons: json.leaveCoupons } : prev));
        alert('🎉 50분 집중 뽀모도로 완료! 10분 휴식 모드로 전환됩니다.');
        setPomodoroMode('rest');
        setPomodoroSeconds(600); // 10분 휴식 = 600초
        
        if (json.rewardGranted) {
          setRewardBanner({ show: true, reasons: json.rewardReasons });
          setTimeout(() => setRewardBanner({ show: false, reasons: [] }), 5000);
        }
      }
    } catch {
      alert('뽀모도로 완료 저장 중 문제가 발생했습니다.');
    }
  };

  // 학생 변경 신청 (관리자에게)
  const sendRequest = async (requestType: string, rawMessage: string) => {
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
        body: JSON.stringify({ requestType, message }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudent((prev) => (prev ? { ...prev, changeRequests: [json.request, ...(prev.changeRequests || [])] } : prev));
        setRequestForm({ requestType: 'progress', message: '' });
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
      /* noop */
    }
  };

  // 휴가/반차/휴식권/병가 신청
  const submitLeave = async () => {
    if (leaveSubmitting) return;
    if (!leaveForm.date) {
      setLeaveError('사용 희망일을 선택해 주세요.');
      return;
    }
    setLeaveError('');
    setLeaveSubmitting(true);
    try {
      const res = await fetch('/api/student/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: leaveForm.type, date: leaveForm.date, reason: leaveForm.reason }),
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
      /* noop */
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
      /* noop */
    }
  };

  return (
    <div className="report-page min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] py-8 md:py-16 px-4 font-sans text-[#1E293B] antialiased transition-all">
      
      {/* Print styles */}
      <style jsx global>{`
        .report-page,
        .report-page * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: A4;
            margin: 10mm 10mm;
          }

          html,
          body {
            background: #FFFFFF !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          nav,
          header,
          footer,
          [data-nextjs-dev-tools],
          nextjs-portal {
            display: none !important;
          }

          .no-print {
            display: none !important;
          }

          .report-page {
            min-height: auto !important;
            background: #FFFFFF !important;
            padding: 0 !important;
          }

          .print-container {
            display: block !important;
            max-width: 190mm !important;
            width: 190mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }

          .report-paper {
            width: 100% !important;
            background: #FFFFFF !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 4mm 4mm !important;
            box-shadow: none !important;
          }

          .report-paper [class~="md:flex-row"] {
            flex-direction: row !important;
          }

          .report-paper [class~="md:items-start"] {
            align-items: flex-start !important;
          }

          .report-paper [class~="md:grid-cols-2"] {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .report-paper [class~="md:grid-cols-3"] {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }

          .report-paper [class~="md:grid-cols-4"] {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .report-paper [class~="md:col-span-2"] {
            grid-column: span 2 / span 2 !important;
          }

          .report-paper [class~="md:col-span-3"] {
            grid-column: span 3 / span 3 !important;
          }

          .print-card,
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .recharts-wrapper,
          .recharts-surface {
            overflow: visible !important;
          }

          .print-week-grid {
            display: grid !important;
            grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
            gap: 2mm !important;
          }

          a {
            color: inherit !important;
            text-decoration: none !important;
          }
        }
      `}</style>

      <div className={`${isStudentReport ? 'max-w-5xl lg:max-w-6xl xl:max-w-7xl' : 'max-w-[1320px] xl:grid xl:grid-cols-[250px_minmax(0,1fr)] xl:items-start xl:gap-6'} mx-auto print-container`}>
        {isParentReport && (
          <aside className="no-print sticky top-6 hidden xl:block">
            <nav className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="border-b border-slate-100 pb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0071E3]">Parent Report Menu</p>
                <h2 className="mt-2 text-lg font-black tracking-tight text-slate-900">학습 결과 목차</h2>
                <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">필요한 영역을 바로 확인하세요.</p>
              </div>

              <div className="mt-4 space-y-1.5">
                {reportNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-100 bg-slate-50 text-slate-500 transition-colors group-hover:border-[#0071E3]/20 group-hover:bg-[#0071E3]/5 group-hover:text-[#0071E3]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black text-slate-800">{item.label}</span>
                        <span className="block truncate text-[10px] font-bold text-slate-400">{item.meta}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </nav>
          </aside>
        )}

        <div className="min-w-0 space-y-6">
        
        {/* 상단 컨트롤러 (인쇄 제외) */}
        {isStudentReport ? (
          <>
            <div className="no-print fixed left-4 top-4 z-50">
              <button
                type="button"
                onClick={() => { setMobileMenuOpen((open) => !open); setNotificationPanelOpen(false); }}
                className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-200/80 bg-white/95 text-[#0071E3] shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-colors active:bg-[#0071E3]/10"
                aria-expanded={mobileMenuOpen}
                aria-label="학습 메뉴 열기"
              >
                <Menu className="h-5 w-5" />
              </button>

              {mobileMenuOpen && (
                <div className="mt-2 w-[min(82vw,320px)] rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Menu</p>
                      <p className="mt-0.5 text-sm font-black text-slate-900">학습 메뉴</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 shadow-sm"
                    >
                      <LogOut className="h-3.5 w-3.5 text-slate-400" />
                      로그아웃
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    {reportNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={(e) => { e.preventDefault(); const id = item.href.slice(1); slideDirRef.current = tabIds.indexOf(id) >= tabIds.indexOf(activeTab) ? 1 : -1; setActiveTab(id); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className={`flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left shadow-sm transition-colors active:bg-[#0071E3]/10 ${activeTab === item.href.slice(1) ? 'border-[#0071E3]/30 bg-[#0071E3]/5' : 'border-slate-100 bg-white'}`}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-50 text-[#0071E3] ring-1 ring-slate-100">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-black text-slate-800">{item.label}</span>
                            <span className="block truncate text-[10px] font-bold text-slate-400">{item.meta}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="no-print fixed right-4 top-4 z-50">
              <button
                type="button"
                onClick={() => { setNotificationPanelOpen((open) => !open); setMobileMenuOpen(false); }}
                className="relative grid h-12 w-12 place-items-center rounded-2xl border border-slate-200/80 bg-white/95 text-[#0071E3] shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-colors active:bg-[#0071E3]/10"
                aria-expanded={notificationPanelOpen}
                aria-label={`알림 열기, 현재 ${notificationCount}개`}
              >
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-none text-white shadow-sm">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>

              {notificationPanelOpen && (
                <div className="mt-2 w-[min(86vw,360px)] rounded-3xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071E3]">Notifications</p>
                      <p className="mt-0.5 text-sm font-black text-slate-900">학생 알림</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationPanelOpen(false)}
                      className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm"
                      aria-label="알림 닫기"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {notificationPreview.length > 0 ? (
                    <div className="space-y-2">
                      {notificationPreview.map((notification) => {
                        const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
                        const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={openNotificationTab}
                            className={`w-full rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${toneClass.item}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl ${toneClass.icon}`}>
                                <ToneIcon className="h-3.5 w-3.5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${toneClass.label}`}>{notification.label}</span>
                                  <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatNotificationDate(notification.date)}</span>
                                </span>
                                <span className="mt-1.5 block text-xs font-black leading-4 text-slate-900">{notification.title}</span>
                                <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">{truncateNotificationText(notification.body, 70)}</span>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5 text-center">
                      <p className="text-xs font-black text-slate-700">새 알림이 없습니다.</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">코치 답변과 신청 처리 상태가 여기에 표시돼요.</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={openNotificationTab}
                    className="mt-3 w-full rounded-2xl bg-[#0071E3] py-2.5 text-xs font-black text-white shadow-[0_8px_20px_rgba(0,113,227,0.18)] transition active:scale-[0.98]"
                  >
                    전체 알림 보기
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="no-print flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] backdrop-blur-xl transition-all sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#0071E3]" />
              <div className="truncate text-xs font-bold tracking-tight text-slate-500">
                SSC SPARTA · 학부모용 학습 결과 브리핑 결과지
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => window.location.href = '/admin/dashboard'}
                size="sm"
                variant="outline"
                className="flex h-10 items-center gap-2 rounded-2xl border-slate-200/80 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
              >
                <LayoutDashboard className="h-4 w-4 text-slate-400" />
                대시보드
              </Button>
              <Button
                onClick={handlePrint}
                size="sm"
                className="flex h-10 items-center gap-2 rounded-2xl border-0 bg-[#0071E3] px-5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(0,113,227,0.3)] transition-all hover:bg-[#005DB9]"
              >
                <Printer className="h-4 w-4" />
                PDF 저장 / 리포트 출력
              </Button>
            </div>
          </div>
        )}

        {/* 앱형 가로 탭 네비게이션 (학생 전용, 인쇄 제외) */}
        {isStudentReport && (
          <div className="no-print sticky top-0 z-40 mb-4 bg-gradient-to-b from-[#F8FAFC] via-[#F8FAFC]/95 to-[#F8FAFC]/0 pt-2 pb-3">
            <div className="flex gap-1.5 overflow-x-auto pl-16 pr-2 md:justify-center md:pl-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {reportNavItems.map((item) => {
                const Icon = item.icon;
                const tabId = item.href.slice(1);
                const active = activeTab === tabId;
                return (
                  <button
                    key={item.href}
                    type="button"
                    data-tab-active={active ? 'true' : undefined}
                    onClick={() => { slideDirRef.current = tabIds.indexOf(tabId) >= tabIds.indexOf(activeTab) ? 1 : -1; setActiveTab(tabId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-black whitespace-nowrap transition-all active:scale-95 ${
                      active
                        ? 'border-[#0071E3] bg-[#0071E3] text-white shadow-[0_6px_16px_rgba(0,113,227,0.25)]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                    {tabId === 'student-notifications' && notificationCount > 0 && (
                      <span className={`ml-0.5 min-w-[16px] rounded-full px-1 text-center text-[10px] font-black leading-4 ${active ? 'bg-white/25 text-white' : 'bg-red-500 text-white'}`}>
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 결과 리포트 종이 영역 */}
        <div
          ref={paperRef}
          className="report-paper bg-white border border-slate-100 rounded-[32px] p-8 md:p-14 shadow-[0_30px_70px_rgba(15,23,42,0.06)] print-card space-y-10"
          onTouchStart={isStudentReport ? handleSwipeStart : undefined}
          onTouchEnd={isStudentReport ? handleSwipeEnd : undefined}
        >

          {/* 0. 학생 대시보드 최우선 알림 */}
          {isStudentReport && (
            <section id="student-notifications" className={`scroll-mt-24 space-y-5 ${activeTab === 'student-notifications' ? '' : 'hidden print:block'}`}>
              <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
                      <Bell className="h-3.5 w-3.5" />
                      Student Notifications
                    </div>
                    <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 md:text-4xl">
                      {notificationCount > 0 ? `${student.name}님에게 온 알림 ${notificationCount}개` : `${student.name}님, 새 알림이 없습니다`}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                      코치 답변, 신청 처리 상태, 성적 입력 안내처럼 지금 먼저 확인해야 할 내용을 한곳에 모았습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { slideDirRef.current = 1; setActiveTab('report-overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-[#0071E3]/20 bg-white px-4 text-xs font-black text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/5 active:scale-[0.98]"
                  >
                    오늘 브리핑 보기
                  </button>
                </div>
              </div>

              {studentNotifications.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {studentNotifications.map((notification) => {
                    const toneClass = NOTIFICATION_TONE_CLASS[notification.tone];
                    const ToneIcon = NOTIFICATION_TONE_ICON[notification.tone];
                    return (
                      <article key={notification.id} className={`rounded-3xl border p-4 shadow-sm md:p-5 ${toneClass.item}`}>
                        <div className="flex items-start gap-3">
                          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneClass.icon}`}>
                            <ToneIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass.label}`}>
                                {notification.label}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">{formatNotificationDate(notification.date)}</span>
                            </div>
                            <h3 className="mt-2 text-sm font-black leading-5 text-slate-900">{notification.title}</h3>
                            <p className="mt-1.5 whitespace-pre-wrap break-words text-xs font-semibold leading-5 text-slate-600">{notification.body}</p>
                            {notification.meta && (
                              <p className="mt-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-[10px] font-semibold leading-4 text-slate-500">
                                신청 내용: {notification.meta}
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-black text-slate-700">확인할 알림이 없습니다.</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">신청 답변이나 코치 안내가 도착하면 이 화면 맨 위에 표시됩니다.</p>
                </div>
              )}
            </section>
          )}
          {/* 1. 리포트 헤더 */}
          <div id="report-overview" className={`scroll-mt-24 border-b border-slate-100 pb-8 flex-col md:flex-row justify-between md:items-start gap-6 ${!isStudentReport || activeTab === 'report-overview' ? 'flex' : 'hidden print:flex'}`}>
            {isStudentReport ? (
              <div className="w-full space-y-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3]/5 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#0071E3]">
                      <Sparkles className="h-3.5 w-3.5 text-[#0071E3]" />
                      SSC SPARTA DAILY BRIEFING
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#0071E3]">
                        오늘의 학습 브리핑
                        <span className="ml-1.5 text-[11px] font-bold text-slate-400">· {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 발행</span>
                      </p>
                      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-5xl md:leading-tight">
                        {student.name}님, {timeGreeting} 👋
                        <span className="block text-[#0071E3]">
                          {currentBriefingPhrase}
                        </span>
                      </h1>
                    </div>
                    <p className="max-w-2xl text-sm font-semibold leading-7 text-slate-500">
                      {briefingSubMessage}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-2xl border border-[#0071E3]/10 bg-[#0071E3]/5 p-4 text-left shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)] md:min-w-[190px] md:text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#0071E3]/70">현재 시간대</span>
                    <span className="mt-1 block text-sm font-black text-slate-800">{currentStudyLabel}</span>
                    <span className="mt-1 block text-[10px] font-bold text-slate-400">{currentStudyRange}</span>
                  </div>
                </div>

                {/* 🔵 리워드 달성 배너 알림 */}
                {rewardBanner.show && (
                  <div className="no-print rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-800 font-black text-xs flex items-center gap-3 animate-bounce shadow-sm">
                    <span className="text-base">🎁</span>
                    <div>
                      <p>축하합니다! 미션을 달성하여 휴가/반차 쿠폰이 지급되었습니다!</p>
                      <div className="flex gap-1.5 mt-1">
                        {rewardBanner.reasons.map((r, idx) => (
                          <span key={idx} className="bg-emerald-100 text-emerald-800 text-[9px] px-2 py-0.5 rounded-full border border-emerald-200/50">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 🔵 뽀모도로 타이머 & 아침 자가 점검표 위젯 레이아웃 (가로 2열 그리드) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. 뽀모도로 타이머 */}
                  <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">실시간 집중 뽀모도로</p>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          pomodoroMode === 'focus' 
                            ? 'bg-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/15'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {pomodoroMode === 'focus' ? '🎯 집중 50분' : '☕ 휴식 10분'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">50분 동안 온전히 몰입하고 10분간 휴식하며 리듬을 조절하세요.</p>
                    </div>

                    <div className="flex items-center gap-6 my-2">
                      <div className="text-4xl md:text-5xl font-black text-slate-800 font-mono tracking-tight shrink-0">
                        {formatPomodoroTime(pomodoroSeconds)}
                      </div>
                      <div className="flex gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() => setPomodoroActive(!pomodoroActive)}
                          className={`flex-1 rounded-xl text-xs font-black py-2.5 shadow-sm transition active:scale-95 ${
                            pomodoroActive 
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-[#0071E3] hover:bg-[#0077ED] text-white'
                          }`}
                        >
                          {pomodoroActive ? '일시 정지' : '집중 시작'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPomodoroActive(false);
                            setPomodoroMode('focus');
                            setPomodoroSeconds(3000);
                            if (student) window.localStorage.removeItem(`ssc-pomodoro-seconds:${student.id}`);
                          }}
                          className="rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2.5 text-xs font-bold transition active:scale-95 shadow-sm"
                        >
                          리셋
                        </button>
                      </div>
                    </div>

                    {/* 오늘 누적 뽀모도로 세션 현황 */}
                    {(() => {
                      const note = getSpecialNoteObj();
                      const todayKey = getSeoulDateKey();
                      const count = note.pomodoro_sessions?.[todayKey] || 0;
                      return (
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold border-t border-slate-100 pt-3">
                          <span>오늘 성공한 세션수:</span>
                          <span className="font-black text-[#0071E3] bg-[#0071E3]/5 border border-[#0071E3]/15 px-2 py-0.5 rounded-lg">
                            {count} 세션 완료
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. 아침 자가 점검표 & 코칭 팁 */}
                  {(() => {
                    const note = getSpecialNoteObj();
                    const todayKey = getSeoulDateKey();
                    const checklist = note.daily_checklist?.[todayKey];

                    if (!checklist) {
                      // 아침 설문 제출 폼 렌더링
                      return (
                        <form onSubmit={submitChecklist} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">아침 자가 점검표 ☀️</p>
                            <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">매일 아침 본인의 컨디션과 환경을 스스로 기록하세요.</p>
                          </div>
                          
                          <div className="space-y-3 my-1">
                            {/* 수면 시간 입력 */}
                            <div className="flex justify-between items-center">
                              <label htmlFor="sleepHoursInput" className="text-xs font-bold text-slate-600">어젯밤 수면 시간:</label>
                              <div className="flex items-center gap-1">
                                <select
                                  id="sleepHoursInput"
                                  value={checklistForm.sleepHours}
                                  onChange={(e) => setChecklistForm(f => ({ ...f, sleepHours: Number(e.target.value) }))}
                                  className="rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs font-black text-slate-700 focus:border-[#0071E3] focus:outline-none"
                                >
                                  {[4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map(h => (
                                    <option key={h} value={h}>{h}시간</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* 휴대폰 제출 여부 */}
                            <div className="flex justify-between items-center">
                              <label htmlFor="phoneSubmittedInput" className="text-xs font-bold text-slate-600">등원 시 휴대폰 제출:</label>
                              <button
                                id="phoneSubmittedInput"
                                type="button"
                                onClick={() => setChecklistForm(f => ({ ...f, phoneSubmitted: !f.phoneSubmitted }))}
                                className={`rounded-xl px-3 py-1.5 text-xs font-black border transition active:scale-95 ${
                                  checklistForm.phoneSubmitted
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                    : 'bg-red-50 border-red-100 text-red-600'
                                }`}
                              >
                                {checklistForm.phoneSubmitted ? '제출 완료 🟢' : '미제출 🔴'}
                              </button>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={checklistSubmitting}
                            className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black py-2.5 transition active:scale-95 shadow-sm disabled:opacity-50"
                          >
                            {checklistSubmitting ? '기록 중...' : '컨디션 기록 완료'}
                          </button>
                        </form>
                      );
                    }

                    // 설문을 이미 작성했을 때의 코칭 팁 배너 노출
                    const isSleepShort = checklist.sleep_hours < 6;
                    const isPhoneNotSubmitted = !checklist.phone_submitted;
                    
                    let bannerBg = 'bg-emerald-50 border-emerald-100 text-emerald-800';
                    let bannerEmoji = '✅';
                    let bannerTitle = '쾌조의 스타트! 아침 공부를 시작해 봅시다.';
                    let bannerTips = '어젯밤 잠도 충분히 잤고 스마트폰 방해요인도 완벽하게 차단되었습니다. 오늘 플래너 달성률 100%에 도전해보세요!';

                    if (isSleepShort || isPhoneNotSubmitted) {
                      bannerBg = 'bg-amber-50 border-amber-100/80 text-amber-900';
                      bannerEmoji = '⚠️';
                      bannerTitle = '오전 효율 저하 요인이 감지되었습니다.';
                      
                      if (isSleepShort && isPhoneNotSubmitted) {
                        bannerTips = '수면이 부족(6시간 미만)하고 스마트폰이 주변에 있어 쉽게 산만해질 수 있습니다. 가벼운 스트레칭 후 스마트폰은 즉시 제출하여 방해요인을 최소화하세요!';
                      } else if (isSleepShort) {
                        bannerTips = '어젯밤 수면 시간이 6시간 미만으로 조사되었습니다. 수면 부족 시 플래너 달성률이 25% 가량 하락하기 쉬우니, 주기적으로 찬물 세수를 하며 잠을 깨보세요!';
                      } else {
                        bannerTips = '스마트폰을 아직 수납함에 제출하지 않으셨습니다. 알림 하나가 몰입의 흐름을 통째로 깨뜨리니, 지금 바로 자습실 밖 수집함에 휴대폰을 제출해보세요!';
                      }
                    }

                    return (
                      <div className={`rounded-3xl border ${bannerBg} p-5 shadow-sm space-y-2.5 flex flex-col justify-between`}>
                        <div>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">아침의 약속 & 코칭 팁 ⚪</p>
                            <span className="text-[8px] font-bold text-slate-400">기록 시각: {new Date(checklist.submitted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          
                          <div className="space-y-1 mt-2">
                            <h4 className="text-xs font-black flex items-center gap-1">
                              <span>{bannerEmoji}</span> {bannerTitle}
                            </h4>
                            <p className="text-[10px] font-bold leading-relaxed opacity-90">{bannerTips}</p>
                          </div>
                        </div>

                        <div className="flex gap-4 text-[9px] font-black text-slate-500/80 border-t border-slate-100/50 pt-2.5">
                          <span>어젯밤 수면: <strong className="text-slate-800">{checklist.sleep_hours}시간</strong></span>
                          <span>폰 수납: <strong className="text-slate-800">{checklist.phone_submitted ? '제출 완료' : '미제출'}</strong></span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] p-4 shadow-sm md:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">오늘 바로 할 일</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {todayDailyPlan ? `${todayDailyPlan.label} ${todayDailyPlan.dateLabel}` : '오늘 기준 실행 항목'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        slideDirRef.current = tabIds.indexOf('execution-plan') >= tabIds.indexOf(activeTab) ? 1 : -1;
                        setActiveTab('execution-plan');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-full rounded-full border border-[#0071E3]/20 bg-white px-3 py-2 text-[11px] font-black text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/5 sm:w-auto"
                    >
                      전체 계획 보기
                    </button>
                  </div>

                  {todayPlanEntries.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      {todayPlanEntries.map((entry, index) => (
                        <div key={entry.id} className="min-w-0 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-[0_6px_18px_rgba(0,113,227,0.04)]">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0071E3] text-[10px] font-black text-white">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-black text-slate-900">{entry.subject} · {entry.title}</p>
                              <p className="mt-1 truncate text-[10px] font-bold text-slate-500">
                                {studyTimeLabels[entry.studyTime] || '미지정'} · {entry.type} · {entry.dailyLabel}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, !entry.isCompleted)}
                              aria-pressed={entry.isCompleted}
                              className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-[10px] font-black transition active:scale-[0.96] ${
                                entry.isCompleted
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3] hover:bg-[#0071E3]/10'
                              }`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              완료
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-2xl border border-dashed border-[#0071E3]/20 bg-white/70 px-4 py-5 text-center text-xs font-bold text-slate-500">
                      오늘 배정된 실행 항목이 없습니다. 자율 학습 계획을 확인해 주세요.
                    </p>
                  )}
                </div>

                {/* 담당 코치 관리 배너 */}
                {student.manager && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50/70 border border-emerald-100 px-3.5 py-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <p className="text-[11px] font-bold text-emerald-800">
                      <span className="font-black">{student.manager}</span> 코치님이 지금 {student.name}님 학습을 관리하고 있어요
                    </p>
                  </div>
                )}

                {/* 홈 상태 카드 4개 */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">지금 할 공부</p>
                    <p className="mt-2 text-xs font-black text-slate-800 leading-tight truncate">{currentSubjectText}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">{currentStudyLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] p-3.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]/70">오늘 순공</p>
                    {homeAttend.loading ? (
                      <p className="mt-2 text-xs font-black text-slate-400">확인 중…</p>
                    ) : (
                      <>
                        <p className="mt-2 text-xs font-black text-[#0071E3]">{fmtStudyMin(homeTotalMin)}</p>
                        <p className="mt-1 text-[10px] font-bold">
                          {homeAttend.checkedIn
                            ? <span className="text-emerald-600">🔥 학습 중</span>
                            : <span className="text-slate-400">하원 상태</span>}
                        </p>
                      </>
                    )}
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { slideDirRef.current = tabIds.indexOf('student-requests') >= tabIds.indexOf(activeTab) ? 1 : -1; setActiveTab('student-requests'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { slideDirRef.current = 1; setActiveTab('student-requests'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition hover:shadow-sm active:scale-[0.98] ${homeHalfLeft > 0 ? 'border-slate-100 bg-slate-50/80' : 'border-amber-100 bg-amber-50/60'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">이번달 반차</p>
                    <p className="mt-2 text-xs font-black text-slate-800">{homeHalfLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
                    <p className="mt-1 text-[10px] font-bold text-[#0071E3]">신청하기 →</p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { slideDirRef.current = tabIds.indexOf('student-requests') >= tabIds.indexOf(activeTab) ? 1 : -1; setActiveTab('student-requests'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { slideDirRef.current = 1; setActiveTab('student-requests'); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
                    className={`rounded-2xl border p-3.5 cursor-pointer transition hover:shadow-sm active:scale-[0.98] ${homeFullLeft > 0 ? 'border-slate-100 bg-slate-50/80' : 'border-amber-100 bg-amber-50/60'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">이번달 휴식권</p>
                    <p className="mt-2 text-xs font-black text-slate-800">{homeFullLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">🎟️ 쿠폰 {homeLeaveCoupons}개</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.2em] text-[#0071E3] bg-[#0071E3]/5 px-3 py-1.5 rounded-lg uppercase">
                    <Sparkles className="w-3.5 h-3.5 text-[#0071E3]" />
                    SSC SPARTA STUDY REPORT
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-900 md:leading-tight">
                    {student.name} 원생 <span className="text-[#0071E3]">학부모용</span> 학습 결과지
                  </h1>
                </div>

                <div className="text-left md:text-right shrink-0 bg-slate-50/80 border border-slate-100 p-4 rounded-2xl min-w-[150px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)]">
                  <span className="text-[10px] text-slate-400 font-bold block tracking-wider uppercase mb-1">발행 일자</span>
                  <span className="text-xs font-bold text-slate-700">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </>
            )}
          </div>

          {/* 원생 메타 격자 프로필 카드 */}
          <div className={`grid-cols-2 md:grid-cols-4 gap-4 print-card ${!isStudentReport || activeTab === 'report-overview' ? 'grid' : 'hidden print:grid'}`}>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 shadow-sm">
                <Award className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 block">소속 센터</span>
                <span className="text-xs font-black text-slate-800">{getCampusLabel(student.campus)}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 shadow-sm">
                <User className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 block">담당 코치</span>
                <span className="text-xs font-black text-slate-800">{student.manager || '배정 코치 없음'}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 shadow-sm">
                <Target className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 block">목표 시험</span>
                <span className="text-xs font-black text-slate-800 truncate block max-w-[120px]">{student.contact || '미지정'}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 shadow-sm">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 block">학습 배속</span>
                <span className="text-xs font-black text-slate-800">{student.speedMultiplier ? `${student.speedMultiplier}배속` : '1.0배속'}</span>
              </div>
            </div>
          </div>

          {/* 1-1. 학생용 다음 상담일자 안내 배너 */}
          {isStudentReport && finishDateStr && (
            <div className={`p-4.5 rounded-2xl bg-[#0071E3]/[0.04] border border-[#0071E3]/15 items-center justify-between gap-4 shadow-sm print:shadow-none break-inside-avoid ${activeTab === 'report-overview' ? 'flex' : 'hidden print:flex'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center shrink-0">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block tracking-tight uppercase">다음 예정 상담일 (종료예정일로부터 1주일이내로 안내)</span>
                  <span className="text-xs font-black text-slate-800">{nextConsultationText}</span>
                </div>
              </div>
              <div className="hidden sm:block text-[10px] text-[#0071E3] font-bold bg-[#0071E3]/10 px-2 py-0.5 rounded-md">
                대면 클리닉 상담 예정
              </div>
            </div>
          )}



          {/* 학생 본인 등하원 상태 */}
          {isStudentReport && (
            <div id="attendance-status" className={`scroll-mt-24 ${!isStudentReport || activeTab === 'attendance-status' ? '' : 'hidden print:block'}`}>
              <AttendanceStatusCard />
            </div>
          )}

          {/* 순공 시간 / 등하원 통계 */}
          <div id="study-stats" className={`scroll-mt-24 ${!isStudentReport || activeTab === 'study-stats' ? '' : 'hidden print:block'}`}>
            <StudyStatsCard stats={studyStats} />
          </div>

          {/* 주간 순공 랭킹 (열품타식 — 학생 본인 화면에서만) */}
          {isStudentReport && (
            <div className={activeTab === 'study-stats' ? '' : 'hidden print:block'}>
              <LeaderboardCard studentId={studentId} />
            </div>
          )}

          {/* 2. 최근 생활 및 종합 피드백 */}
          <div id="coach-feedback" className={`scroll-mt-24 space-y-4 print-card ${!isStudentReport || activeTab === 'coach-feedback' ? '' : 'hidden print:block'}`}>
            <h3 className="text-xs font-black text-[#1D1D1F] tracking-widest uppercase flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#0071E3]" />
              학습 코칭 및 관리 위원회 최종 소견
            </h3>

            {isParentReport && (
              student.lifeComment ? (
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0071E3]/[0.03] to-[#0071E3]/[0.01] border border-[#0071E3]/15 shadow-[0_4px_20px_rgba(0,113,227,0.02)] relative overflow-hidden transition-all hover:shadow-[0_10px_30px_rgba(0,113,227,0.05)]">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0071E3]" />
                  <div className="text-[10px] text-[#0071E3] font-extrabold mb-3.5 flex items-center gap-2 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-ping" />
                    학부모 공유용 주간 학습 종합 분석 코멘트
                  </div>
                  <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans font-medium">
                    {student.lifeComment}
                  </pre>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5">
                  <MessageSquare className="w-6 h-6 text-slate-300 mb-1" />
                  <p className="text-xs font-bold text-slate-500">아직 학부모 공유 코멘트가 등록되지 않았어요.</p>
                  <p className="text-[10px] font-semibold text-slate-400">이번 주 상담 후 종합 소견이 여기에 도착해요 ✍️</p>
                </div>
              )
            )}

            {isStudentReport && (
              student.studentLifeComment ? (
                <div className="p-6 rounded-2xl bg-gradient-to-br from-[#10B981]/[0.03] to-[#10B981]/[0.01] border border-[#10B981]/15 shadow-[0_4px_20px_rgba(16,185,129,0.02)] relative overflow-hidden transition-all hover:shadow-[0_10px_30px_rgba(16,185,129,0.05)]">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#10B981]" />
                  <div className="text-[10px] text-emerald-700 font-extrabold mb-3.5 flex items-center gap-2 tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
                    원생 대상 주간 맞춤형 클리닉 소견
                  </div>
                  <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans font-medium">
                    {student.studentLifeComment}
                  </pre>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5">
                  <MessageSquare className="w-6 h-6 text-slate-300 mb-1" />
                  <p className="text-xs font-bold text-slate-500">아직 코치 선생님의 소견이 등록되지 않았어요.</p>
                  <p className="text-[10px] font-semibold text-slate-400">상담 후 맞춤 피드백이 여기에 도착해요 ✍️</p>
                </div>
              )
            )}
          </div>

          {/* 2-1. 과목별 학습 시간표 */}
          {isStudentReport && (
            <div id="timetable" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'timetable' ? '' : 'hidden print:block'}`}>
              {/* 오늘 할 일 — 오늘 배정 과목의 남은 분량 */}
              {isStudentReport && (() => {
                const todayLabel = weekDaySlots.find((d) => d.key === todayDayKey)?.label || '오늘';
                return (
                  <div className="rounded-3xl border border-[#0071E3]/15 bg-gradient-to-br from-[#0071E3]/[0.05] to-[#0071E3]/[0.01] p-5 md:p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                        <Target className="w-4 h-4" /> 오늘 할 일
                      </h3>
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-[#0071E3]/70">{todayLabel}</span>
                    </div>
                    {todaySubjects.length === 0 ? (
                      <p className="py-4 text-center text-xs font-bold text-slate-400">오늘은 휴식일이에요 🌙 푹 쉬고 내일 계획을 확인해요.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {(() => {
                          const coachQuests = extractQuestsFromComment(student.studentLifeComment);
                          if (coachQuests.length === 0) return null;
                          return (
                            <div className="rounded-2xl border border-[#0071E3]/20 bg-[#0071E3]/[0.02] p-4.5 space-y-2.5 shadow-[inset_0_1px_2px_rgba(0,113,227,0.01)]">
                              <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-[#0071E3]/10 px-2 py-0.5 text-[10px] font-black text-[#0071E3]">
                                  🔵 코치 특별 퀘스트
                                </span>
                                <span className="text-[9px] text-[#0071E3]/80 font-bold">코치님의 지시사항을 확인하세요</span>
                              </div>
                              <div className="space-y-2 pl-0.5">
                                {coachQuests.map((quest, idx) => {
                                  const storageKey = `ssc-coach-quest-done:${student.id}:${quest}:${idx}`;
                                  return (
                                    <div key={idx} className="flex items-center gap-2.5 text-[11px] font-bold text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={completedQuests[idx] || false}
                                        onChange={(e) => {
                                          setCompletedQuests(prev => {
                                            const next = { ...prev, [idx]: e.target.checked };
                                            window.localStorage.setItem(storageKey, e.target.checked ? 'true' : 'false');
                                            return next;
                                          });
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-[#0071E3] focus:ring-[#0071E3]/20 focus:ring-offset-0"
                                      />
                                      <span className={completedQuests[idx] ? 'line-through text-slate-400 font-medium' : ''}>
                                        {quest}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        {todaySubjects.map((subject) => {
                          const slot = subject.studyTime ? studyTimeLabels[subject.studyTime] : '';
                          const pendingBooks = (subject.books || []).filter((b) => (b.currentPage || 0) < (b.totalPages || 0));
                          const pendingLectures = (subject.lectures || []).filter((l) => (l.completedLectures || 0) < (l.totalLectures || 0));
                          const hasMaterials = (subject.books || []).length + (subject.lectures || []).length > 0;
                          const pendingCount = pendingBooks.length + pendingLectures.length;
                          return (
                            <div key={subject.id} className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-black text-slate-800">{subject.name}</span>
                                {slot && <span className="shrink-0 rounded-full bg-[#0071E3]/10 px-2 py-0.5 text-[10px] font-bold text-[#0071E3]">{slot}</span>}
                              </div>
                              {!hasMaterials ? (
                                <p className="text-[10px] font-semibold text-slate-300">등록된 학습 자료가 없어요.</p>
                              ) : pendingCount === 0 ? (
                                <p className="text-[10px] font-bold text-emerald-600">오늘 분량 자료를 모두 마쳤어요 ✅</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {pendingBooks.map((b) => (
                                    <div key={b.id} className="flex items-center justify-between gap-2 text-[10px]">
                                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600"><span>📚</span><span className="truncate">{b.title}</span></span>
                                      <span className="shrink-0 font-bold text-slate-400">{b.currentPage}/{b.totalPages}{b.unit || 'p'}</span>
                                    </div>
                                  ))}
                                  {pendingLectures.map((l) => (
                                    <div key={l.id} className="flex items-center justify-between gap-2 text-[10px]">
                                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-600"><span>💻</span><span className="truncate">{l.name}</span></span>
                                      <span className="shrink-0 font-bold text-slate-400">{l.completedLectures}/{l.totalLectures}강</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#0071E3]" />
                  요일별 과목 배치 시간표
                </h3>
                <span className="text-[10px] font-bold text-slate-400">주 6일 스파르타 플래닝</span>
              </div>
              
              <div className="print-week-grid grid grid-cols-2 md:grid-cols-7 gap-3">
                {weekDaySlots.map(day => {
                  const subjectsInDay = (student.subjects || []).filter(subject => (subject.studyDays || []).includes(day.key));
                  const isWeekend = day.key === 'sat' || day.key === 'sun';
                  const isToday = day.key === todayDayKey;

                  return (
                    <div 
                      key={day.key} 
                      className={`p-3.5 rounded-2xl border transition-all duration-300 min-h-[105px] flex flex-col shadow-sm ${
                        isToday
                          ? 'bg-[#0071E3]/[0.04] border-[#0071E3] ring-1 ring-[#0071E3]/30 shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                          : isWeekend
                            ? 'bg-slate-50/80 border-slate-100'
                            : subjectsInDay.length > 0
                              ? 'bg-white border-blue-100 hover:border-blue-200 hover:shadow-md'
                              : 'bg-slate-50/30 border-slate-100'
                      }`}
                    >
                      <h4 className={`text-[10px] font-bold tracking-tight mb-2.5 flex items-center gap-1 ${
                        isToday ? 'text-[#0071E3]' : isWeekend ? 'text-slate-400' : 'text-slate-700'
                      }`}>
                        {day.label}
                        {isToday && <span className="rounded-full bg-[#0071E3] px-1.5 py-[1px] text-[7px] font-black text-white">오늘</span>}
                      </h4>
                      {subjectsInDay.length === 0 ? (
                        <p className="text-[10px] text-slate-300 font-bold mt-auto mb-1">휴식</p>
                      ) : (
                        <div className="space-y-1.5 mt-auto">
                          {subjectsInDay.map(subject => (
                            <span 
                              key={`${day.key}_${subject.id}`} 
                              className={`text-[8px] font-extrabold px-2 py-0.5 rounded-lg border block text-center truncate shadow-sm transition-transform hover:-translate-y-0.5 ${getSubjectColorClass(subject.name)}`}
                            >
                              {subject.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 시간대 배정 뷰 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {studyTimeSlots.map(slot => {
                  const subjectsInSlot = (student.subjects || []).filter(subject => (subject.studyTime || '') === slot.key);
                  if (slot.key === '' && subjectsInSlot.length === 0) return null;
                  
                  // 시간대별 고유 스타일링 부여
                  const getSlotStyle = (key: string) => {
                    switch(key) {
                      case 'morning': return 'border-amber-100 bg-amber-50/10 hover:shadow-[0_8px_30px_rgba(245,158,11,0.04)]';
                      case 'afternoon': return 'border-blue-100 bg-blue-50/10 hover:shadow-[0_8px_30px_rgba(59,130,246,0.04)]';
                      case 'night': return 'border-slate-200 bg-slate-50/20 hover:shadow-[0_8px_30px_rgba(100,116,139,0.05)]';
                      default: return 'border-slate-100 bg-slate-50/10';
                    }
                  };
                  
                  return (
                    <div key={slot.key || 'none'} className={`p-5 rounded-2xl border bg-white space-y-4 shadow-sm transition-all duration-300 ${getSlotStyle(slot.key)}`}>
                      <div className="border-b border-slate-100 pb-2.5">
                        <div className="flex justify-between items-center gap-2">
                          <h4 className="text-xs font-black text-slate-800">{slot.label}</h4>
                          <span className="text-[10px] text-slate-400 font-extrabold bg-slate-100 px-2 py-0.5 rounded-full">{subjectsInSlot.length}개 과목</span>
                        </div>
                        <p className="mt-1 text-[10px] font-extrabold text-slate-500">{slot.timeRange || slot.periodLabel}</p>
                        {slot.key && (
                          <p className="mt-0.5 text-[10px] font-bold text-slate-400">{slot.periodLabel}</p>
                        )}
                      </div>
                      
                      {subjectsInSlot.length === 0 ? (
                        <p className="text-[10px] text-slate-300 font-bold py-4 text-center">배정된 학습 과목 없음</p>
                      ) : (
                        <div className="space-y-2.5">
                          {subjectsInSlot.map(subject => (
                            <div key={subject.id} className="rounded-xl bg-white border border-slate-100/80 p-3 text-[10px] shadow-sm hover:shadow transition-all">
                              <div className="flex justify-between items-center mb-1.5">
                                <p className="font-extrabold text-slate-700">{subject.name}</p>
                                <span className="text-[8px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                                  {(subject.books || []).length + (subject.lectures || []).length}개 자료
                                </span>
                              </div>
                              <p className="text-slate-400 text-[10px] truncate">
                                {[...(subject.books || []).map(book => book.title), ...(subject.lectures || []).map(lecture => lecture.name)].join(' · ') || '등록 학습자료 없음'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isStudentReport && (
            <div id="execution-plan" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'execution-plan' ? '' : 'hidden print:block'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#0071E3]" />
                    오늘 기준 실행 학습 계획표
                  </h3>
                  <p className="mt-1 text-[10px] font-bold text-slate-400">
                    요일별로 어떤 공부를 어떤 순서로, 하루에 어느 정도 진행할지 정리했습니다.
                  </p>
                </div>
                <span className="self-start rounded-full border border-[#0071E3]/15 bg-[#0071E3]/5 px-3 py-1 text-[10px] font-black text-[#0071E3] sm:self-auto">
                  오늘 기준 실행 브리핑
                </span>
              </div>

              {/* 학생 변경 신청 (관리자에게) */}
              <div id="student-request-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                    <MessageSquare className="w-4 h-4" /> 학습 관련 요청
                  </h4>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">진도 정정·과목 추가/변경·학습계획 조정 등을 신청하면 담당 코치가 확인해요.</p>
                </div>
                <div className="space-y-2.5">
                  {/* 원탭 빠른 신청 — 타이핑 없이 버튼으로 */}
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_REQUESTS.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        disabled={requestSubmitting}
                        onClick={() => sendRequest(q.type, q.message)}
                        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-[#0071E3]/40 hover:bg-[#0071E3]/[0.03] active:scale-[0.97] disabled:opacity-50"
                      >
                        <span className="text-base leading-none">{q.icon}</span>
                        <span className="min-w-0 leading-tight">{q.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* 직접 작성 토글 */}
                  <button
                    type="button"
                    onClick={() => setRequestCustomOpen((o) => !o)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white/60 py-2 text-[11px] font-bold text-slate-500 transition hover:text-slate-700"
                  >
                    <Plus className={`w-3.5 h-3.5 transition-transform ${requestCustomOpen ? 'rotate-45' : ''}`} />
                    {requestCustomOpen ? '직접 작성 닫기' : '직접 작성하기'}
                  </button>

                  {requestCustomOpen && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); sendRequest(requestForm.requestType, requestForm.message); }}
                      className="space-y-2 rounded-2xl border border-slate-100 bg-white/70 p-3"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(REQUEST_TYPE_LABEL).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setRequestForm((f) => ({ ...f, requestType: v }))}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${requestForm.requestType === v ? 'bg-[#0071E3] text-white' : 'border border-slate-200 bg-white text-slate-500'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={requestForm.message}
                        onChange={(e) => setRequestForm((f) => ({ ...f, message: e.target.value }))}
                        placeholder="신청 내용을 적어 주세요. 예) 수학I 진도를 주 3회로 늘리고 싶어요"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                      />
                      <button
                        type="submit"
                        disabled={requestSubmitting}
                        className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
                      >
                        {requestSubmitting ? '신청 중...' : '신청하기'}
                      </button>
                    </form>
                  )}

                  {requestError && <p className="text-[10px] font-bold text-red-500">{requestError}</p>}
                </div>
                {(() => {
                  const requests = student.changeRequests || [];
                  const pending = requests.filter(r => r.status !== 'resolved');
                  const resolved = requests.filter(r => r.status === 'resolved');
                  return (
                    (pending.length > 0 || resolved.length > 0) && (
                      <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 학습 요청 내역</p>
                        
                        {/* 대기중 요청 */}
                        {pending.map((r) => (
                          <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{getRequestTypeLabel(r.requestType)}</span>
                                {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                              </span>
                              <button type="button" onClick={() => cancelRequest(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="신청 취소">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.content}</p>
                            {r.adminReply && (
                              <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                💬 코치 답변: {r.adminReply}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 지난 요청 보기 버튼 및 완료된 요청 */}
                        {resolved.length > 0 && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setShowRequestHistory(!showRequestHistory)}
                              className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                            >
                              <span>지난 학습 요청 보기 ({resolved.length}건)</span>
                              <span className="text-[10px]">{showRequestHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                            </button>

                            {showRequestHistory && (
                              <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                                {resolved.map((r) => (
                                  <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 border border-slate-200">{getRequestTypeLabel(r.requestType)}</span>
                                        {getTimelineStatusBadge(r.status || 'resolved', r.adminReply)}
                                        <span className="shrink-0 text-[10px] font-bold text-slate-400">{r.date}</span>
                                      </span>
                                    </div>
                                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500">{r.content}</p>
                                    {r.adminReply && (
                                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                        💬 코치 답변: {r.adminReply}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  );
                })()}
              </div>

              <div className="space-y-5">
                {weeklyDailyPlans.map((week) => (
                  <div key={week.weekNumber} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm break-inside-avoid">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{week.weekNumber}주차</p>
                        <p className="text-[10px] font-bold text-slate-400">{week.rangeLabel}</p>
                      </div>
                      <span className="rounded-xl bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">
                        요일별 실행 순서
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
                      {week.days.map((day) => (
                        <div key={`${week.weekNumber}_${day.key}`} className="min-h-[170px] rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-black text-slate-800">{day.label}</p>
                              <p className="text-[10px] font-bold text-slate-400">{day.dateLabel}</p>
                            </div>
                            <span className="rounded-lg bg-white px-1.5 py-0.5 text-[8px] font-black text-slate-400">
                              {day.entries.length}개
                            </span>
                          </div>

                          {day.entries.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-2 py-5 text-center text-[10px] font-bold text-slate-300">
                              계획 없음
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {day.entries.map((entry, index) => (
                                <div
                                  key={`${entry.id}_${index}`}
                                  className={`rounded-xl border p-2 shadow-sm ${
                                    entry.isCompleted
                                      ? 'border-emerald-100 bg-emerald-50/45'
                                      : 'border-white bg-white'
                                  }`}
                                >
                                  <div className="mb-1 flex items-center gap-1.5">
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-black text-white ${entry.isCompleted ? 'bg-emerald-600' : 'bg-[#111827]'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[8px] font-black text-slate-500">
                                      {studyTimeLabels[entry.studyTime] || '미지정'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-black text-slate-800 leading-snug">
                                    {entry.subject} · {entry.title}
                                  </p>
                                  <p className="mt-1 text-[8px] font-bold text-slate-400 leading-snug">
                                    {entry.type} / {entry.rangeText}
                                  </p>
                                  <p className="mt-1 rounded-lg bg-[#0071E3]/5 px-2 py-1 text-[8px] font-black text-[#0071E3]">
                                    {entry.dailyLabel}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, !entry.isCompleted)}
                                    aria-pressed={entry.isCompleted}
                                    className={`mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border text-[10px] font-black transition active:scale-[0.97] ${
                                      entry.isCompleted
                                        ? 'border-emerald-200 bg-white/80 text-emerald-700'
                                        : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3] hover:bg-[#0071E3]/10'
                                    }`}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    {entry.isCompleted ? '완료됨' : '완료'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2-2. 이번 주 / 이번 달 학습 계획 */}
          {isStudentReport && (
            <div id="period-plan" className={`scroll-mt-24 grid-cols-1 md:grid-cols-2 gap-6 print-card ${!isStudentReport || activeTab === 'period-plan' ? 'grid' : 'hidden print:grid'}`}>
              <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-4.5 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span>📅</span> 이번 주 핵심 주간 학습 계획
                </h3>
                {weeklyPlans.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-6 text-center italic">이번 주 설정된 학습 주간 계획이 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible print:pr-0">
                    {weeklyPlans.map((plan) => (
                      <div
                        key={`${plan.materialId}_${plan.id}_week`}
                        className={`text-[10px] p-3.5 rounded-2xl border transition-colors ${
                          plan.isCompleted
                            ? 'border-emerald-100 bg-emerald-50/45'
                            : 'border-slate-100/50 bg-slate-50/70 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2 font-bold text-slate-700 mb-1">
                          <span className="min-w-0 truncate">{plan.subject} · {plan.title}</span>
                          <span className="text-[#0071E3] shrink-0 font-extrabold bg-[#0071E3]/5 px-2 py-0.5 rounded-lg border border-[#0071E3]/10">{plan.rangeText}</span>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-slate-400 text-[10px] font-semibold">
                            진행 기간: {plan.startDate} ~ {plan.endDate} · 일일 목표: {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}
                          </p>
                          <button
                            type="button"
                            onClick={() => updatePlanCompletion(plan.materialType, plan.materialId, plan.id, !plan.isCompleted)}
                            aria-pressed={plan.isCompleted}
                            className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-black transition active:scale-[0.97] ${
                              plan.isCompleted
                                ? 'border-emerald-200 bg-white/80 text-emerald-700'
                                : 'border-[#0071E3]/20 bg-white text-[#0071E3] hover:bg-[#0071E3]/5'
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {plan.isCompleted ? '완료됨' : '완료'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 rounded-3xl border border-slate-100 bg-white space-y-4.5 shadow-sm transition-all hover:shadow-md">
                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-2">
                  <span>📈</span> 이번 달 핵심 월간 학습 계획
                </h3>
                {monthlyPlanSummaries.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-6 text-center italic">이번 달 설정된 월간 학습 계획이 없습니다.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible print:pr-0">
                    {monthlyPlanSummaries.map((summary) => (
                      <div key={summary.key} className="text-[10px] p-4 rounded-2xl bg-slate-50/70 border border-slate-100/50 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start gap-3 font-bold text-slate-700 mb-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-black text-slate-700">{summary.subject} · {summary.title}</span>
                            <span className="mt-1 inline-flex rounded-md bg-white px-1.5 py-0.5 text-[8px] font-black text-slate-400 ring-1 ring-slate-100">
                              {summary.type}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-2xl border border-[#0071E3]/10 bg-[#0071E3]/5 px-3 py-1.5 text-right">
                            <span className="block text-[8px] font-black text-[#0071E3]/70">월 총량</span>
                            <span className="block text-sm font-black text-[#0071E3]">
                              {summary.totalAmount}
                              {summary.unit}
                            </span>
                          </span>
                        </div>
                        <p className="text-slate-400 text-[10px] font-semibold">
                          월간 집계 기간: {summary.startDate} ~ {summary.endDate} · {summary.planCount}개 계획 합산
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. 과목별 진도율 및 학습 진척도 */}
          <div id="subject-progress" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'subject-progress' ? '' : 'hidden print:block'}`}>
            <h3 className="text-xs font-black text-[#1D1D1F] tracking-widest uppercase flex items-center gap-2">
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
              const completedLectures = allLectures.reduce((sum, l) => sum + (l.completedLectures || 0), 0);

              const expectedPages = completedLectures * 2;
              const paceScore = expectedPages > 0 ? Math.min(100, Math.round((currentPages / expectedPages) * 100)) : (currentPages > 0 ? 100 : 0);

              let paceStatus = '적정';
              let paceColor = '#34C759';
              let paceBgClass = 'bg-emerald-500';

              if (paceScore < 40) {
                paceStatus = '부족';
                paceColor = '#F56300';
                paceBgClass = 'bg-amber-500';
              } else if (paceScore < 80) {
                paceStatus = '양호';
                paceColor = '#0071E3';
                paceBgClass = 'bg-blue-500';
              }

              return (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5 md:p-6 shadow-sm space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">전체 학습 진도</p>
                        <p className="mt-1 text-2xl font-black text-[#0071E3]">{overall}<span className="text-sm font-bold">%</span></p>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400">교재·인강 {total}개 중 <span className="font-black text-emerald-600">{done}개</span> 완료</p>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${overall}%` }} />
                    </div>
                  </div>

                  {/* 🔵 Phase 0: 교재 vs 인강 비율 도넛 및 문제 풀이 Pace 도넛 차트 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. 교재 vs 인강 비율 도넛 */}
                    <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5 shadow-sm flex flex-col items-center justify-between min-h-[220px]">
                      <div className="w-full">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">교재 vs 인강 학습 비중 (📚 💻)</p>
                        <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">포트폴리오 내 학습 자료 비율</p>
                      </div>
                      
                      <div className="relative w-full h-[110px] flex items-center justify-center my-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: '교재', value: allBooksCount || 1 },
                                { name: '인강', value: allLecturesCount || 1 }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={45}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              <Cell fill="#0071E3" />
                              <Cell fill="#BFDBFE" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute text-center">
                          <p className="text-xs font-black text-slate-800">{allBooksCount}:{allLecturesCount}</p>
                          <p className="text-[8px] font-bold text-slate-400">자료 수 비율</p>
                        </div>
                      </div>

                      <div className="flex gap-4 text-[9px] font-black text-slate-500 w-full justify-center">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0071E3] inline-block" /> 📚 교재 ({allBooksCount}개)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#BFDBFE] inline-block" /> 💻 인강 ({allLecturesCount}개)</span>
                      </div>
                    </div>

                    {/* 2. 인강 대비 문제풀이 Pace 도넛 */}
                    <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5 shadow-sm flex flex-col items-center justify-between min-h-[220px]">
                      <div className="w-full">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">문제 풀이 진척도 (Pace)</p>
                        <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">인강 수강 대비 자습 풀이 비율</p>
                      </div>
                      
                      <div className="relative w-full h-[110px] flex items-center justify-center my-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { value: paceScore },
                                { value: Math.max(0, 100 - paceScore) }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={45}
                              startAngle={90}
                              endAngle={-270}
                              dataKey="value"
                            >
                              <Cell fill={paceColor} />
                              <Cell fill="#E2E8F0" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute text-center">
                          <p className="text-xs font-black text-slate-800">{paceScore}%</p>
                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[7px] font-black text-white ${paceBgClass}`}>
                            {paceStatus}
                          </span>
                        </div>
                      </div>

                      <div className="text-[8px] font-bold text-slate-400 text-center leading-relaxed px-2">
                        {paceStatus === '적정' && '🟢 인강 수강 속도와 교재 문제풀이의 균형이 양호합니다.'}
                        {paceStatus === '양호' && '🔵 전반적인 밸런스가 잡혀 있으나 조금 더 풀이량을 늘려보세요.'}
                        {paceStatus === '부족' && '🟠 인강 시청 대비 스스로 푸는 문제풀이 시간이 현저히 부족합니다.'}
                      </div>
                    </div>
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
                      숫자 정정, 속도 조절, 상담 요청은 담당 코치에게 바로 신청할 수 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      slideDirRef.current = tabIds.indexOf('execution-plan') >= tabIds.indexOf(activeTab) ? 1 : -1;
                      setActiveTab('execution-plan');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-xs font-black text-amber-900 shadow-sm transition hover:bg-amber-50 sm:w-auto"
                  >
                    변경 신청 바로가기
                  </button>
                </div>
              </div>
            )}

            {!student.subjects || student.subjects.length === 0 ? (
              // 과목 정보가 없는 기존 데이터 Fallback 뷰
              (student.books.length === 0 && student.lectures.length === 0 ? (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                  <FileText className="w-7 h-7 text-slate-300" />
                  <p className="text-xs font-bold text-slate-400">현재 학습을 위해 등록된 교재/인강 정보가 없습니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 도서 진도 */}
                  <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md">
                    <h4 className="text-xs font-black text-slate-700 flex items-center border-b border-slate-100 pb-3">
                      <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                      교재 / 도서 진도 현황
                    </h4>
                    <div className="space-y-5">
                      {student.books.map(b => {
                        const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                        const status = getPlanStatus(b.currentPage, getExpectedAmountFromPlans(b.detailedPlans));
                        return (
                          <div key={b.id} className="space-y-2">
                            <div className="flex justify-between text-[11px] font-bold items-center">
                              <span className="truncate max-w-[190px] text-slate-600 flex items-center gap-1.5">
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
                              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <div 
                                  className="h-full rounded-full bg-[#0071E3] transition-all duration-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800">{percent}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 인강 진도 */}
                  <div className="space-y-4.5 p-6 rounded-3xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md">
                    <h4 className="text-xs font-black text-slate-700 flex items-center border-b border-slate-100 pb-3">
                      <Tv className="w-4 h-4 mr-2 text-[#0071E3]" />
                      인터넷 강의 수강 현황
                    </h4>
                    <div className="space-y-5">
                      {student.lectures.map(l => {
                        const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                        const status = getPlanStatus(l.completedLectures, getExpectedAmountFromPlans(l.detailedPlans));
                        return (
                          <div key={l.id} className="space-y-2">
                            <div className="flex justify-between text-[11px] font-bold items-center">
                              <span className="truncate max-w-[190px] text-slate-600 flex items-center gap-1.5">
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
                              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <div 
                                  className="h-full rounded-full bg-[#F56300] transition-all duration-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-black shrink-0 w-8 text-right text-slate-800">{percent}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // 과목별 정밀 포맷 뷰
              <div className="space-y-6">
                {student.subjects.map(sub => (
                  <div key={sub.id} className="p-6 md:p-8 rounded-[24px] border border-slate-100 bg-white space-y-6 shadow-sm hover:shadow-md transition-all break-inside-avoid">
                    {/* 과목 타이틀 */}
                    <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <span className="text-xs font-black text-slate-800 px-3.5 py-2 bg-slate-50 border border-slate-100 rounded-2xl inline-block self-start shadow-sm tracking-wider">
                        📚 {sub.name} 과목 학습 스케줄러
                      </span>
                      {isStudentReport && sub.learningGoal && (
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-100/60 px-3.5 py-1.5 rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)]">
                          🎯 과목 목표: {sub.learningGoal}
                        </span>
                      )}
                    </div>

                    {/* 교재 리스트 */}
                    {sub.books.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-700 flex items-center">
                          <BookOpen className="w-4 h-4 mr-2 text-[#0071E3]" />
                          {isStudentReport ? '교재별 진도 관리 및 세부 학습 목표' : '교재 진도 현황'}
                        </h4>
                        
                        <div className="space-y-5">
                          {sub.books.map(b => {
                            const percent = b.totalPages > 0 ? Math.round((b.currentPage / b.totalPages) * 100) : 0;
                            const oneMonthPlans = getOneMonthPlans(b.detailedPlans);
                            const totalPlans = oneMonthPlans.length;
                            const completedPlans = oneMonthPlans.filter(p => p.isCompleted).length;
                            const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                            const status = getPlanStatus(b.currentPage, getExpectedAmountFromPlans(b.detailedPlans));
                            const paceComparison = formatPaceComparison(
                              getMaterialDailyPace(b.detailedPlans),
                              getMaterialBenchmark(materialBenchmarks, 'book', b.title)
                            );

                            return (
                              <div key={b.id} className="p-5 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/50 to-white space-y-4 shadow-sm">
                                <div className="flex justify-between items-start flex-wrap gap-2">
                                  <div>
                                    <h5 className="text-xs font-black text-slate-700">{b.title}</h5>
                                    {b.goalDescription && (
                                      <p className="text-[10px] text-[#0071E3] font-bold mt-1.5 flex items-center gap-1">
                                        <span>🏁</span> 완독 목표: {b.goalDescription}
                                      </p>
                                    )}
                                    {isStudentReport && paceComparison && (
                                      <p className="text-[10px] text-slate-500 font-bold mt-1.5">
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
                                        <span className="flex items-center gap-1 text-xs font-bold text-slate-500 group relative">
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
                                              className="w-14 rounded-md border border-dashed border-slate-300 bg-white pl-1.5 pr-4.5 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                              aria-label="현재 페이지 입력"
                                            />
                                            <Pencil className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                                          </div>
                                          <span className="font-normal text-slate-300">/</span> {b.totalPages}p
                                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                            ✏️ 숫자를 수정하여 직접 진도를 기록하세요
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
                                            className="w-12 rounded-md border border-dashed border-slate-300 bg-white px-1 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                            aria-label="푼 문항 수 입력"
                                          />
                                          <span>문항</span>
                                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                            ✏️ 해결한 누적 문항 수를 기록하세요
                                          </span>
                                        </span>
                                        
                                        {/* 오답 유형 태깅 */}
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
                                                  onClick={() => incrementBookIncorrectTag(b.id, tag.key, b.incorrectTags as any)}
                                                  className="px-1 py-0.5 rounded bg-slate-100 hover:bg-red-50 hover:text-red-600 transition-all text-[8px] font-black text-slate-500 active:scale-95"
                                                >
                                                  {tag.label} +1
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                          {/* 등록된 오답 현황 */}
                                          {b.incorrectTags && Object.values(b.incorrectTags).some(v => Number(v) > 0) && (
                                            <div className="flex flex-wrap gap-1 mt-1 text-[7px] font-black justify-end">
                                              {Number(b.incorrectTags.calculation_error || 0) > 0 && <span className="px-1 py-0.2 bg-red-50 text-red-600 rounded">연산:{b.incorrectTags.calculation_error}</span>}
                                              {Number(b.incorrectTags.time_limit || 0) > 0 && <span className="px-1 py-0.2 bg-amber-50 text-amber-600 rounded">시간:{b.incorrectTags.time_limit}</span>}
                                              {Number(b.incorrectTags.misread_condition || 0) > 0 && <span className="px-1 py-0.2 bg-orange-50 text-orange-600 rounded">오독:{b.incorrectTags.misread_condition}</span>}
                                              {Number(b.incorrectTags.concept_leak || 0) > 0 && <span className="px-1 py-0.2 bg-blue-50 text-[#0071E3] rounded">개념:{b.incorrectTags.concept_leak}</span>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-xs font-bold text-slate-500">{b.currentPage} <span className="text-slate-300 font-normal">/</span> {b.totalPages}p</span>
                                        {(b.solvedQuestions || 0) > 0 && <span className="text-[9px] font-extrabold text-[#0071E3]">해결: {b.solvedQuestions}문항</span>}
                                      </div>
                                    )}
                                    <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                                  </div>
                                </div>

                                {/* 진도 프로그레스 바 (그라데이션 입체화) */}
                                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                                  <div className="h-full rounded-full bg-[#0071E3] transition-all duration-500" style={{ width: `${percent}%` }} />
                                </div>

                                {/* 세부 계획 타임라인 */}
                                {isStudentReport && oneMonthPlans.length > 0 && (
                                  <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                      <span>최근 1개월 주간 학습 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                      <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">{planPercent}% 달성률</span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                      {oneMonthPlans.map(plan => (
                                        <button
                                          key={plan.id}
                                          type="button"
                                          onClick={() => updatePlanCompletion('book', b.id, plan.id, !plan.isCompleted)}
                                          aria-pressed={plan.isCompleted}
                                          className={`p-3 rounded-xl border text-left text-[10px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                            plan.isCompleted
                                              ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50'
                                              : 'border-slate-100 bg-white text-slate-600 hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03]'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center font-bold">
                                            <span>{plan.weekNumber}주차</span>
                                            {plan.isCompleted ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                            )}
                                          </div>
                                          <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                          <span className="font-extrabold text-[10px] tracking-tight text-slate-700 truncate">{plan.rangeText}</span>
                                          <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                          <span className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-black ${
                                            plan.isCompleted
                                              ? 'border-emerald-200 bg-white/70 text-emerald-700'
                                              : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3]'
                                          }`}>
                                            {plan.isCompleted ? '완료됨' : '완료'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 인강 리스트 */}
                    {sub.lectures.length > 0 && (
                      <div className="space-y-4 mt-6">
                        <h4 className="text-xs font-black text-slate-700 flex items-center">
                          <Tv className="w-4 h-4 mr-2 text-[#0071E3]" />
                          {isStudentReport ? '인강별 수강 스케줄 및 달성 지표' : '인강 진도 현황'}
                        </h4>

                        <div className="space-y-5">
                          {sub.lectures.map(l => {
                            const percent = l.totalLectures > 0 ? Math.round((l.completedLectures / l.totalLectures) * 100) : 0;
                            const oneMonthPlans = getOneMonthPlans(l.detailedPlans);
                            const totalPlans = oneMonthPlans.length;
                            const completedPlans = oneMonthPlans.filter(p => p.isCompleted).length;
                            const planPercent = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
                            const status = getPlanStatus(l.completedLectures, getExpectedAmountFromPlans(l.detailedPlans));
                            const paceComparison = formatPaceComparison(
                              getMaterialDailyPace(l.detailedPlans),
                              getMaterialBenchmark(materialBenchmarks, 'lecture', l.name)
                            );

                            return (
                              <div key={l.id} className="p-5 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/50 to-white space-y-4 shadow-sm">
                                <div className="flex justify-between items-start flex-wrap gap-2">
                                  <div>
                                    <h5 className="text-xs font-black text-slate-700">{l.name}</h5>
                                    {l.goalDescription && (
                                      <p className="text-[10px] text-[#0071E3] font-bold mt-1.5 flex items-center gap-1">
                                        <span>🏁</span> 수강 목표: {l.goalDescription}
                                      </p>
                                    )}
                                    {isStudentReport && paceComparison && (
                                      <p className="text-[10px] text-slate-500 font-bold mt-1.5">
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
                                      <span className="flex items-center gap-1 text-xs font-bold text-slate-500 group relative">
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
                                            className="w-14 rounded-md border border-dashed border-slate-300 bg-white pl-1.5 pr-4.5 py-0.5 text-center font-extrabold text-[#0071E3] hover:border-[#0071E3]/50 focus:border-[#0071E3] focus:border-solid focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                                            aria-label="수강 강수 입력"
                                          />
                                          <Pencil className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                                        </div>
                                        <span className="font-normal text-slate-300">/</span> {l.totalLectures}강
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900/95 text-[9px] text-white font-black rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10">
                                          ✏️ 숫자를 수정하여 직접 진도를 기록하세요
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-xs font-bold text-slate-500">{l.completedLectures} <span className="text-slate-300 font-normal">/</span> {l.totalLectures}강</span>
                                    )}
                                    <span className="rounded-lg bg-[#0071E3] px-2 py-0.5 text-[10px] font-black text-white shadow-sm">{percent}%</span>
                                  </div>
                                </div>

                                {/* 진도 프로그레스 바 (인강 그라데이션) */}
                                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                                  <div className="h-full rounded-full bg-[#F56300] transition-all duration-500" style={{ width: `${percent}%` }} />
                                </div>

                                {/* 세부 계획 타임라인 */}
                                {isStudentReport && oneMonthPlans.length > 0 && (
                                  <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                                      <span>최근 1개월 주간 수강 스케줄 ({completedPlans}/{totalPlans}주 완료)</span>
                                      <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/50">{planPercent}% 달성률</span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                      {oneMonthPlans.map(plan => (
                                        <button
                                          key={plan.id}
                                          type="button"
                                          onClick={() => updatePlanCompletion('lecture', l.id, plan.id, !plan.isCompleted)}
                                          aria-pressed={plan.isCompleted}
                                          className={`p-3 rounded-xl border text-left text-[10px] flex flex-col justify-between gap-2 transition-all duration-200 hover:scale-[1.02] shadow-[0_2px_6px_rgba(0,0,0,0.005)] ${
                                            plan.isCompleted
                                              ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-50'
                                              : 'border-slate-100 bg-white text-slate-600 hover:border-[#0071E3]/30 hover:bg-[#0071E3]/[0.03]'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center font-bold">
                                            <span>{plan.weekNumber}주차</span>
                                            {plan.isCompleted ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                            )}
                                          </div>
                                          <p className="text-slate-400 font-bold tracking-tight text-[8px]">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</p>
                                          <span className="font-extrabold text-[10px] tracking-tight text-slate-700 truncate">{plan.rangeText}</span>
                                          <span className="text-[8px] font-bold text-slate-400">일일 {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}</span>
                                          <span className={`mt-1 inline-flex h-6 items-center justify-center rounded-lg border text-[8px] font-black ${
                                            plan.isCompleted
                                              ? 'border-emerald-200 bg-white/70 text-emerald-700'
                                              : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3]'
                                          }`}>
                                            {plan.isCompleted ? '완료됨' : '완료'}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
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

            {isStudentReport && (
              <section id="student-requests" className={`scroll-mt-24 space-y-5 print-card ${activeTab === 'student-requests' ? '' : 'hidden print:block'}`}>
                <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 shadow-sm md:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
                        <Calendar className="h-3.5 w-3.5" /> 반차 신청
                      </div>
                      <h3 className="mt-2 text-xl font-black text-slate-900">
                        반차 · 휴가 · 건의사항
                      </h3>
                      <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
                        이번달 반차 <span className="font-black text-[#0071E3]">{homeHalfLeft}회</span> · 휴식권 <span className="font-black text-[#0071E3]">{homeFullLeft}회</span> 남음 · 쿠폰 {homeLeaveCoupons}개
                      </p>
                    </div>
                  </div>
                </div>

                {/* 휴가/반차/휴식권/병가 신청 (관리자에게) */}
                {(() => {
              const leaveRequests = student.leaveRequests || [];
              const leaveCoupons = student.leaveCoupons ?? 0;
              const selMonth = yearMonthOf(leaveForm.date) || kstYearMonth();
              const usage = getMonthlyLeaveUsage(leaveRequests, selMonth);
              const halfLeft = Math.max(0, MONTHLY_HALFDAY_QUOTA - usage.halfday);
              const fullLeft = Math.max(0, MONTHLY_FULLDAY_QUOTA - usage.fullday);
              const selCat = LEAVE_TYPES[leaveForm.type].category;
              const overQuota = (selCat === 'halfday' && halfLeft <= 0) || (selCat === 'fullday' && fullLeft <= 0);
              const isSick = selCat === 'sick';
              const monthLabel = selMonth.replace('-', '. ') + '월';
              const leaveStatusBadge = (s: string, reply?: string) => getTimelineStatusBadge(s, reply);
              return (
                <div id="student-leave-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                      <Calendar className="w-4 h-4" /> 휴가 · 반차 · 휴식권 신청
                    </h4>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      신청하면 담당 코치가 검토 후 승인해요. 병가는 영수증을 밴드 채팅으로 따로 증빙해 주세요.
                    </p>
                  </div>

                  {/* 이번 달(선택일 기준) 잔여 한도 + 병가 사용 + 쿠폰 */}
                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">반차 잔여</p>
                      <p className="mt-0.5 text-sm font-black text-[#0071E3]">{halfLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">휴식권 잔여</p>
                      <p className="mt-0.5 text-sm font-black text-[#0071E3]">{fullLeft}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">병가(이번달)</p>
                      <p className="mt-0.5 text-sm font-black text-slate-700">🤒 {usage.sick}<span className="text-[10px] font-bold text-slate-400">건</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">쿠폰</p>
                      <p className="mt-0.5 text-sm font-black text-slate-700">🎟️ {leaveCoupons}</p>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 -mt-1.5">{monthLabel} 기준 · 병가는 한도 무관(영수증 밴드 증빙) · 반차 추가는 쿠폰 {COUPONS_PER_EXTRA_HALFDAY}개 필요</p>

                  {/* 종류 선택 */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LEAVE_TYPE_ORDER.map((t) => {
                      const info = LEAVE_TYPES[t];
                      const active = leaveForm.type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setLeaveForm((f) => ({ ...f, type: t }))}
                          className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.97] ${active ? 'border-[#0071E3] bg-[#0071E3]/[0.06] shadow-sm' : 'border-slate-200 bg-white hover:border-[#0071E3]/40'}`}
                        >
                          <span className="text-[12px] font-black text-slate-700">{info.icon} {info.label}</span>
                          <span className="text-[10px] font-bold text-slate-400">{info.slot}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 날짜 + 사유 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="shrink-0 text-[11px] font-black text-slate-500">사용일</label>
                      <input
                        type="date"
                        value={leaveForm.date}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                      />
                    </div>
                    <textarea
                      value={leaveForm.reason}
                      onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                      placeholder={isSick ? '병가 사유를 적어 주세요. 영수증은 밴드 채팅으로 따로 보내 주세요.' : '사유 (선택) — 예) 병원 진료, 가족 행사'}
                      rows={2}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                    />
                  </div>

                  {/* 안내/경고 */}
                  {isSick && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[10px] font-semibold text-amber-800">
                      🤒 병가는 월 한도와 무관하지만, <b>영수증/진단서를 밴드 채팅으로 반드시 증빙</b>해 주세요.
                    </div>
                  )}
                  {!isSick && overQuota && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[10px] font-semibold text-amber-800">
                      이번 달 {selCat === 'halfday' ? '반차' : '휴식권'}를 모두 사용했어요.
                      {selCat === 'halfday' ? ` 추가가 필요하면 쿠폰 ${COUPONS_PER_EXTRA_HALFDAY}개로 신청 가능합니다 — 밴드 채팅으로 문의 후 쿠폰을 제출해 주세요.` : ' 추가가 필요하면 밴드 채팅으로 문의해 주세요.'}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={submitLeave}
                    disabled={leaveSubmitting || (!isSick && overQuota)}
                    className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
                  >
                    {leaveSubmitting ? '신청 중...' : (!isSick && overQuota) ? '한도 초과 (밴드 채팅 문의)' : `${getLeaveTypeLabel(leaveForm.type)} 신청하기`}
                  </button>
                  {leaveError && <p className="text-[10px] font-bold text-red-500">{leaveError}</p>}

                  {(() => {
                    const pending = leaveRequests.filter(r => r.status === 'pending');
                    const completed = leaveRequests.filter(r => r.status !== 'pending');
                    return (
                      (pending.length > 0 || completed.length > 0) && (
                        <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 휴가 신청 내역</p>
                          
                          {/* 대기중 휴가 */}
                          {pending.map((r) => (
                            <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{LEAVE_TYPES[r.type]?.icon} {getLeaveTypeLabel(r.type)}</span>
                                  <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                                  {leaveStatusBadge(r.status, r.adminReply)}
                                </span>
                                <button type="button" onClick={() => cancelLeave(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="신청 취소">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              {r.reason && <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.reason}</p>}
                              {r.adminReply && (
                                <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                  💬 코치 답변: {r.adminReply}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* 지난 휴가 내역 보기 */}
                          {completed.length > 0 && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => setShowLeaveHistory(!showLeaveHistory)}
                                className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                              >
                                <span>지난 휴가 신청 보기 ({completed.length}건)</span>
                                <span className="text-[10px]">{showLeaveHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                              </button>

                              {showLeaveHistory && (
                                <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                                  {completed.map((r) => (
                                    <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 border border-slate-200">{LEAVE_TYPES[r.type]?.icon} {getLeaveTypeLabel(r.type)}</span>
                                          <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                                          {leaveStatusBadge(r.status, r.adminReply)}
                                        </span>
                                      </div>
                                      {r.reason && <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500">{r.reason}</p>}
                                      {r.adminReply && (
                                        <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                          💬 코치 답변: {r.adminReply}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    );
                  })()}
                </div>
              );
                })()}

                {/* 건의사항 (관리자에게) */}
                <div id="student-suggestion-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
                    <MessageSquare className="w-4 h-4" /> 건의사항
                  </h4>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    시설, 운영, 학습 환경에 대한 의견을 남기면 담당 코치가 확인해요.
                  </p>
                </div>
                <div className="space-y-2">
                  <textarea
                    value={suggestionMessage}
                    onChange={(e) => setSuggestionMessage(e.target.value)}
                    placeholder="건의 내용을 적어 주세요. 예) 자습실 조명이 조금 어두워요"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                  />
                  <button
                    type="button"
                    onClick={submitSuggestion}
                    disabled={suggestionSubmitting}
                    className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
                  >
                    {suggestionSubmitting ? '등록 중...' : '건의사항 등록'}
                  </button>
                  {suggestionError && <p className="text-[10px] font-bold text-red-500">{suggestionError}</p>}
                </div>

                {(() => {
                  const suggestions = student.suggestionRequests || [];
                  const pending = suggestions.filter(r => r.status !== 'resolved');
                  const resolved = suggestions.filter(r => r.status === 'resolved');
                  return (
                    (pending.length > 0 || resolved.length > 0) && (
                      <div className="space-y-2 border-t border-[#0071E3]/10 pt-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">내 건의사항 내역</p>
                        
                        {/* 대기중 건의사항 */}
                        {pending.map((r) => (
                          <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">건의사항</span>
                                {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                              </span>
                              <button type="button" onClick={() => cancelSuggestion(r.id)} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="건의사항 취소">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.content}</p>
                            {r.adminReply && (
                              <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                💬 코치 답변: {r.adminReply}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 지난 건의 내역 보기 */}
                        {resolved.length > 0 && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setShowSuggestionHistory(!showSuggestionHistory)}
                              className="flex w-full items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-2 text-left text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:border-slate-300"
                            >
                              <span>지난 건의 내역 보기 ({resolved.length}건)</span>
                              <span className="text-[10px]">{showSuggestionHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                            </button>

                            {showSuggestionHistory && (
                              <div className="space-y-2 pl-1 border-l-2 border-slate-100 ml-1">
                                {resolved.map((r) => (
                                  <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 border border-slate-200">건의사항</span>
                                        {getTimelineStatusBadge(r.status || 'resolved', r.adminReply)}
                                        <span className="shrink-0 text-[10px] font-bold text-slate-400">{r.date || (r.createdAt ? r.createdAt.split('T')[0] : '')}</span>
                                      </span>
                                    </div>
                                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500">{r.content}</p>
                                    {r.adminReply && (
                                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                                        💬 코치 답변: {r.adminReply}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  );
                })()}
                </div>
              </section>
            )}

            {/* 휴가/반차/휴식권/병가 사용 현황 (학부모 읽기 전용) */}
            {isParentReport && (() => {
              const leaveRequests = student.leaveRequests || [];
              if (leaveRequests.length === 0) return null;
              const month = kstYearMonth();
              const usage = getMonthlyLeaveUsage(leaveRequests, month);
              const monthLabel = month.replace('-', '. ') + '월';
              const leaveStatusBadge = (s: string, reply?: string) => getTimelineStatusBadge(s, reply);
              return (
                <div className="print-card rounded-3xl border border-slate-100 bg-white p-5 md:p-6 shadow-sm space-y-4">
                  <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#0071E3]" /> 휴가 · 반차 · 휴식권 사용 현황
                  </h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">반차 사용</p>
                      <p className="mt-0.5 text-sm font-black text-[#0071E3]">{usage.halfday}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_HALFDAY_QUOTA}</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">휴식권 사용</p>
                      <p className="mt-0.5 text-sm font-black text-[#0071E3]">{usage.fullday}<span className="text-[10px] font-bold text-slate-400">/{MONTHLY_FULLDAY_QUOTA}</span></p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-2 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">병가</p>
                      <p className="mt-0.5 text-sm font-black text-slate-700">🤒 {usage.sick}<span className="text-[10px] font-bold text-slate-400">건</span></p>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 -mt-1.5">{monthLabel} 기준 · 병가는 한도와 무관하며 영수증을 밴드 채팅으로 증빙합니다.</p>
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">신청 내역</p>
                    {leaveRequests.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-500 ring-1 ring-slate-100">{LEAVE_TYPES[r.type]?.icon} {getLeaveTypeLabel(r.type)}</span>
                          <span className="shrink-0 text-[10px] font-bold text-slate-500">{r.date}</span>
                          {leaveStatusBadge(r.status, r.adminReply)}
                        </div>
                        {r.reason && <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.reason}</p>}
                        {r.adminReply && (
                          <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                            💬 코치 답변: {r.adminReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          {/* 4. 성적 및 모의고사 분석 결과 */}
          <div id="grade-analysis" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'grade-analysis' ? '' : 'hidden print:block'}`}>
            <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              모의고사 성적 추이 및 주간 테스트 분석 결과
            </h3>

            {isStudentReport && (
              <form onSubmit={submitGrade} className="no-print p-4 rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-[#0071E3]">
                  <Plus className="w-3.5 h-3.5" /> 성적 직접 입력
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={gradeForm.subject}
                    onChange={(e) => setGradeForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="과목 (예: 국어)"
                    list="grade-subject-options"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                  />
                  <datalist id="grade-subject-options">
                    {[...new Set((student.subjects || []).map((s) => s.name).filter(Boolean))].map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <input
                    value={gradeForm.testName}
                    onChange={(e) => setGradeForm((f) => ({ ...f, testName: e.target.value }))}
                    placeholder="시험명 (예: 6월 모평)"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={gradeForm.score}
                    onChange={(e) => setGradeForm((f) => ({ ...f, score: e.target.value }))}
                    placeholder="점수"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                  />
                  <input
                    type="date"
                    value={gradeForm.date}
                    onChange={(e) => setGradeForm((f) => ({ ...f, date: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0"
                  />
                </div>
                {gradeError && <p className="text-[10px] font-bold text-red-500">{gradeError}</p>}
                <button
                  type="submit"
                  disabled={gradeSubmitting}
                  className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
                >
                  {gradeSubmitting ? '저장 중...' : '성적 추가하기'}
                </button>
              </form>
            )}

            {student.grades.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                <Calendar className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-bold text-slate-400">아직 성적 기록이 없어요.</p>
                <p className="text-[10px] text-slate-400/80 font-semibold">위 입력란에서 직접 추가하거나, 테스트 후 관리자가 입력하면 추이 그래프가 나타나요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                
                {/* 성적 차트 시각화 */}
                <div className={`${isStudentReport ? 'md:col-span-2' : 'md:col-span-3'} p-5 rounded-3xl bg-slate-50/70 border border-slate-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)]`}>
                  <h4 className="text-[10px] font-black text-slate-400 tracking-wider uppercase mb-4">학습 과목 성적 향상 곡선</h4>
                  {mounted && chartData.length > 0 ? (
                    <div className="w-full h-[230px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.6)" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748B', fontWeight: 'bold' }} />
                          <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '16px', border: '1px solid rgba(226,232,240,0.8)', backgroundColor: '#ffffff', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' }} />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 10, fontWeight: 'bold', fill: '#1E293B' }} />
                          {/* 5회 가중평균 추세선 렌더링 */}
                          <Line
                            type="monotone"
                            dataKey="추세선"
                            name="5회 가중평균 추세 (전체)"
                            stroke="#86868B"
                            strokeWidth={2.5}
                            strokeDasharray="5 5"
                            dot={false}
                            connectNulls={true}
                          />
                          {gradeSubjects.map((subject, idx) => {
                            const colors: Record<string, string> = {
                              '국어': '#0071E3',
                              '수학': '#0071E3',
                              '영어': '#F56300',
                              '한국사': '#10B981',
                              '기타': '#EF4444'
                            };
                            const defaultColors = ['#0071E3', '#0071E3', '#F56300', '#10B981', '#86868B', '#0071E3', '#EF4444'];
                            return (
                              <Line 
                                key={subject}
                                type="monotone" 
                                dataKey={subject} 
                                name={subject}
                                stroke={colors[subject] || defaultColors[idx % defaultColors.length]} 
                                strokeWidth={2.5} 
                                activeDot={{ r: 5 }} 
                                dot={{ strokeWidth: 2, r: 3.5 }} 
                                connectNulls={true}
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[190px] flex items-center justify-center text-xs text-slate-400 font-semibold">차트 모듈 구성하는 중...</div>
                  )}
                </div>

                {/* 성적 목록 요약 */}
                {isStudentReport && (
                  <div className="p-5 rounded-3xl border border-slate-100 bg-white space-y-3.5 flex flex-col justify-between max-h-[280px] print:max-h-none shadow-sm">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 tracking-wider uppercase border-b border-slate-100 pb-2">최근 실시한 시험 목록</h4>
                      <div className="space-y-3 mt-3 overflow-y-auto max-h-[160px] pr-1 print:max-h-none print:overflow-visible print:pr-0">
                        {[...student.grades].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(g => (
                          <div key={g.id} className="flex justify-between items-center text-[10px] border-b border-slate-100/50 pb-2">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0">{g.subject}</span>
                              <span className="text-slate-500 font-semibold truncate max-w-[80px]">{g.testName}</span>
                              {g.source === 'student' && <span className="shrink-0 text-[7px] font-black text-[#0071E3] bg-[#0071E3]/10 px-1.5 py-0.5 rounded-full">직접</span>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-black text-[#0071E3]">{g.score}점</span>
                              {g.source === 'student' && (
                                <button type="button" onClick={() => deleteGrade(g.id)} className="no-print text-slate-300 hover:text-red-500 transition-colors" aria-label="성적 삭제">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {student.grades.length > 5 && (
                      <p className="text-[8px] text-slate-400 italic text-center font-bold">누적 성적 테스트 기록 총 {student.grades.length}건 보존 중</p>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* 성적 하락 격려 위젯 */}
            {isStudentReport && (() => {
              const dropInfo = detectScoreDrop();
              if (!dropInfo) return null;
              return (
                <div className="no-print mt-4 p-5 rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                      <span>🧡</span> 이번 {dropInfo.subject} 시험은 조금 아쉬웠지만 괜찮아요!
                    </h4>
                    <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                      이전 시험({dropInfo.prevScore}점) 대비 점수가 약 <span className="text-[#F56300] font-black">{dropInfo.dropPercent}%</span> 하락({dropInfo.currentScore}점)한 것으로 분석되었습니다. 
                      공부법이나 취약 유형을 분석하고 보완하면 다음 시험에서는 충분히 극복할 수 있습니다. 
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('student-requests');
                        setRequestCustomOpen(true);
                        setRequestForm({
                          requestType: 'etc',
                          message: `${dropInfo.subject} 성적 보완을 위한 1:1 약점 피드백 상담을 신청합니다. (최근 시험: ${dropInfo.testName} ${dropInfo.currentScore}점)`
                        });
                        setTimeout(() => {
                          window.scrollTo({ top: document.getElementById('student-requests')?.offsetTop || 0, behavior: 'smooth' });
                        }, 100);
                      }}
                      className="rounded-xl bg-[#F56300] hover:bg-[#E05200] text-white px-3.5 py-2 text-[10px] font-black transition active:scale-[0.98] shadow-sm flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      1:1 약점 피드백 상담 신청
                    </button>
                    <a
                      href="https://band.us"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3.5 py-2 text-[10px] font-bold transition shadow-sm flex items-center gap-1"
                    >
                      💬 밴드 톡 바로가기
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* 오답 실수 유형 취약성 진단 차트 */}
            {(() => {
              const aggregatedTags = {
                calculation_error: 0,
                time_limit: 0,
                misread_condition: 0,
                concept_leak: 0
              };

              (student.subjects || []).forEach(s => {
                (s.books || []).forEach(b => {
                  if (b.incorrectTags) {
                    aggregatedTags.calculation_error += Number(b.incorrectTags.calculation_error || 0);
                    aggregatedTags.time_limit += Number(b.incorrectTags.time_limit || 0);
                    aggregatedTags.misread_condition += Number(b.incorrectTags.misread_condition || 0);
                    aggregatedTags.concept_leak += Number(b.incorrectTags.concept_leak || 0);
                  }
                });
              });

              const totalIncorrect = Object.values(aggregatedTags).reduce((a, b) => a + b, 0);

              const pieData = [
                { name: '연산실수', value: aggregatedTags.calculation_error },
                { name: '시간부족', value: aggregatedTags.time_limit },
                { name: '조건오독', value: aggregatedTags.misread_condition },
                { name: '개념부족', value: aggregatedTags.concept_leak }
              ].filter(d => d.value > 0);

              const COLORS = {
                '연산실수': '#EF4444',
                '시간부족': '#F56300',
                '조건오독': '#FBBF24',
                '개념부족': '#0071E3'
              };

              return (
                <div className="mt-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">오답 원인 분석 (취약성 진단)</h4>
                      <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">교재 학습 과정에서 직접 등록된 실수 요인 비율</p>
                    </div>
                    {totalIncorrect > 0 && (
                      <span className="text-[9px] font-extrabold text-[#0071E3] bg-[#0071E3]/5 px-2 py-0.5 rounded-lg border border-[#0071E3]/10">
                        총 오답 기록: {totalIncorrect}건
                      </span>
                    )}
                  </div>

                  {totalIncorrect === 0 ? (
                    <div className="py-8 px-4 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5">
                      <p className="text-xs font-bold text-slate-400">아직 오답 원인 분석 데이터가 부족합니다.</p>
                      <p className="text-[10px] text-slate-400/80 font-semibold">학습 진도 영역의 교재 목록에서 푼 문항 수 아래에 있는 '오답 사유 추가' 단추들을 눌러서 실수의 원인을 등록해보세요!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="relative w-full h-[150px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={60}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || '#86868B'} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute text-center">
                          <p className="text-sm font-black text-slate-800">{totalIncorrect}건</p>
                          <p className="text-[8px] font-bold text-slate-400">오답 총합</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {pieData.map((d) => {
                          const pct = ((d.value / totalIncorrect) * 100).toFixed(1);
                          return (
                            <div key={d.name} className="flex justify-between items-center text-xs font-bold">
                              <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[d.name as keyof typeof COLORS] }} />
                                {d.name}
                              </span>
                              <span className="text-slate-700">
                                {d.value}건 <span className="text-[10px] font-semibold text-slate-400">({pct}%)</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 5. 하단 격려 메세지 배너 (탭 레이아웃에선 개요 탭에만 노출, 인쇄 시 전체 노출) */}
          <div className={`bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white p-7 rounded-[24px] text-center space-y-2 relative overflow-hidden shadow-lg border border-slate-800/40 ${!isStudentReport || activeTab === 'report-overview' ? '' : 'hidden print:block'}`}>
            <div className="absolute top-0 left-0 h-1 w-full bg-[#0071E3]" />
            <p className="text-[10px] font-black tracking-[0.2em] text-[#3894FF] uppercase">Supreme Spartan Control System</p>
            <p className="text-xs font-semibold leading-relaxed opacity-95 text-balance tracking-tight">
              "타협 없는 철저한 관리만이 합격을 증명합니다. SSC 스파르타는 마지막 1분 1초까지 원생의 성공을 완벽하게 동행합니다."
            </p>
          </div>

        </div>

        {/* 하단 카피라이트 (인쇄 미포함) */}
        <div className="no-print text-center text-[10px] text-slate-400 pb-8">
          이 결과 브리핑 리포트는 SSC 스파르타 관리형 학습센터의 공식 학원 관리 솔루션을 사용하여 실시간으로 보안 출력되었습니다.
        </div>

      </div>
      </div>
    </div>
  );
}
