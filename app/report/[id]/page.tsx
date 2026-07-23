'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReportState } from '@/hooks/use-report-state';
import { StudentLayout } from '@/components/report/student-layout';
import { NotificationsSection } from '@/components/report/notifications-section';
import { HomeOverviewTab } from '@/components/report/home-overview-tab';
import { PomodoroTimer } from '@/components/report/pomodoro-timer-modal';
import { TimetableTab } from '@/components/report/timetable-tab';
import { ExecutionPlanTab } from '@/components/report/execution-plan-tab';
import { SubjectProgressTab } from '@/components/report/subject-progress-tab';
import { LearningRequestPanel } from '@/components/report/learning-request-panel';
import { MakeupTab } from '@/components/report/makeup-tab';
import { WrongAnswerTab } from '@/components/report/wrong-answer-tab';
import { GradeAnalysisTab } from '@/components/report/grade-analysis-tab';
import { ConsultationTab, type ApplicationSubTab } from '@/components/report/consultation-tab';
import { StudentChatPanel } from '@/components/report/student-chat-panel';
import { ConsultationBookingPanel } from '@/components/report/consultation-booking-panel';
import { isConsultationCampus } from '@/lib/consultation-schedule';
import { PenaltiesTab } from '@/components/report/penalties-tab';
import { CouponTab } from '@/components/report/coupon-tab';
import { MockExamNotice } from '@/components/report/mock-exam-notice';
import { OtEventNotice } from '@/components/report/ot-event-notice';
import { StudentCalendarTab } from '@/components/report/student-calendar-tab';
import { CampusEventNotice } from '@/components/report/campus-event-notice';
import { MealPlanNotice, type MealPlanWithOrder } from '@/components/report/meal-plan-notice';
import { MaterialDetailSheet } from '@/components/report/material-detail-sheet';
import { DailyWrongQuiz } from '@/components/report/daily-wrong-quiz';
import { SaturdayLateExcuseNotice } from '@/components/report/saturday-late-excuse-notice';
import { Loader2, AlertCircle, BookOpen, Shield, Timer, CalendarDays } from 'lucide-react';
import { TabHero } from '@/components/report/tab-hero';
import type { MockExam, OtEvent, CampusEvent, SaturdayLateExcuse, Student, SubjectProgress, BookProgress, LectureProgress } from '@/lib/types/student';

type LearningSubTab = 'timetable' | 'execution-plan' | 'subject-progress' | 'makeup' | 'grade-analysis';
type LifeSubTab = 'attendance-status' | 'study-stats' | 'student-penalties' | 'student-coupons';

const LEARNING_SUB_TABS: Array<{ id: LearningSubTab; label: string; meta: string }> = [
  { id: 'timetable', label: '오늘 계획', meta: '시간표 기준' },
  { id: 'execution-plan', label: '학습계획', meta: '주간 계획' },
  { id: 'subject-progress', label: '과목별 진도', meta: '교재/인강' },
  { id: 'makeup', label: '보강', meta: '휴가 보강' },
  { id: 'grade-analysis', label: '성적분석', meta: '시험 기록' },
];

const LIFE_SUB_TABS: Array<{ id: LifeSubTab; label: string; meta: string }> = [
  { id: 'attendance-status', label: '등하원', meta: '오늘 출결' },
  { id: 'study-stats', label: '순공/랭킹', meta: '학습 시간' },
  { id: 'student-penalties', label: '벌점', meta: '생활 기록' },
  { id: 'student-coupons', label: '쿠폰', meta: '지급·교환' },
];

const LEARNING_TAB_IDS = LEARNING_SUB_TABS.map((tab) => tab.id);
const LIFE_TAB_IDS = LIFE_SUB_TABS.map((tab) => tab.id);
// 신청(#student-requests) 컨테이너의 서브탭 — 화면에 보이는 탭 id 를 그대로 딥링크로 쓸 수 있게 한다.
// (기존 별칭 clinic-booking·coupon-exchange·student-suggestions 는 하위호환으로 계속 유지)
const REQUEST_SUB_TABS: ApplicationSubTab[] = ['learning-request', 'leave', 'consultation', 'suggestion', 'coupon'];

function StudentReportInner() {
  const [pendingMockExams, setPendingMockExams] = useState<MockExam[]>([]);
  const [pendingOtEvents, setPendingOtEvents] = useState<OtEvent[]>([]);
  const [pendingCampusEvents, setPendingCampusEvents] = useState<CampusEvent[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanWithOrder[]>([]);
  // 미션 탭은 첫 활성화 때 마운트(그때 API 호출) — 초기 로딩을 가볍게 유지한다.
  const [requestSubTab, setRequestSubTab] = useState<ApplicationSubTab>('leave');
  const [learningSubTab, setLearningSubTab] = useState<LearningSubTab>('timetable');
  const [lifeSubTab, setLifeSubTab] = useState<LifeSubTab>('attendance-status');

  // 알림(모의고사·OT·참여행사·도시락) 재조회 — 마운트 + 포커스/가시성 복귀 + 주기 폴링에서 공용 호출.
  // 학생이 응답(아래 handler)하면 seq 를 올려, 그 전에 출발한 stale 응답이 방금 사라진 항목을 되살리지 못하게 막는다.
  const pendingSeqRef = useRef(0);
  const loadPending = useCallback(async () => {
    const seq = pendingSeqRef.current;
    const fresh = () => pendingSeqRef.current === seq;
    try {
      const [examRes, otRes, campusRes, mealRes] = await Promise.all([
        fetch('/api/student/mock-exams', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/student/ot-events', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/student/campus-events', { credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/student/meal-plans', { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      if (examRes.ok) {
        const json = await examRes.json();
        if (fresh() && json.success) setPendingMockExams(json.exams || []);
      }
      if (otRes.ok) {
        const json = await otRes.json();
        if (fresh() && json.success) setPendingOtEvents(json.events || []);
      }
      if (campusRes.ok) {
        const json = await campusRes.json();
        if (fresh() && json.success) setPendingCampusEvents(json.events || []);
      }
      if (mealRes.ok) {
        const json = await mealRes.json();
        if (fresh() && json.success) setMealPlans(json.plans || []);
      }
    } catch {}
  }, []);

  // 최초 1회 로드
  useEffect(() => { loadPending(); }, [loadPending]);

  // 새로고침 없이 알림 반영: 포커스/가시성 복귀(20초 스로틀) + 화면이 보일 때 60초 폴링.
  useEffect(() => {
    let last = Date.now(); // 마운트 직후 첫 포커스 즉시 재조회 방지
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 20_000) return;
      last = now;
      loadPending();
    };
    const poll = () => { if (document.visibilityState === 'visible') { last = Date.now(); loadPending(); } };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const iv = setInterval(poll, 60_000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(iv);
    };
  }, [loadPending]);

  const handleMealSaved = useCallback((planId: string, order: import('@/lib/types/student').MealOrder) => {
    pendingSeqRef.current += 1;
    setMealPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, myOrder: order } : p)));
  }, []);

  const handleMockExamResponded = useCallback((examId: string) => {
    pendingSeqRef.current += 1;
    setPendingMockExams((prev) => prev.filter((e) => e.id !== examId));
  }, []);

  const handleOtEventResponded = useCallback((eventId: string) => {
    pendingSeqRef.current += 1;
    setPendingOtEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const handleCampusEventResponded = useCallback((eventId: string) => {
    pendingSeqRef.current += 1;
    setPendingCampusEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const {
    shareTokenParam,
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
    loading,
    error,
    mounted,
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
    cancelSuggestion,
    sendChatMessage,
    chatSending,
    markChatRead,
    chatTimeline,
    chatUnreadCount,
    refreshCore,
    checklistForm,
    setChecklistForm,
    checklistSubmitting,
    rewardBanner,
    setRewardBanner,
    completedQuests,
    setCompletedQuests,
    showRequestHistory,
    setShowRequestHistory,
    showLeaveHistory,
    setShowLeaveHistory,
    leaveForm,
    setLeaveForm,
    leaveSubmitting,
    leaveError,
    submitLeave,
    cancelLeave,
    reappealLeave,
    homeAttend,
    handlePrint,
    handleLogout,
    chartData,
    gradeSubjects,
    todaySubjects,
    timeGreeting,
    currentSubjectText,
    currentBriefingPhrase,
    briefingSubMessage,
    currentStudyLabel,
    homeHalfLeft,
    homeFullLeft,
    homeLeaveCoupons,
    homeFocusMin,
    homeStayMin,
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
    formatNotificationDate,
    notificationCount,
    notificationPreview,
    studentNotifications,
    dismissedStudentNotifications,
    dismissNotification,
    dismissAllNotifications,
    restoreNotification,
    restoreAllNotifications,
    reportNavItems,
    tabIds,
    daysUntilEnrollmentEnd,
    showEnrollmentWarning,
    isEnrollmentExpiredLocked,
    handleSwipeStart,
    handleSwipeEnd,
    updateBookSolvedQuestions,
    updateProgress,
    updatePlanCompletion,
    updateDeadlineProgress,
    deadlineGoals,
    saveMakeupDone,
    adjustStartPoint,
    submitChecklist,
    studyTimeLabels,
    weekDaySlots,
    studyTimeSlots,
    currentMinutes,
    todayDayKey,
    isLectureTime,
    realignStudentPlans,
    realigningPlans,
    mockExams,
    whyConsultation,
    consultationBookings,
    consultationHistory,
  } = useReportState();

  // 서브탭 raw id(예: timetable, attendance-status, clinic-booking)를 컨테이너 탭으로 승격하고
  // 해당 서브상태를 맞춘다. 처리했으면 true. effect(진입 보정)와 selectReportTab(자식 콜백) 공용.
  const applyContainerTab = useCallback((tabId: string): boolean => {
    if ((LEARNING_TAB_IDS as string[]).includes(tabId)) {
      setLearningSubTab(tabId as LearningSubTab);
      setActiveTab('learning');
      return true;
    }
    if ((LIFE_TAB_IDS as string[]).includes(tabId)) {
      setLifeSubTab(tabId as LifeSubTab);
      setActiveTab('life');
      return true;
    }
    if ((REQUEST_SUB_TABS as string[]).includes(tabId)) {
      setRequestSubTab(tabId as ApplicationSubTab);
      setActiveTab('student-requests');
      return true;
    }
    if (tabId === 'clinic-booking') {
      setRequestSubTab('consultation');
      setActiveTab('student-requests');
      return true;
    }
    return false;
  }, [setActiveTab]);

  useEffect(() => {
    if (applyContainerTab(activeTab)) return;
    if (activeTab === 'coupon-exchange') {
      setRequestSubTab('coupon');
      setActiveTab('student-requests');
    }
    if (activeTab === 'student-suggestions') {
      setRequestSubTab('suggestion');
      setActiveTab('student-requests');
    }
  }, [activeTab, setActiveTab, applyContainerTab]);

  const selectReportTab = useCallback((tabId: string) => {
    if (applyContainerTab(tabId)) return;
    setActiveTab(tabId);
  }, [setActiveTab, applyContainerTab]);

  const openWeeklyPlanTab = useCallback(() => {
    selectReportTab('execution-plan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectReportTab]);

  // 주말 보강 특이사항 딥링크 — 보강 원장/입력이 있는 '보강' 서브탭으로(실행계획 아님).
  const openMakeupTab = useCallback(() => {
    selectReportTab('makeup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectReportTab]);

  // 홈 '확인할 특이사항' 패널 딥링크 — 알림/상담/휴가 신청 탭으로 이동.
  const openNotificationsTab = useCallback(() => {
    setActiveTab('student-notifications');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setActiveTab]);
  const openConsultationTab = useCallback(() => {
    selectReportTab('clinic-booking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectReportTab]);
  const openLeaveRequestsTab = useCallback(() => {
    setRequestSubTab('leave');
    setActiveTab('student-requests');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setActiveTab, setRequestSubTab]);

  // ── 자료(교재/인강) 상세 시트 — 학생 뷰 전용. 딥링크: ?material=<materialId>&mtype=book|lecture ──
  const searchParams = useSearchParams();
  const [materialSheet, setMaterialSheet] = useState<{ materialType: 'book' | 'lecture'; materialId: string } | null>(null);
  // 최초 진입 URL 의 ?material= 파라미터 — 학생 로드 후 1회 소비(replaceState 는 useSearchParams 를 안 갱신하므로 초깃값 캡처).
  const [pendingMaterialParam] = useState<{ id: string; mtype: string | null } | null>(() => {
    const id = searchParams.get('material');
    return id ? { id, mtype: searchParams.get('mtype') } : null;
  });
  // 딥링크 소비 완료 여부 — 소비 전에는 URL 정리(파라미터 삭제)를 하지 않는다.
  const materialConsumedRef = useRef(pendingMaterialParam === null);

  // 자료 존재 확인 — 없는 id 는 조용히 무시. mtype 미지정이면 교재 → 인강 순으로 탐색.
  const findMaterial = useCallback(
    (materialId: string, mtype?: string): { materialType: 'book' | 'lecture'; materialId: string } | null => {
      if (!student) return null;
      const subjects: SubjectProgress[] = student.subjects || [];
      const hasBook =
        subjects.some((s) => (s.books || []).some((b) => b.id === materialId)) ||
        ((student.books || []) as BookProgress[]).some((b) => b.id === materialId);
      const hasLecture =
        subjects.some((s) => (s.lectures || []).some((l) => l.id === materialId)) ||
        ((student.lectures || []) as LectureProgress[]).some((l) => l.id === materialId);
      if (mtype === 'book') return hasBook ? { materialType: 'book', materialId } : null;
      if (mtype === 'lecture') return hasLecture ? { materialType: 'lecture', materialId } : null;
      if (hasBook) return { materialType: 'book', materialId };
      if (hasLecture) return { materialType: 'lecture', materialId };
      return null;
    },
    [student],
  );

  const openMaterialDetail = useCallback((materialType: 'book' | 'lecture', materialId: string) => {
    materialConsumedRef.current = true;
    setMaterialSheet({ materialType, materialId });
  }, []);
  const closeMaterialDetail = useCallback(() => setMaterialSheet(null), []);

  // 딥링크 소비 — 학생 데이터 로드 후 1회. 존재하지 않는 자료면 시트를 열지 않고 파라미터만 정리.
  useEffect(() => {
    if (!isStudentReport || !student || !pendingMaterialParam || materialConsumedRef.current) return;
    materialConsumedRef.current = true;
    const found = findMaterial(pendingMaterialParam.id, pendingMaterialParam.mtype || undefined);
    if (found) {
      setMaterialSheet(found);
    } else if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('material');
      url.searchParams.delete('mtype');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [isStudentReport, student, pendingMaterialParam, findMaterial]);

  // 시트 상태 ↔ URL 동기화 — ?tab= 동기화(use-report-state)와 같은 replaceState 패턴(히스토리 오염 없음).
  useEffect(() => {
    if (!isStudentReport || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const currentId = url.searchParams.get('material');
    const currentType = url.searchParams.get('mtype');
    if (materialSheet) {
      if (currentId === materialSheet.materialId && currentType === materialSheet.materialType) return;
      url.searchParams.set('material', materialSheet.materialId);
      url.searchParams.set('mtype', materialSheet.materialType);
    } else {
      if (currentId === null && currentType === null) return;
      if (!materialConsumedRef.current) return; // 딥링크 소비 전(로딩 중)에는 파라미터를 지우지 않음
      url.searchParams.delete('material');
      url.searchParams.delete('mtype');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, [materialSheet, isStudentReport]);

  // 탭을 바꾸면 자료 상세 시트(전체 오버레이)를 닫는다 — 새 탭 위에 계속 떠 있는 버그 방지.
  // 최초 렌더는 건너뛴다(딥링크로 시트를 연 채 진입하는 경우 보존).
  const materialSheetTabRef = useRef(false);
  useEffect(() => {
    if (!materialSheetTabRef.current) { materialSheetTabRef.current = true; return; }
    setMaterialSheet(null);
  }, [activeTab]);

  // 시트 하단 연결 링크 — 기존 탭 전환 콜백(selectReportTab) 재사용.
  const openSubjectProgressFromSheet = useCallback(() => {
    const id = materialSheet?.materialId;
    setMaterialSheet(null);
    selectReportTab('subject-progress');
    setTimeout(() => {
      if (id) document.getElementById(`material-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [materialSheet, selectReportTab]);
  const openTimetableFromSheet = useCallback(() => {
    setMaterialSheet(null);
    selectReportTab('timetable');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectReportTab]);
  const openChangeRequestFromSheet = useCallback(() => {
    setMaterialSheet(null);
    selectReportTab('subject-progress');
    setTimeout(() => {
      document.getElementById('student-request-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  }, [selectReportTab]);

  const learningActiveTab = activeTab === 'learning' ? learningSubTab : activeTab;
  // 생활 컨테이너의 유효 탭. HomeOverviewTab(등하원·순공)·PenaltiesTab(벌점) 공용.
  const lifeActiveTab = activeTab === 'life' ? lifeSubTab : activeTab;

  const renderSubTabs = (
    tabs: Array<{ id: string; label: string; meta: string }>,
    current: string,
    onSelect: (id: string) => void,
    ariaLabel: string,
  ) => (
    <div className="no-print rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2 shadow-sm">
      <div className={`grid gap-1.5 grid-cols-2 ${tabs.length >= 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`} role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const selected = current === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.id)}
              className={`min-h-12 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                selected
                  ? 'border-[#0071E3] bg-[#0071E3] text-white shadow-[0_6px_16px_rgba(0,113,227,0.18)]'
                  : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="block truncate text-[12px] font-semibold">{tab.label}</span>
              <span className={`block truncate text-[10px] font-medium ${selected ? 'text-white/75' : 'text-slate-400'}`}>{tab.meta}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!mounted) return null;

  if (shareTokenParam && !sharePasswordVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] flex flex-col items-center justify-center font-sans px-4">
        <div className="w-full max-w-[340px] bg-white rounded-3xl shadow-sm border border-black/[0.06] p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0071E3]/10 flex items-center justify-center mx-auto mb-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">리포트 비밀번호</h1>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              담당 코멘터에게 받은 6자리 비밀번호를 입력해 주세요.
            </p>
          </div>
          <form onSubmit={handleSharePasswordSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={sharePasswordInput}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setSharePasswordInput(v);
                setSharePasswordError('');
              }}
              placeholder="000000"
              className="w-full text-center text-2xl font-semibold tracking-[0.3em] border border-black/[0.08] rounded-2xl px-4 py-3.5 outline-none focus:border-[#0071E3] transition-colors bg-black/[0.03]"
              autoFocus
            />
            {sharePasswordError && (
              <p className="text-[11px] text-red-600 text-center font-semibold">{sharePasswordError}</p>
            )}
            <button
              type="submit"
              disabled={sharePasswordInput.length !== 6 || sharePasswordChecking}
              className="w-full rounded-2xl bg-[#0071E3] text-white text-[15px] font-semibold py-3.5 hover:bg-[#0077ED] transition-colors disabled:opacity-40"
            >
              {sharePasswordChecking ? '확인 중...' : '리포트 열기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] font-sans">
        <div className="mx-auto w-full max-w-[680px] px-4 py-8 sm:px-5">
          {/* 브리핑 헤더 자리 */}
          <div className="space-y-3">
            <div className="skeleton h-6 w-28 rounded-full" />
            <div className="skeleton h-9 w-4/5" />
            <div className="skeleton h-9 w-3/5" />
            <div className="skeleton h-4 w-2/3 rounded-md" />
          </div>
          {/* 카드 자리 */}
          <div className="mt-8 space-y-4">
            <div className="skeleton h-28 w-full rounded-3xl" />
            <div className="skeleton h-40 w-full rounded-3xl" />
            <div className="skeleton h-32 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] flex flex-col items-center justify-center font-sans px-4">
        <div className="text-center space-y-4 max-w-md p-8 bg-white rounded-3xl border border-black/[0.04] shadow-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold tracking-tight text-slate-900">리포트를 불러올 수 없습니다.</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
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

  const pendingSaturdayLateExcuses = ((student.saturdayLateExcuses || []) as SaturdayLateExcuse[]).filter(
    (excuse) => excuse.status === 'pending'
  );

  // 도시락: 마감 전인데 아직 신청 안 한 라운드만 "확인할 알림"으로 카운트
  const pendingMealCount = mealPlans.filter((p) => !p.pastDeadline && !p.myOrder).length;

  // #6 — 홈 알림 배지: 일반 알림 + 모의고사/OT/도시락/토요증빙 미응답을 모두 합산해 "확인할 알림 수"로 표시
  const attentionCount = isStudentReport
    ? notificationCount + pendingMockExams.length + pendingOtEvents.length + pendingCampusEvents.length + pendingMealCount + pendingSaturdayLateExcuses.length
    : notificationCount;

  return (
    <StudentLayout
      student={student}
      isStudentReport={isStudentReport}
      isParentReport={isParentReport}
      showEnrollmentWarning={showEnrollmentWarning}
      isEnrollmentExpiredLocked={isEnrollmentExpiredLocked}
      daysUntilEnrollmentEnd={daysUntilEnrollmentEnd}
      notificationCount={attentionCount}
      notificationPreview={notificationPreview}
      reportNavItems={reportNavItems}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      slideDirRef={slideDirRef}
      tabIds={tabIds}
      handleLogout={handleLogout}
      handlePrint={handlePrint}
      formatNotificationDate={formatNotificationDate}
    >
      {/* 결과 리포트 종이 영역 */}
      <div
        ref={paperRef}
        className={`report-paper bg-white dark:bg-[#1c1c1e] border border-slate-100 dark:border-white/10 rounded-[32px] shadow-[0_30px_70px_rgba(15,23,42,0.06)] print-card space-y-10 min-h-[70vh] print:min-h-0 ${
          isStudentReport ? 'p-5 sm:p-7 md:p-10' : 'p-8 md:p-14'
        }`}
        onTouchStart={isStudentReport ? handleSwipeStart : undefined}
        onTouchEnd={isStudentReport ? handleSwipeEnd : undefined}
      >
        {/* 0. 학생 대시보드 최우선 알림 */}
        {isStudentReport && (
          <NotificationsSection
            studentName={student.name}
            studentNotifications={studentNotifications}
            dismissedNotifications={dismissedStudentNotifications}
            notificationCount={attentionCount}
            onDismissNotification={dismissNotification}
            onDismissAllNotifications={() => dismissAllNotifications(studentNotifications.map((n: { id: string }) => n.id))}
            onRestoreNotification={restoreNotification}
            onRestoreAllNotifications={restoreAllNotifications}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            slideDirRef={slideDirRef}
            formatNotificationDate={formatNotificationDate}
          />
        )}

        {/* 0-1. 모의고사 참여 여부 응답 카드 (학생 전용 · 알림 탭에서만 노출 — 홈은 배지 카운트로 안내) */}
        {isStudentReport && activeTab === 'student-notifications' && pendingMockExams.length > 0 && (
          <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5">
            <MockExamNotice
              exams={pendingMockExams}
              onResponded={handleMockExamResponded}
            />
          </div>
        )}

        {/* 0-1b. OT 참여 여부 응답 카드 (학생 전용 · 알림 탭에서만 노출) */}
        {isStudentReport && activeTab === 'student-notifications' && pendingOtEvents.length > 0 && (
          <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5">
            <OtEventNotice
              events={pendingOtEvents}
              onResponded={handleOtEventResponded}
            />
          </div>
        )}

        {/* 0-1b2. 참여 미션(캘린더) 수락 카드 (학생 전용 · 알림 탭에서만 노출) */}
        {isStudentReport && activeTab === 'student-notifications' && pendingCampusEvents.length > 0 && (
          <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5">
            <CampusEventNotice
              events={pendingCampusEvents}
              onResponded={handleCampusEventResponded}
            />
          </div>
        )}

        {/* 0-1c. 도시락 신청 카드 (학생 전용 · 알림 탭에서만 노출. 홈은 '확인할 특이사항' amber 알림이 딥링크로 안내) */}
        {isStudentReport && activeTab === 'student-notifications' && mealPlans.length > 0 && (
          <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5">
            <MealPlanNotice
              plans={mealPlans}
              onSaved={handleMealSaved}
            />
          </div>
        )}

        {/* 0-2. 토요 지각 증빙 요청 공지 (학생 전용 · 알림 탭에서만 노출) */}
        {isStudentReport && activeTab === 'student-notifications' && pendingSaturdayLateExcuses.length > 0 && (
          <div className="mx-auto w-full max-w-[680px] px-4 sm:px-5">
            <SaturdayLateExcuseNotice
              excuses={pendingSaturdayLateExcuses}
              studentId={student.id}
              onResponded={(updatedExcuses) => {
                setStudent((prev: Student | null) => (prev ? { ...prev, saturdayLateExcuses: updatedExcuses } : prev));
              }}
            />
          </div>
        )}

        {/* 미션 탭은 해체됨 — 연속출석은 홈, 쿠폰 미션은 생활·쿠폰 탭으로 이동 */}

        {isStudentReport && activeTab === 'learning' && (
          <section id="learning" className="scroll-mt-24 space-y-4">
            <TabHero
              eyebrow="Learning"
              icon={BookOpen}
              title="학습"
              description="오늘 계획·주간 계획·과목별 진도·성적을 한곳에서 확인해요."
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  // 학습 관련 요청 패널은 '신청' 탭의 '학습신청' 서브탭으로 이동됨 — 그리로 보낸다.
                  setRequestSubTab('learning-request');
                  setActiveTab('student-requests');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="rounded-2xl border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] px-4 py-2 text-xs font-black text-[#0071E3] shadow-sm transition hover:bg-[#0071E3]/[0.04] dark:hover:bg-[#0071E3]/15 active:scale-[0.98]"
              >
                학습 관련 요청
              </button>
            </div>
            {renderSubTabs(
              LEARNING_SUB_TABS,
              learningSubTab,
              (tabId) => setLearningSubTab(tabId as LearningSubTab),
              '학습 탭 종류',
            )}
          </section>
        )}

        {isStudentReport && activeTab === 'focus' && (
          <section id="focus" className="scroll-mt-24 space-y-4">
            <TabHero
              eyebrow="Focus"
              icon={Timer}
              title="집중"
              description="타이머를 켜면 화면을 벗어나도 집중 시간이 계속 쌓여요. 순위는 이 집중 시간으로 매겨져요(체류 시간 상한)."
            />
            <PomodoroTimer
              student={student}
              setStudent={setStudent}
              setRewardBanner={setRewardBanner}
              isLectureTime={isLectureTime}
            />
          </section>
        )}

        {isStudentReport && activeTab === 'calendar' && (
          <section id="calendar" className="scroll-mt-24 space-y-4">
            <TabHero
              eyebrow="Calendar"
              icon={CalendarDays}
              title="나의 수험 스케줄러"
              description="학원 일정(OT·모의고사·행사)과 내 반차·상담은 물론, 내가 직접 적은 공부 계획까지 한 달을 한눈에 관리해요."
            />
            <StudentCalendarTab
              onNavigateToGrades={() => {
                setActiveTab('learning');
                setLearningSubTab('grade-analysis');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              openMaterialDetail={isStudentReport ? openMaterialDetail : undefined}
              studentId={student.id}
            />
          </section>
        )}

        {isStudentReport && activeTab === 'life' && (
          <section id="life" className="scroll-mt-24 space-y-4">
            <TabHero
              eyebrow="Life"
              icon={Shield}
              title="생활"
              description="등하원·순공 랭킹·벌점·쿠폰을 한곳에서 확인해요."
            />
            {renderSubTabs(
              LIFE_SUB_TABS,
              lifeSubTab,
              (tabId) => setLifeSubTab(tabId as LifeSubTab),
              '생활 탭 종류',
            )}
          </section>
        )}

        {/* 1. 홈 탭 (Overview) */}
        <HomeOverviewTab
          student={student}
          setStudent={setStudent}
          isStudentReport={isStudentReport}
          todayDailyPlan={todayDailyPlan}
          todayPlanEntries={todayPlanEntries}
          todaySelfPacedItems={todaySelfPacedItems}
          saveSelfPacedToday={saveSelfPacedToday}
          saveStudySlot={saveStudySlot}
          adjustStartPoint={adjustStartPoint}
          saveMakeupDone={saveMakeupDone}
          updateDeadlineProgress={updateDeadlineProgress}
          pendingPlanId={pendingPlanId}
          setPendingPlanId={setPendingPlanId}
          pendingAmount={pendingAmount}
          setPendingAmount={setPendingAmount}
          updatePlanCompletion={updatePlanCompletion}
          homeAttend={homeAttend}
          homeFocusMin={homeFocusMin}
          homeStayMin={homeStayMin}
          currentSubjectText={currentSubjectText}
          currentStudyLabel={currentStudyLabel}
          timeGreeting={timeGreeting}
          currentBriefingPhrase={currentBriefingPhrase}
          briefingSubMessage={briefingSubMessage}
          rewardBanner={rewardBanner}
          submitChecklist={submitChecklist}
          checklistForm={checklistForm}
          setChecklistForm={setChecklistForm}
          checklistSubmitting={checklistSubmitting}
          activeTab={lifeActiveTab}
          studyTimeLabels={studyTimeLabels}
          scheduledSlotLabels={isStudentReport ? scheduledSlotLabels : undefined}
          studyStats={studyStats}
          completedQuests={completedQuests}
          setCompletedQuests={setCompletedQuests}
          deadlineGoals={deadlineGoals}
          openWeeklyPlan={openWeeklyPlanTab}
          openMakeup={openMakeupTab}
          openTimetable={openTimetableFromSheet}
          consultationBookings={consultationBookings}
          pendingMealCount={pendingMealCount}
          pendingMockCount={pendingMockExams.length}
          pendingOtCount={pendingOtEvents.length}
          pendingCampusCount={pendingCampusEvents.length}
          pendingSaturdayCount={pendingSaturdayLateExcuses.length}
          openConsultation={openConsultationTab}
          openNotifications={openNotificationsTab}
          openLeaveRequests={openLeaveRequestsTab}
          openMaterialDetail={isStudentReport ? openMaterialDetail : undefined}
          sendRequest={sendRequest}
        />

        {/* 2. 오늘 계획 (시간표) 탭 */}
        <TimetableTab
          student={student}
          isStudentReport={isStudentReport}
          todaySubjects={todaySubjects}
          todaySelfPacedItems={todaySelfPacedItems}
          currentMinutes={currentMinutes}
          todayDayKey={todayDayKey}
          activeTab={learningActiveTab}
          weekDaySlots={weekDaySlots}
          studyTimeSlots={studyTimeSlots}
          todaySchedule={isStudentReport ? todaySchedule : undefined}
          openMaterialDetail={isStudentReport ? openMaterialDetail : undefined}
        />

        {/* 3. 실행 계획표 탭 */}
        <ExecutionPlanTab
          student={student}
          isStudentReport={isStudentReport}
          weeklyDailyPlans={weeklyDailyPlans}
          updateDeadlineProgress={updateDeadlineProgress}
          deadlineGoals={deadlineGoals}
          activeTab={learningActiveTab}
        />

        {/* 4. 과목별 진도 탭 */}
        <SubjectProgressTab
          student={student}
          isStudentReport={isStudentReport}
          updateBookSolvedQuestions={updateBookSolvedQuestions}
          updateProgress={updateProgress}
          updatePlanCompletion={updatePlanCompletion}
          materialBenchmarks={materialBenchmarks}
          activeTab={learningActiveTab}
          onOpenLearningRequest={() => {
            setRequestSubTab('learning-request');
            setActiveTab('student-requests');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          openMaterialDetail={isStudentReport ? openMaterialDetail : undefined}
        />

        {/* 4-1. 보강 탭 — 휴가로 발생한 자료별 보강 원장(누적/완료 입력) */}
        <MakeupTab
          student={student}
          isStudentReport={isStudentReport}
          activeTab={learningActiveTab}
          saveMakeupDone={saveMakeupDone}
        />

        {/* 오답 노트 (독립 탭) — 교재/인강 오답 기록 + 태그 약점 분석.
            모의고사 오답분석(MockReviewPanel)은 #19 통합으로 진입점 제거 — 미션 판정도 일반 오답노트가 대체(레거시 데이터는 계속 인정). */}
        <WrongAnswerTab
          student={student}
          isStudentReport={isStudentReport}
          activeTab={activeTab}
        />

        {/* 5. 성적 분석 탭 */}
        <GradeAnalysisTab
          student={student}
          isStudentReport={isStudentReport}
          chartData={chartData}
          gradeSubjects={gradeSubjects}
          gradeForm={gradeForm}
          setGradeForm={setGradeForm}
          gradeSubmitting={gradeSubmitting}
          gradeError={gradeError}
          submitGrade={submitGrade}
          deleteGrade={deleteGrade}
          activeTab={learningActiveTab}
          setActiveTab={selectReportTab}
          setRequestForm={setRequestForm}
          setRequestCustomOpen={setRequestCustomOpen}
          mockExams={mockExams}
        />

        {/* 6. 상담 및 신청 탭 */}
        <ConsultationTab
          student={student}
          isStudentReport={isStudentReport}
          leaveForm={leaveForm}
          setLeaveForm={setLeaveForm}
          leaveSubmitting={leaveSubmitting}
          leaveError={leaveError}
          submitLeave={submitLeave}
          cancelLeave={cancelLeave}
          reappealLeave={reappealLeave}
          showLeaveHistory={showLeaveHistory}
          setShowLeaveHistory={setShowLeaveHistory}
          activeTab={activeTab}
          requestSubTab={requestSubTab}
          setRequestSubTab={setRequestSubTab}
          consultationAvailable={isConsultationCampus(student.campus)}
          homeHalfLeft={homeHalfLeft}
          homeFullLeft={homeFullLeft}
          homeLeaveCoupons={homeLeaveCoupons}
          onCouponsChange={(n) => setStudent((prev: Student | null) => (prev ? { ...prev, leaveCoupons: n } : prev))}
          mealPlans={mealPlans}
          onMealSaved={handleMealSaved}
          pendingMealCount={pendingMealCount}
          chatUnreadCount={chatUnreadCount}
          suggestionChatNode={
            <StudentChatPanel
              events={chatTimeline || []}
              active={activeTab === 'student-requests' && requestSubTab === 'suggestion'}
              chatUnreadCount={chatUnreadCount || 0}
              chatSending={chatSending}
              sendChatMessage={sendChatMessage}
              markChatRead={markChatRead}
              refreshCore={refreshCore}
              cancelSuggestion={cancelSuggestion}
              cancelLeave={cancelLeave}
              cancelRequest={cancelRequest}
            />
          }
          learningRequestNode={
            <LearningRequestPanel
              student={student}
              isStudentReport={isStudentReport}
              requestForm={requestForm}
              setRequestForm={setRequestForm}
              requestSubmitting={requestSubmitting}
              requestCustomOpen={requestCustomOpen}
              setRequestCustomOpen={setRequestCustomOpen}
              sendRequest={sendRequest}
              cancelRequest={cancelRequest}
              showRequestHistory={showRequestHistory}
              setShowRequestHistory={setShowRequestHistory}
              requestError={requestError}
              realignStudentPlans={realignStudentPlans}
              realigningPlans={realigningPlans}
            />
          }
        />

        {/* 6-1. 클리닉 상담 예약 탭 (상담 운영 센터 학생 전용) */}
        {isStudentReport && isConsultationCampus(student.campus) && (
          <section
            id="clinic-booking"
            className={`scroll-mt-24 print-card ${activeTab === 'student-requests' && requestSubTab === 'consultation' ? '' : 'hidden print:block'}`}
          >
            <ConsultationBookingPanel
              studentId={student.id}
              campus={student.campus}
              bookings={consultationBookings || []}
              whyConsultation={whyConsultation}
              consultationHistory={consultationHistory || []}
            />
          </section>
        )}

        {/* 7. 벌점 탭 */}
        <PenaltiesTab
          student={student}
          activeTab={lifeActiveTab}
        />

        <CouponTab
          student={student}
          activeTab={lifeActiveTab}
          onGoToExchange={() => {
            slideDirRef.current = 1;
            setRequestSubTab('coupon');
            setActiveTab('student-requests');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>

      {/* 자료(교재/인강) 상세 시트 — 학생 뷰 전용 오버레이. 홈/시간표/과목별 진도 어디서든 열린다. */}
      {isStudentReport && materialSheet && (
        <MaterialDetailSheet
          student={student}
          materialType={materialSheet.materialType}
          materialId={materialSheet.materialId}
          studyTimeLabels={studyTimeLabels}
          adjustStartPoint={adjustStartPoint}
          saveStudySlot={saveStudySlot}
          saveMaterialColor={saveMaterialColor}
          saveEstimatedTotal={saveEstimatedTotal}
          onClose={closeMaterialDetail}
          onOpenSubjectProgress={openSubjectProgressFromSheet}
          onOpenTimetable={openTimetableFromSheet}
          onOpenChangeRequest={openChangeRequestFromSheet}
        />
      )}

      {/* 새 메시지 플로팅 배지 — 채팅 탭 밖에서 관리자 답변이 오면 어느 탭에서든 보인다. 탭하면 채팅으로 이동 */}
      {isStudentReport && (chatUnreadCount || 0) > 0 && !(activeTab === 'student-requests' && requestSubTab === 'suggestion') && (
        <button
          type="button"
          onClick={() => {
            setRequestSubTab('suggestion');
            setActiveTab('student-requests');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="no-print glass-strong fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-xs font-black text-[#0071E3] shadow-lg transition active:scale-[0.96]"
          aria-label={`새 메시지 ${chatUnreadCount}개 — 채팅 열기`}
        >
          <span className="relative grid h-6 w-6 place-items-center rounded-full bg-[#0071E3]/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          새 메시지 {chatUnreadCount! > 9 ? '9+' : chatUnreadCount}
        </button>
      )}

      {/* 1일 1문제 — 오답노트가 있는 학생에게 홈 진입 시 하루 1회 랜덤 복습 문제 시트(노트 0개면 안 뜸) */}
      {isStudentReport && (
        <DailyWrongQuiz
          student={student}
          activeTab={activeTab}
          onOpenWrongNote={() => {
            selectReportTab('wrong-note');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* 사용법 다시보기 (학생 전용) */}
      {isStudentReport && (
        <div className="no-print text-center pb-2">
          <a href="/student/welcome?replay=1" className="text-xs text-slate-500 underline">사용법 다시보기</a>
        </div>
      )}

      {/* 하단 카피라이트 */}
      <div className="no-print text-center text-[10px] text-slate-400 pb-8">
        {isStudentReport
          ? '이 학생 홈은 SSC 스파르타 관리형 학습센터의 공식 학원 관리 솔루션으로 실시간 제공됩니다.'
          : '이 결과 브리핑 리포트는 SSC 스파르타 관리형 학습센터의 공식 학원 관리 솔루션을 사용하여 실시간으로 보안 출력되었습니다.'}
      </div>
    </StudentLayout>
  );
}

// useReportState 가 useSearchParams() 를 사용하므로 Suspense 경계로 감싼다(Next 16 빌드 요건).
export default function StudentReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] flex items-center justify-center font-sans">
          <Loader2 className="w-9 h-9 text-[#0071E3] animate-spin" />
        </div>
      }
    >
      <StudentReportInner />
    </Suspense>
  );
}
