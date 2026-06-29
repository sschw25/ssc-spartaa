'use client';

import React from 'react';
import { Calendar, MessageSquare, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { ProposedGoal, Student } from '@/lib/types/student';

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount';

type RequestForm = {
  requestType: string;
  message: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: GoalType;
  goalValue: string;
  proposedWeekNumber: string;
  proposedRangeText: string;
  speedMultiplier: string;
  currentGoalSnapshot: { goalType?: GoalType; goalValue?: number; speedMultiplier?: number } | null;
};

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
  days: Array<{
    key: string;
    label: string;
    dateKey: string;
    dateLabel: string;
    entries: DailyPlanEntry[];
  }>;
};

interface ExecutionPlanTabProps {
  student: Student;
  isStudentReport: boolean;
  weeklyDailyPlans: WeeklyDailyPlan[];
  pendingPlanId: string | null;
  setPendingPlanId: (id: string | null) => void;
  pendingAmount: number;
  setPendingAmount: React.Dispatch<React.SetStateAction<number>>;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string) => void;
  requestForm: RequestForm;
  setRequestForm: React.Dispatch<React.SetStateAction<RequestForm>>;
  requestSubmitting: boolean;
  requestCustomOpen: boolean;
  setRequestCustomOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sendRequest: (type: string, message: string, proposedGoal?: ProposedGoal) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  showRequestHistory: boolean;
  setShowRequestHistory: (show: boolean) => void;
  requestError: string;
  activeTab: string;
  studyTimeLabels: Record<string, string>;
  realignStudentPlans?: (mode: 'keepTargetDate' | 'keepPace') => Promise<void>;
  realigningPlans?: boolean;
}

export function ExecutionPlanTab({
  student,
  isStudentReport,
  weeklyDailyPlans,
  pendingPlanId,
  setPendingPlanId,
  pendingAmount,
  setPendingAmount,
  updatePlanCompletion,
  requestForm,
  setRequestForm,
  requestSubmitting,
  requestCustomOpen,
  setRequestCustomOpen,
  sendRequest,
  cancelRequest,
  showRequestHistory,
  setShowRequestHistory,
  requestError,
  activeTab,
  studyTimeLabels,
  realignStudentPlans,
  realigningPlans,
}: ExecutionPlanTabProps) {
  const [showRealignBox, setShowRealignBox] = React.useState(false);
  const [validationError, setValidationError] = React.useState('');
  // #11 — 복귀/진도밀림 재조정: 학생 직접 실행 대신 코멘터에게 '요청'으로 전달
  const [realignRequesting, setRealignRequesting] = React.useState<null | 'keepTargetDate' | 'keepPace'>(null);
  const [realignRequested, setRealignRequested] = React.useState(false);

  const requestRealign = async (mode: 'keepTargetDate' | 'keepPace') => {
    if (realignRequesting) return;
    setRealignRequesting(mode);
    const modeLabel = mode === 'keepTargetDate'
      ? '목표 완료일 유지 (하루 학습량을 늘려 따라잡기)'
      : '학습 페이스 유지 (완료 목표일을 뒤로 조정)';
    const message = `[복귀/진도 재조정 요청] 오랜만에 복귀했거나 진도가 많이 밀려 학습계획 재설정이 필요합니다.\n희망 방식: ${modeLabel}\n코멘터님이 검토 후 반영하거나 상담을 안내해 주세요.`;
    try {
      await sendRequest('plan', message);
      setRealignRequested(true);
      setShowRealignBox(false);
    } finally {
      setRealignRequesting(null);
    }
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

  const QUICK_REQUESTS = [
    { type: 'etc', label: '상담 신청할래요', icon: '💬', message: '상담을 신청합니다.' },
    { type: 'progress', label: '진도가 너무 빨라요', icon: '🏃', message: '진도가 너무 빨라요. 속도를 조정하고 싶어요.' },
    { type: 'progress', label: '진도가 너무 느려요', icon: '🐢', message: '진도가 너무 느려요. 계획을 조정하고 싶어요.' },
    { type: 'subject', label: '과목 추가/변경', icon: '📚', message: '과목 추가 또는 변경을 신청합니다.' },
    { type: 'plan', label: '학습계획 바꾸고 싶어요', icon: '🗓️', message: '학습계획 조정을 신청합니다.' },
    { type: 'progress', label: '진도 숫자 정정', icon: '✏️', message: '진도 숫자 정정이 필요해요.' },
  ];

  const handleQuickRequest = (type: string, message: string) => {
    setRequestCustomOpen(true);
    setRequestForm((f) => ({
      ...f,
      requestType: type,
      message: message,
      materialId: '',
      goalValue: '',
      proposedWeekNumber: '',
      proposedRangeText: '',
    }));

    setTimeout(() => {
      const element = document.getElementById('request-custom-form');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusTarget = element.querySelector('.request-material-select') as HTMLSelectElement;
        if (focusTarget) {
          focusTarget.focus();
        }
      }
    }, 100);
  };

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

  return (
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

      {/* 오래 쉬고 온 학생을 위한 진도 재조정 — 학생이 직접 실행하지 않고 코멘터에게 '요청'으로 전달 (#11) */}
      {isStudentReport && (
        <div className="no-print rounded-3xl border border-amber-300 bg-amber-50/60 p-4 md:p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                🔄 오랜만에 복귀하셨거나 진도가 많이 밀렸나요?
              </h4>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                계획 재설정은 코멘터 검토가 필요해요. 희망하는 방식을 코멘터에게 요청하면, 검토 후 반영하거나 상담을 안내해 드려요.
              </p>
            </div>
            {!realignRequested && !showRealignBox && (
              <button
                type="button"
                onClick={() => setShowRealignBox(true)}
                className="rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-[10px] font-black px-4 py-2 shadow-sm transition active:scale-[0.98] whitespace-nowrap self-start sm:self-auto"
              >
                계획 재조정 요청하기
              </button>
            )}
            {!realignRequested && showRealignBox && (
              <button
                type="button"
                onClick={() => setShowRealignBox(false)}
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[10px] font-black px-3 py-2 shadow-sm transition active:scale-[0.98] whitespace-nowrap self-start sm:self-auto"
              >
                취소
              </button>
            )}
          </div>

          {realignRequested ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              코멘터에게 계획 재조정 요청을 보냈어요. 검토 후 반영하거나 상담을 안내해 드릴게요. (아래 ‘학습 관련 요청’에서 진행 상황 확인)
            </div>
          ) : showRealignBox && (
            <div className="pt-3 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in-up">
              <button
                type="button"
                disabled={!!realignRequesting}
                onClick={() => requestRealign('keepTargetDate')}
                className="p-3.5 rounded-2xl border border-[#0071E3]/20 bg-white hover:bg-[#0071E3]/[0.02] text-left transition shadow-sm hover:border-[#0071E3]/40 disabled:opacity-50 group"
              >
                <div className="text-[11px] font-black text-[#0071E3] flex items-center justify-between">
                  <span>📅 목표 완료일 유지 요청 (추천)</span>
                  <span className="text-[9px] font-bold bg-[#0071E3]/10 px-1.5 py-0.5 rounded">{realignRequesting === 'keepTargetDate' ? '전송 중' : '기본값'}</span>
                </div>
                <p className="mt-1 text-[9.5px] font-semibold text-slate-500 leading-relaxed">
                  원래 약속된 목표일에 끝내기 위해, 밀렸던 분량만큼 하루 목표치를 늘리는 방향으로 코멘터에게 요청합니다.
                </p>
              </button>

              <button
                type="button"
                disabled={!!realignRequesting}
                onClick={() => requestRealign('keepPace')}
                className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition shadow-sm hover:border-[#86868B]/40 disabled:opacity-50"
              >
                <div className="text-[11px] font-black text-slate-800">
                  🐢 학습 페이스 유지 요청 {realignRequesting === 'keepPace' && <span className="text-[9px] text-slate-400">(전송 중)</span>}
                </div>
                <p className="mt-1 text-[9.5px] font-semibold text-slate-500 leading-relaxed">
                  하루 학습 강도는 유지하는 대신, 남은 분량만큼 완료 목표일을 늦추는 방향으로 코멘터에게 요청합니다.
                </p>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 학생 변경 신청 (관리자에게) — 학생 본인만 노출. 학부모는 신청 권한이 없으므로 숨김 */}
      {isStudentReport && (
      <div id="student-request-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm space-y-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            <MessageSquare className="w-4 h-4" /> 학습 관련 요청
          </h4>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">진도 정정·과목 추가/변경·학습계획 조정 등을 신청하면 담당 코멘터가 확인해요.</p>
        </div>
        <div className="space-y-2.5">
          {/* 원탭 빠른 신청 */}
          <div className="grid grid-cols-2 gap-2">
            {QUICK_REQUESTS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={requestSubmitting}
                onClick={() => handleQuickRequest(q.type, q.message)}
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
            onClick={() => setRequestCustomOpen(!requestCustomOpen)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white/60 py-2 text-[11px] font-bold text-slate-500 transition hover:text-slate-700"
          >
            <Plus className={`w-3.5 h-3.5 transition-transform ${requestCustomOpen ? 'rotate-45' : ''}`} />
            {requestCustomOpen ? '직접 작성 닫기' : '직접 작성하기'}
          </button>

          {requestCustomOpen && (
            <form
              id="request-custom-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!requestForm.message.trim()) {
                  setValidationError('신청 내용을 입력해 주세요.');
                  return;
                }
                setValidationError('');
                let proposedGoal: ProposedGoal | undefined = undefined;
                if ((requestForm.requestType === 'plan' || requestForm.requestType === 'progress') && requestForm.materialId) {
                  proposedGoal = {
                    materialId: requestForm.materialId,
                    materialType: requestForm.materialType,
                    goalType: requestForm.goalType,
                    goalValue: requestForm.goalValue ? Number(requestForm.goalValue) : 0,
                    proposedWeekNumber: requestForm.proposedWeekNumber ? Number(requestForm.proposedWeekNumber) : undefined,
                    proposedRangeText: requestForm.proposedRangeText || undefined,
                    speedMultiplier: requestForm.materialType === 'lecture' ? (requestForm.speedMultiplier ? Number(requestForm.speedMultiplier) : 1.0) : undefined,
                    currentGoal: requestForm.currentGoalSnapshot || undefined,
                  };
                }
                sendRequest(requestForm.requestType, requestForm.message, proposedGoal);
              }}
              className="space-y-2.5 rounded-2xl border border-slate-100 bg-white/70 p-3"
            >
              <div className="bg-[#0071E3]/5 rounded-xl p-2.5 text-[10px] font-bold text-[#0071E3] mb-1 leading-normal flex items-start gap-1.5 border border-[#0071E3]/10">
                <span className="shrink-0 text-xs">💡</span>
                <span>선택한 템플릿에 맞추어 서식이 작성되었습니다. 어떤 과목을 어떻게 조정할지 아래 상세 항목들을 채운 뒤 [신청하기] 버튼을 눌러 완료해 주세요!</span>
              </div>
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

              {(requestForm.requestType === 'plan' || requestForm.requestType === 'progress') && (
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 my-1 text-left">
                  <p className="text-[10px] font-black text-slate-400">변경할 계획 세부 지정 (자동 반영용)</p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500">대상 학습자료 선택</label>
                    <select
                      value={requestForm.materialId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const book = (student?.books || []).find(b => b.id === selectedId);
                        const lecture = (student?.lectures || []).find(l => l.id === selectedId);
                        const isBook = !!book;
                        const material = book || lecture;
                        setRequestForm((f) => ({
                          ...f,
                          materialId: selectedId,
                          materialType: isBook ? 'book' : 'lecture',
                          goalType: material?.goalType || 'weeks',
                          goalValue: material?.goalValue ? String(material.goalValue) : '',
                          speedMultiplier: !isBook && lecture?.speedMultiplier ? String(lecture.speedMultiplier) : '1.0',
                          currentGoalSnapshot: material ? {
                            goalType: material.goalType,
                            goalValue: material.goalValue,
                            speedMultiplier: !isBook ? lecture?.speedMultiplier : undefined,
                          } : null,
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-material-select"
                    >
                      <option value="">-- 변경할 교재/인강 선택 --</option>
                      {(student?.books || []).length > 0 && (
                        <optgroup label="교재 목록">
                          {(student?.books || []).map(b => (
                            <option key={b.id} value={b.id}>{b.title}</option>
                          ))}
                        </optgroup>
                      )}
                      {(student?.lectures || []).length > 0 && (
                        <optgroup label="인강 목록">
                          {(student?.lectures || []).map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  
                  {requestForm.materialId && (
                    <>
                      {requestForm.currentGoalSnapshot?.goalValue ? (
                        <div className="rounded-lg bg-slate-100/80 border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 flex items-center gap-1.5">
                          <span className="font-black text-slate-400">현재 설정:</span>
                          <span>{requestForm.currentGoalSnapshot.goalType === 'weeks' ? '목표 기간' : requestForm.currentGoalSnapshot.goalType === 'weeklyAmount' ? '주간 학습량' : '일일 학습량'} {requestForm.currentGoalSnapshot.goalValue}{requestForm.currentGoalSnapshot.goalType === 'weeks' ? '주' : requestForm.materialType === 'book' ? 'p' : '강'}</span>
                          {requestForm.currentGoalSnapshot.speedMultiplier && requestForm.currentGoalSnapshot.speedMultiplier !== 1.0 && (
                            <span>· {requestForm.currentGoalSnapshot.speedMultiplier}배속</span>
                          )}
                          <span className="text-slate-400">→ 아래에서 변경할 값을 입력하세요</span>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">목표 설정 방식</label>
                          <select
                            value={requestForm.goalType}
                            onChange={(e) => setRequestForm((f) => ({ ...f, goalType: e.target.value as GoalType }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-goal-type-select"
                          >
                            <option value="weeks">목표 기간(주)</option>
                            <option value="weeklyAmount">주간 학습량</option>
                            <option value="dailyAmount">일일 학습량</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">목표 수치</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={requestForm.goalValue}
                              onChange={(e) => setRequestForm((f) => ({ ...f, goalValue: e.target.value }))}
                              placeholder="예: 8"
                              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-goal-value-input"
                            />
                            <span className="text-xs font-bold text-slate-500">
                              {requestForm.goalType === 'weeks' ? '주' : requestForm.materialType === 'book' ? 'p' : '강'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {requestForm.materialType === 'lecture' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">제안할 강의 배속 설정</label>
                          <select
                            value={requestForm.speedMultiplier || '1.0'}
                            onChange={(e) => setRequestForm((f) => ({ ...f, speedMultiplier: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-speed-multiplier-select"
                          >
                            <option value="1.0">1.0 배속 (기본)</option>
                            <option value="1.2">1.2 배속</option>
                            <option value="1.5">1.5 배속</option>
                            <option value="1.8">1.8 배속</option>
                            <option value="2.0">2.0 배속</option>
                          </select>
                        </div>
                      )}

                      {requestForm.requestType === 'progress' && (
                        <div className="space-y-2 border-t border-slate-200/60 pt-2">
                          <p className="text-[10px] font-bold text-slate-400">특정 주차 범위 정정 (선택사항)</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500">주차 번호</label>
                              <input
                                type="number"
                                value={requestForm.proposedWeekNumber}
                                onChange={(e) => setRequestForm((f) => ({ ...f, proposedWeekNumber: e.target.value }))}
                                placeholder="예: 1"
                                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-week-number-input"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500">수정할 범위</label>
                              <input
                                type="text"
                                value={requestForm.proposedRangeText}
                                onChange={(e) => setRequestForm((f) => ({ ...f, proposedRangeText: e.target.value }))}
                                placeholder="예: 1p ~ 50p"
                                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none request-range-text-input"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <textarea
                value={requestForm.message}
                onChange={(e) => { setRequestForm((f) => ({ ...f, message: e.target.value })); setValidationError(''); }}
                placeholder="신청 내용을 적어 주세요. 예) 수학I 진도를 주 3회로 늘리고 싶어요"
                rows={2}
                className={`w-full resize-none rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 ${validationError ? 'border-red-400 focus:border-red-400' : 'border-slate-200 focus:border-[#0071E3]'}`}
              />
              {validationError && <p className="text-[10px] font-bold text-red-500">{validationError}</p>}
              <button
                id="btn-submit-change-request"
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
                
                {pending.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{getRequestTypeLabel(r.requestType)}</span>
                        {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                      </span>
                      <button type="button" onClick={() => { if (window.confirm('이 신청을 취소할까요?')) cancelRequest(r.id); }} className="shrink-0 text-slate-300 transition-colors hover:text-red-500" aria-label="신청 취소">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600">{r.content}</p>
                    {r.adminReply && (
                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                        코멘터 답변: {r.adminReply}
                      </div>
                    )}
                  </div>
                ))}

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
                                코멘터 답변: {r.adminReply}
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
      )}

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
                      {day.entries.map((entry, index) => {
                        const _r = entry.rangeText || '';
                        const unit = _r.includes('문제') ? '문제' : _r.includes('강') ? '강' : _r.toLowerCase().includes('p') ? 'p' : _r.replace(/\d+회독/g, '').includes('회') ? '회' : '';
                        const isPending = pendingPlanId === entry.id;
                        return (
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
                            {isStudentReport ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (entry.isCompleted) {
                                    updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, false, undefined, entry.dateKey);
                                  } else {
                                    setPendingPlanId(entry.id);
                                    setPendingAmount(entry.dailyAmount ?? 1);
                                  }
                                }}
                                aria-pressed={entry.isCompleted}
                                className={`mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border text-[10px] font-black transition active:scale-[0.97] ${
                                  entry.isCompleted
                                    ? 'border-emerald-200 bg-white/80 text-emerald-700'
                                    : isPending
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3] hover:bg-[#0071E3]/10'
                                }`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {entry.isCompleted ? (entry.actualAmount !== undefined ? `완료 (${entry.actualAmount}${unit})` : '완료됨') : '완료'}
                              </button>
                            ) : entry.isCompleted ? (
                              <span className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black">
                                <CheckCircle2 className="h-3 w-3" />
                                {entry.actualAmount !== undefined ? `완료 (${entry.actualAmount}${unit})` : '완료됨'}
                              </span>
                            ) : (
                              <span className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-slate-100 bg-slate-50 text-slate-400 text-[10px] font-black">
                                미완료
                              </span>
                            )}
                            
                            {isPending && (
                              <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 text-left">
                                <p className="text-[10px] font-black text-slate-500">실제로 얼마나 했나요?</p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPendingAmount((v) => Math.max(0, v - 1))}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50 active:scale-95"
                                  >
                                    −
                                  </button>
                                  <span className="min-w-[3rem] text-center text-sm font-black text-slate-900">
                                    {pendingAmount}{unit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setPendingAmount((v) => v + 1)}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-50 active:scale-95"
                                  >
                                    +
                                  </button>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, true, pendingAmount, entry.dateKey);
                                      setPendingPlanId(null);
                                    }}
                                    className="flex-1 rounded-full bg-emerald-500 py-1.5 text-[10px] font-black text-white hover:bg-emerald-600 active:scale-[0.97]"
                                  >
                                    완료 확인
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingPlanId(null)}
                                    className="flex-1 rounded-full border border-slate-200 bg-white py-1.5 text-[10px] font-black text-slate-500 hover:bg-slate-50 active:scale-[0.97]"
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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
