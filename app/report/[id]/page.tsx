'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useReportState } from '@/hooks/use-report-state';
import { StudentLayout } from '@/components/report/student-layout';
import { NotificationsSection } from '@/components/report/notifications-section';
import { HomeOverviewTab } from '@/components/report/home-overview-tab';
import { TimetableTab } from '@/components/report/timetable-tab';
import { ExecutionPlanTab } from '@/components/report/execution-plan-tab';
import { SubjectProgressTab } from '@/components/report/subject-progress-tab';
import { GradeAnalysisTab } from '@/components/report/grade-analysis-tab';
import { ConsultationTab, type ApplicationSubTab } from '@/components/report/consultation-tab';
import { ConsultationBookingPanel } from '@/components/report/consultation-booking-panel';
import { isConsultationCampus } from '@/lib/consultation-schedule';
import { PenaltiesTab } from '@/components/report/penalties-tab';
import { MockExamNotice } from '@/components/report/mock-exam-notice';
import { OtEventNotice } from '@/components/report/ot-event-notice';
import { CampusEventNotice } from '@/components/report/campus-event-notice';
import { MealPlanNotice, type MealPlanWithOrder } from '@/components/report/meal-plan-notice';
import { MissionsHub } from '@/components/student/missions-hub';
import { SaturdayLateExcuseNotice } from '@/components/report/saturday-late-excuse-notice';
import { Loader2, AlertCircle } from 'lucide-react';
import type { MockExam, OtEvent, CampusEvent, SaturdayLateExcuse, Student } from '@/lib/types/student';

type LearningSubTab = 'timetable' | 'execution-plan' | 'subject-progress' | 'grade-analysis';
type LifeSubTab = 'attendance-status' | 'study-stats' | 'student-penalties';

const LEARNING_SUB_TABS: Array<{ id: LearningSubTab; label: string; meta: string }> = [
  { id: 'timetable', label: '오늘 계획', meta: '시간표 기준' },
  { id: 'execution-plan', label: '학습계획', meta: '주간 계획' },
  { id: 'subject-progress', label: '과목별 진도', meta: '교재/인강' },
  { id: 'grade-analysis', label: '성적분석', meta: '시험 기록' },
];

const LIFE_SUB_TABS: Array<{ id: LifeSubTab; label: string; meta: string }> = [
  { id: 'attendance-status', label: '등하원', meta: '오늘 출결' },
  { id: 'study-stats', label: '순공/랭킹', meta: '학습 시간' },
  { id: 'student-penalties', label: '벌점', meta: '생활 기록' },
];

const LEARNING_TAB_IDS = LEARNING_SUB_TABS.map((tab) => tab.id);
const LIFE_TAB_IDS = LIFE_SUB_TABS.map((tab) => tab.id);

function StudentReportInner() {
  const [pendingMockExams, setPendingMockExams] = useState<MockExam[]>([]);
  const [pendingOtEvents, setPendingOtEvents] = useState<OtEvent[]>([]);
  const [pendingCampusEvents, setPendingCampusEvents] = useState<CampusEvent[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanWithOrder[]>([]);
  // 미션 탭은 첫 활성화 때 마운트(그때 API 호출) — 초기 로딩을 가볍게 유지한다.
  const [missionsTabActivated, setMissionsTabActivated] = useState(false);
  const [requestSubTab, setRequestSubTab] = useState<ApplicationSubTab>('leave');
  const [learningSubTab, setLearningSubTab] = useState<LearningSubTab>('timetable');
  const [lifeSubTab, setLifeSubTab] = useState<LifeSubTab>('attendance-status');

  useEffect(() => {
    let cancelled = false;

    async function loadPending() {
      try {
        const [examRes, otRes, campusRes, mealRes] = await Promise.all([
          fetch('/api/student/mock-exams', { credentials: 'same-origin' }),
          fetch('/api/student/ot-events', { credentials: 'same-origin' }),
          fetch('/api/student/campus-events', { credentials: 'same-origin' }),
          fetch('/api/student/meal-plans', { credentials: 'same-origin' }),
        ]);
        if (examRes.ok) {
          const json = await examRes.json();
          if (!cancelled && json.success) setPendingMockExams(json.exams || []);
        }
        if (otRes.ok) {
          const json = await otRes.json();
          if (!cancelled && json.success) setPendingOtEvents(json.events || []);
        }
        if (campusRes.ok) {
          const json = await campusRes.json();
          if (!cancelled && json.success) setPendingCampusEvents(json.events || []);
        }
        if (mealRes.ok) {
          const json = await mealRes.json();
          if (!cancelled && json.success) setMealPlans(json.plans || []);
        }
      } catch {}
    }

    loadPending();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMealSaved = useCallback((planId: string, order: import('@/lib/types/student').MealOrder) => {
    setMealPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, myOrder: order } : p)));
  }, []);

  const handleMockExamResponded = useCallback((examId: string) => {
    setPendingMockExams((prev) => prev.filter((e) => e.id !== examId));
  }, []);

  const handleOtEventResponded = useCallback((eventId: string) => {
    setPendingOtEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const handleCampusEventResponded = useCallback((eventId: string) => {
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
    daysUntilEnrollmentEnd,
    showEnrollmentWarning,
    isEnrollmentExpiredLocked,
    handleSwipeStart,
    handleSwipeEnd,
    updateProgress,
    updateBookSolvedQuestions,
    updatePlanCompletion,
    updateDeadlineProgress,
    deadlineGoals,
    deadlineSummary,
    incrementBookIncorrectTag,
    submitChecklist,
    studyTimeLabels,
    weekDaySlots,
    studyTimeSlots,
    currentMinutes,
    todayDayKey,
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
    if (tabId === 'clinic-booking') {
      setRequestSubTab('consultation');
      setActiveTab('student-requests');
      return true;
    }
    return false;
  }, [setActiveTab]);

  useEffect(() => {
    if (activeTab === 'student-missions') setMissionsTabActivated(true);
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

  const learningActiveTab = activeTab === 'learning' ? learningSubTab : activeTab;
  // 생활 컨테이너의 유효 탭. HomeOverviewTab(등하원·순공)·PenaltiesTab(벌점) 공용.
  const lifeActiveTab = activeTab === 'life' ? lifeSubTab : activeTab;

  const renderSubTabs = (
    tabs: Array<{ id: string; label: string; meta: string }>,
    current: string,
    onSelect: (id: string) => void,
    ariaLabel: string,
  ) => (
    <div className="no-print rounded-3xl border border-slate-100 bg-white p-2 shadow-sm">
      <div className="grid gap-1.5 sm:grid-cols-4" role="tablist" aria-label={ariaLabel}>
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
            onRestoreNotification={restoreNotification}
            onRestoreAllNotifications={restoreAllNotifications}
            onReplyToThread={replyToThread}
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

        {/* 0-1c. 도시락 신청 카드 (학생 전용 · 홈 + 알림 탭에 노출 — 놓치지 않게 홈에서도 보이게) */}
        {isStudentReport && (activeTab === 'student-notifications' || activeTab === 'report-overview') && mealPlans.length > 0 && (
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

        {/* 미션 탭 (학생 전용, 독립 탭) — 오늘 할 일 허브 + 쿠폰 미션 통합 */}
        {isStudentReport && missionsTabActivated && (
          <div
            id="student-missions"
            className={`no-print scroll-mt-24 mx-auto w-full max-w-[680px] px-4 sm:px-5 ${activeTab === 'student-missions' ? 'block' : 'hidden'}`}
          >
            <MissionsHub
              studentId={student.id}
              studentName={student.name}
              embedded
              onGoToExchange={() => {
                slideDirRef.current = 1;
                setRequestSubTab('coupon');
                setActiveTab('student-requests');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        )}

        {isStudentReport && activeTab === 'learning' && (
          <section id="learning" className="scroll-mt-24 space-y-4">
            {renderSubTabs(
              LEARNING_SUB_TABS,
              learningSubTab,
              (tabId) => setLearningSubTab(tabId as LearningSubTab),
              '학습 탭 종류',
            )}
          </section>
        )}

        {isStudentReport && activeTab === 'life' && (
          <section id="life" className="scroll-mt-24 space-y-4">
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
          pendingPlanId={pendingPlanId}
          setPendingPlanId={setPendingPlanId}
          pendingAmount={pendingAmount}
          setPendingAmount={setPendingAmount}
          updatePlanCompletion={updatePlanCompletion}
          updateDeadlineProgress={updateDeadlineProgress}
          homeAttend={homeAttend}
          homeTotalMin={homeTotalMin}
          currentSubjectText={currentSubjectText}
          currentStudyLabel={currentStudyLabel}
          timeGreeting={timeGreeting}
          currentBriefingPhrase={currentBriefingPhrase}
          briefingSubMessage={briefingSubMessage}
          rewardBanner={rewardBanner}
          setRewardBanner={setRewardBanner}
          submitChecklist={submitChecklist}
          checklistForm={checklistForm}
          setChecklistForm={setChecklistForm}
          checklistSubmitting={checklistSubmitting}
          activeTab={lifeActiveTab}
          studyTimeLabels={studyTimeLabels}
          studyStats={studyStats}
          completedQuests={completedQuests}
          setCompletedQuests={setCompletedQuests}
          deadlineGoals={deadlineGoals}
          deadlineSummary={deadlineSummary}
        />

        {/* 2. 오늘 계획 (시간표) 탭 */}
        <TimetableTab
          student={student}
          isStudentReport={isStudentReport}
          todaySubjects={todaySubjects}
          currentMinutes={currentMinutes}
          todayDayKey={todayDayKey}
          activeTab={learningActiveTab}
          weekDaySlots={weekDaySlots}
          studyTimeSlots={studyTimeSlots}
        />

        {/* 3. 실행 계획표 탭 */}
        <ExecutionPlanTab
          student={student}
          isStudentReport={isStudentReport}
          weeklyDailyPlans={weeklyDailyPlans}
          pendingPlanId={pendingPlanId}
          setPendingPlanId={setPendingPlanId}
          pendingAmount={pendingAmount}
          setPendingAmount={setPendingAmount}
          updatePlanCompletion={updatePlanCompletion}
          updateDeadlineProgress={updateDeadlineProgress}
          deadlineGoals={deadlineGoals}
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
          activeTab={learningActiveTab}
          studyTimeLabels={studyTimeLabels}
          realignStudentPlans={realignStudentPlans}
          realigningPlans={realigningPlans}
        />

        {/* 4. 과목별 진도 탭 */}
        <SubjectProgressTab
          student={student}
          isStudentReport={isStudentReport}
          updateProgress={updateProgress}
          updateBookSolvedQuestions={updateBookSolvedQuestions}
          incrementBookIncorrectTag={incrementBookIncorrectTag}
          updatePlanCompletion={updatePlanCompletion}
          materialBenchmarks={materialBenchmarks}
          activeTab={learningActiveTab}
          setActiveTab={selectReportTab}
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
          suggestionMessage={suggestionMessage}
          setSuggestionMessage={setSuggestionMessage}
          suggestionSubmitting={suggestionSubmitting}
          suggestionError={suggestionError}
          submitSuggestion={submitSuggestion}
          cancelSuggestion={cancelSuggestion}
          showSuggestionHistory={showSuggestionHistory}
          setShowSuggestionHistory={setShowSuggestionHistory}
          activeTab={activeTab}
          requestSubTab={requestSubTab}
          setRequestSubTab={setRequestSubTab}
          consultationAvailable={isConsultationCampus(student.campus)}
          homeHalfLeft={homeHalfLeft}
          homeFullLeft={homeFullLeft}
          homeLeaveCoupons={homeLeaveCoupons}
          onCouponsChange={(n) => setStudent((prev: Student | null) => (prev ? { ...prev, leaveCoupons: n } : prev))}
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
      </div>

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
