'use client';

import React, { Suspense } from 'react';
import { useReportState } from '@/hooks/use-report-state';
import { StudentLayout } from '@/components/report/student-layout';
import { NotificationsSection } from '@/components/report/notifications-section';
import { HomeOverviewTab } from '@/components/report/home-overview-tab';
import { TimetableTab } from '@/components/report/timetable-tab';
import { ExecutionPlanTab } from '@/components/report/execution-plan-tab';
import { SubjectProgressTab } from '@/components/report/subject-progress-tab';
import { GradeAnalysisTab } from '@/components/report/grade-analysis-tab';
import { ConsultationTab } from '@/components/report/consultation-tab';
import { Loader2, AlertCircle } from 'lucide-react';

function StudentReportInner() {
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
    incrementBookIncorrectTag,
    submitChecklist,
    studyTimeLabels,
    weekDaySlots,
    studyTimeSlots,
    currentMinutes,
    todayDayKey,
    realignStudentPlans,
    realigningPlans,
  } = useReportState();

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
            <h1 className="text-base font-black text-[#1D1D1F]">리포트 비밀번호</h1>
            <p className="text-[11px] text-[#86868B] leading-relaxed">
              담당 코치에게 받은 6자리 비밀번호를 입력해 주세요.
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
              className="w-full text-center text-2xl font-black tracking-[0.3em] border border-black/[0.1] rounded-2xl px-4 py-3 outline-none focus:border-[#0071E3] transition-colors bg-[#FAFAFA]"
              autoFocus
            />
            {sharePasswordError && (
              <p className="text-[11px] text-red-600 text-center font-semibold">{sharePasswordError}</p>
            )}
            <button
              type="submit"
              disabled={sharePasswordInput.length !== 6 || sharePasswordChecking}
              className="w-full rounded-2xl bg-[#0071E3] text-white text-[13px] font-black py-3 hover:bg-[#0077ED] transition-colors disabled:opacity-40"
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

  return (
    <StudentLayout
      student={student}
      isStudentReport={isStudentReport}
      isParentReport={isParentReport}
      showEnrollmentWarning={showEnrollmentWarning}
      isEnrollmentExpiredLocked={isEnrollmentExpiredLocked}
      daysUntilEnrollmentEnd={daysUntilEnrollmentEnd}
      notificationCount={notificationCount}
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
        className="report-paper bg-white border border-slate-100 rounded-[32px] p-8 md:p-14 shadow-[0_30px_70px_rgba(15,23,42,0.06)] print-card space-y-10 min-h-[70vh] print:min-h-0"
        onTouchStart={isStudentReport ? handleSwipeStart : undefined}
        onTouchEnd={isStudentReport ? handleSwipeEnd : undefined}
      >
        {/* 0. 학생 대시보드 최우선 알림 */}
        {isStudentReport && (
          <NotificationsSection
            studentName={student.name}
            studentNotifications={studentNotifications}
            dismissedNotifications={dismissedStudentNotifications}
            notificationCount={notificationCount}
            onDismissNotification={dismissNotification}
            onRestoreNotification={restoreNotification}
            onRestoreAllNotifications={restoreAllNotifications}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            slideDirRef={slideDirRef}
            formatNotificationDate={formatNotificationDate}
          />
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
          homeAttend={homeAttend}
          homeTotalMin={homeTotalMin}
          currentSubjectText={currentSubjectText}
          currentStudyLabel={currentStudyLabel}
          currentStudyRange={currentStudyRange}
          timeGreeting={timeGreeting}
          currentBriefingPhrase={currentBriefingPhrase}
          briefingSubMessage={briefingSubMessage}
          rewardBanner={rewardBanner}
          setRewardBanner={setRewardBanner}
          submitChecklist={submitChecklist}
          checklistForm={checklistForm}
          setChecklistForm={setChecklistForm}
          checklistSubmitting={checklistSubmitting}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          studyTimeLabels={studyTimeLabels}
          studyStats={studyStats}
          completedQuests={completedQuests}
          setCompletedQuests={setCompletedQuests}
        />

        {/* 2. 오늘 계획 (시간표) 탭 */}
        <TimetableTab
          student={student}
          isStudentReport={isStudentReport}
          todaySubjects={todaySubjects}
          currentMinutes={currentMinutes}
          todayDayKey={todayDayKey}
          activeTab={activeTab}
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
          activeTab={activeTab}
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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setRequestForm={setRequestForm}
          setRequestCustomOpen={setRequestCustomOpen}
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
          homeHalfLeft={homeHalfLeft}
          homeFullLeft={homeFullLeft}
          homeLeaveCoupons={homeLeaveCoupons}
        />
      </div>

      {/* 하단 카피라이트 */}
      <div className="no-print text-center text-[10px] text-slate-400 pb-8">
        이 결과 브리핑 리포트는 SSC 스파르타 관리형 학습센터의 공식 학원 관리 솔루션을 사용하여 실시간으로 보안 출력되었습니다.
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
