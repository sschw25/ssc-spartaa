'use client';

import React from 'react';
import { MessageSquare, Plus, Trash2, CheckCircle2, Calendar, Rabbit, Turtle, BookPlus, CalendarCog, Pencil, RefreshCw, Lightbulb } from 'lucide-react';
import { ProposedGoal, Student } from '@/lib/types/student';

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';

type RequestForm = {
  requestType: string;
  message: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: GoalType;
  goalValue: string;
  currentProgress: string;
  proposedWeekNumber: string;
  proposedRangeText: string;
  speedMultiplier: string;
  currentGoalSnapshot: { goalType?: GoalType; goalValue?: number; speedMultiplier?: number } | null;
};

interface LearningRequestPanelProps {
  student: Student;
  isStudentReport: boolean;
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
  realignStudentPlans?: (mode: 'keepTargetDate' | 'keepPace') => Promise<void>;
  realigningPlans?: boolean;
}

export function LearningRequestPanel({
  student,
  isStudentReport,
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
}: LearningRequestPanelProps) {
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
    halfDay: '휴식신청',
    restPass: '휴식권 신청',
    etc: '기타',
  };

  const getRequestTypeLabel = (type?: string) => REQUEST_TYPE_LABEL[type || 'etc'] || '기타 신청';

  const QUICK_REQUESTS = [
    { type: 'etc', label: '상담 신청할래요', icon: MessageSquare, message: '상담을 신청합니다.' },
    { type: 'progress', label: '진도가 너무 빨라요', icon: Rabbit, message: '진도가 너무 빨라요. 속도를 조정하고 싶어요.' },
    { type: 'progress', label: '진도가 너무 느려요', icon: Turtle, message: '진도가 너무 느려요. 계획을 조정하고 싶어요.' },
    { type: 'subject', label: '과목 추가/변경', icon: BookPlus, message: '과목 추가 또는 변경을 신청합니다.' },
    { type: 'plan', label: '학습계획 바꾸고 싶어요', icon: CalendarCog, message: '학습계획 조정을 신청합니다.' },
    { type: 'progress', label: '진도 숫자 정정', icon: Pencil, message: '진도 숫자 정정이 필요해요.' },
  ];

  const handleQuickRequest = (type: string, message: string) => {
    setRequestCustomOpen(true);
    setRequestForm((f) => ({
      ...f,
      requestType: type,
      message: message,
      materialId: '',
      goalValue: '',
      currentProgress: '',
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
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          승인
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          반려
        </span>
      );
    }
    if (status === 'resolved' || status === 'completed') {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          처리완료
        </span>
      );
    }
    if (adminReply && adminReply.trim()) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 dark:bg-[#0071E3]/15 border border-[#0071E3]/20 px-2.5 py-0.5 text-[10px] font-black text-[#0071E3]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
          처리중
        </span>
      );
    }
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-white/10 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        접수중
      </span>
    );
  };

  if (!isStudentReport) return null;

  return (
    <div className="space-y-4">
      {/* 오래 쉬고 온 학생을 위한 진도 재조정 — 학생이 직접 실행하지 않고 코멘터에게 '요청'으로 전달 (#11) */}
      <div className="no-print rounded-3xl border border-amber-300 dark:border-white/10 bg-amber-50/60 dark:bg-amber-500/10 p-4 md:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              오랜만에 복귀하셨거나 진도가 많이 밀렸나요?
            </h4>
            <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
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
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 text-[10px] font-black px-3 py-2 shadow-sm transition active:scale-[0.98] whitespace-nowrap self-start sm:self-auto"
            >
              취소
            </button>
          )}
        </div>

        {realignRequested ? (
          <div className="rounded-2xl border border-emerald-200 dark:border-white/10 bg-emerald-50/70 dark:bg-emerald-500/10 px-3.5 py-2.5 text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            코멘터에게 계획 재조정 요청을 보냈어요. 검토 후 반영하거나 상담을 안내해 드릴게요. (아래 ‘학습 관련 요청’에서 진행 상황 확인)
          </div>
        ) : showRealignBox && (
          <div className="pt-3 border-t border-amber-200/60 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in-up">
            <button
              type="button"
              disabled={!!realignRequesting}
              onClick={() => requestRealign('keepTargetDate')}
              className="p-3.5 rounded-2xl border border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] hover:bg-[#0071E3]/[0.02] dark:hover:bg-[#0071E3]/15 text-left transition shadow-sm hover:border-[#0071E3]/40 disabled:opacity-50 group"
            >
              <div className="text-[11px] font-black text-[#0071E3] flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 목표 완료일 유지 요청 (추천)</span>
                <span className="text-[9px] font-bold bg-[#0071E3]/10 dark:bg-[#0071E3]/15 px-1.5 py-0.5 rounded">{realignRequesting === 'keepTargetDate' ? '전송 중' : '기본값'}</span>
              </div>
              <p className="mt-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                원래 약속된 목표일에 끝내기 위해, 밀렸던 분량만큼 하루 목표치를 늘리는 방향으로 코멘터에게 요청합니다.
              </p>
            </button>

            <button
              type="button"
              disabled={!!realignRequesting}
              onClick={() => requestRealign('keepPace')}
              className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 text-left transition shadow-sm hover:border-slate-500/40 disabled:opacity-50"
            >
              <div className="flex items-center gap-1 text-[11px] font-black text-slate-800 dark:text-slate-200">
                <Turtle className="w-3.5 h-3.5" /> 학습 페이스 유지 요청 {realignRequesting === 'keepPace' && <span className="text-[9px] text-slate-400">(전송 중)</span>}
              </div>
              <p className="mt-1 text-[9.5px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                하루 학습 강도는 유지하는 대신, 남은 분량만큼 완료 목표일을 늦추는 방향으로 코멘터에게 요청합니다.
              </p>
            </button>
          </div>
        )}
      </div>

      {/* 학생 변경 신청 (관리자에게) — 학생 본인만 노출. 학부모는 신청 권한이 없으므로 숨김 */}
      <div id="student-request-panel" className="no-print scroll-mt-28 rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-5 md:p-6 shadow-sm space-y-4">
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
                className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-[#0071E3]/40 hover:bg-[#0071E3]/[0.03] dark:hover:bg-[#0071E3]/15 active:scale-[0.97] disabled:opacity-50"
              >
                {React.createElement(q.icon, { className: 'h-4 w-4 shrink-0 text-[#0071E3]' })}
                <span className="min-w-0 leading-tight">{q.label}</span>
              </button>
            ))}
          </div>

          {/* 직접 작성 토글 */}
          <button
            type="button"
            onClick={() => setRequestCustomOpen(!requestCustomOpen)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 bg-white/60 dark:bg-white/5 py-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-300"
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
                    currentProgress: requestForm.requestType === 'progress' && requestForm.currentProgress ? Number(requestForm.currentProgress) : undefined,
                    proposedWeekNumber: requestForm.proposedWeekNumber ? Number(requestForm.proposedWeekNumber) : undefined,
                    proposedRangeText: requestForm.proposedRangeText || undefined,
                    speedMultiplier: requestForm.materialType === 'lecture' ? (requestForm.speedMultiplier ? Number(requestForm.speedMultiplier) : 1.0) : undefined,
                    currentGoal: requestForm.currentGoalSnapshot || undefined,
                  };
                }
                sendRequest(requestForm.requestType, requestForm.message, proposedGoal);
              }}
              className="space-y-2.5 rounded-2xl border border-slate-100 dark:border-white/10 bg-white/70 dark:bg-[#1c1c1e]/95 p-3"
            >
              <div className="bg-[#0071E3]/5 dark:bg-[#0071E3]/15 rounded-xl p-2.5 text-[10px] font-bold text-[#0071E3] mb-1 leading-normal flex items-start gap-1.5 border border-[#0071E3]/10">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>템플릿에 맞춰 내용을 채워 뒀어요. 아래에서 과목과 조정 내용을 고른 뒤 [신청하기]를 눌러 주세요.</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(REQUEST_TYPE_LABEL).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRequestForm((f) => ({ ...f, requestType: v }))}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${requestForm.requestType === v ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(requestForm.requestType === 'plan' || requestForm.requestType === 'progress') && (
                <div className="space-y-3 rounded-xl border border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-2.5 my-1 text-left">
                  <p className="text-[10px] font-black text-slate-400">바꿀 계획 상세 (신청에 자동 첨부돼요)</p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">대상 학습자료 선택</label>
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
                          goalType: material?.goalType === 'dailyAmount' ? 'dailyAmount' : 'deadlineWeeks',
                          goalValue: material?.goalValue ? String(material.goalValue) : '',
                          currentProgress: material
                            ? String(isBook ? (book?.currentPage || 0) : (lecture?.completedLectures || 0))
                            : '',
                          speedMultiplier: !isBook && lecture?.speedMultiplier ? String(lecture.speedMultiplier) : '1.0',
                          currentGoalSnapshot: material ? {
                            goalType: material.goalType,
                            goalValue: material.goalValue,
                            speedMultiplier: !isBook ? lecture?.speedMultiplier : undefined,
                          } : null,
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-material-select"
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
                        <div className="rounded-lg bg-slate-100/80 dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <span className="font-black text-slate-400">현재 설정:</span>
                          <span>{requestForm.currentGoalSnapshot.goalType === 'weeks' ? '목표 기간' : requestForm.currentGoalSnapshot.goalType === 'deadlineWeeks' ? '기간 목표' : requestForm.currentGoalSnapshot.goalType === 'weeklyAmount' ? '주간 학습량' : '일일 학습량'} {requestForm.currentGoalSnapshot.goalValue}{requestForm.currentGoalSnapshot.goalType === 'weeks' || requestForm.currentGoalSnapshot.goalType === 'deadlineWeeks' ? '주' : requestForm.materialType === 'book' ? 'p' : '강'}</span>
                          {requestForm.currentGoalSnapshot.speedMultiplier && requestForm.currentGoalSnapshot.speedMultiplier !== 1.0 && (
                            <span>· {requestForm.currentGoalSnapshot.speedMultiplier}배속</span>
                          )}
                          <span className="text-slate-400">→ 아래에서 변경할 값을 입력하세요</span>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">목표 설정 방식</label>
                          <select
                            value={requestForm.goalType}
                            onChange={(e) => setRequestForm((f) => ({ ...f, goalType: e.target.value as GoalType }))}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-goal-type-select"
                          >
                            <option value="deadlineWeeks">기간 목표(주 선택)</option>
                            <option value="dailyAmount">일일 학습량</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">목표 수치</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={requestForm.goalValue}
                              onChange={(e) => setRequestForm((f) => ({ ...f, goalValue: e.target.value }))}
                              placeholder="예: 8"
                              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-goal-value-input"
                            />
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              {requestForm.goalType === 'weeks' || requestForm.goalType === 'deadlineWeeks' ? '주' : requestForm.materialType === 'book' ? 'p' : '강'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {requestForm.materialType === 'lecture' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">제안할 강의 배속 설정</label>
                          <select
                            value={requestForm.speedMultiplier || '1.0'}
                            onChange={(e) => setRequestForm((f) => ({ ...f, speedMultiplier: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-speed-multiplier-select"
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
                        <div className="space-y-2 border-t border-slate-200/60 dark:border-white/10 pt-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">현재 진도 정정</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                value={requestForm.currentProgress}
                                onChange={(e) => setRequestForm((f) => ({ ...f, currentProgress: e.target.value }))}
                                placeholder={requestForm.materialType === 'book' ? '예: 39' : '예: 36'}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-current-progress-input"
                              />
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {requestForm.materialType === 'book' ? 'p' : '강'}
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400">특정 주차 범위 정정 (선택사항)</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">주차 번호</label>
                              <input
                                type="number"
                                value={requestForm.proposedWeekNumber}
                                onChange={(e) => setRequestForm((f) => ({ ...f, proposedWeekNumber: e.target.value }))}
                                placeholder="예: 1"
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-week-number-input"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">수정할 범위</label>
                              <input
                                type="text"
                                value={requestForm.proposedRangeText}
                                onChange={(e) => setRequestForm((f) => ({ ...f, proposedRangeText: e.target.value }))}
                                placeholder="예: 1p ~ 50p"
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-range-text-input"
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
                className={`w-full resize-none rounded-xl border bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 ${validationError ? 'border-red-400 focus:border-red-400' : 'border-slate-200 dark:border-white/10 focus:border-[#0071E3]'}`}
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
                  <div key={r.id} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">{getRequestTypeLabel(r.requestType)}</span>
                        {getTimelineStatusBadge(r.status || 'pending', r.adminReply)}
                      </span>
                      <button type="button" onClick={() => cancelRequest(r.id)} className="shrink-0 text-slate-300 dark:text-slate-600 transition-colors hover:text-red-500" aria-label="신청 취소">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-600 dark:text-slate-400">{r.content}</p>
                    {r.adminReply && (
                      <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
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
                      className="flex w-full items-center justify-between rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 px-3 py-2 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/10"
                    >
                      <span>지난 학습 요청 보기 ({resolved.length}건)</span>
                      <span className="text-[10px]">{showRequestHistory ? '접기 ▲' : '펼치기 ▼'}</span>
                    </button>

                    {showRequestHistory && (
                      <div className="space-y-2 pl-1 border-l-2 border-slate-100 dark:border-white/10 ml-1">
                        {resolved.map((r) => (
                          <div key={r.id} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-3 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0 rounded-full bg-white dark:bg-[#1c1c1e] px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10">{getRequestTypeLabel(r.requestType)}</span>
                                {getTimelineStatusBadge(r.status || 'resolved', r.adminReply)}
                                <span className="shrink-0 text-[10px] font-bold text-slate-400">{r.date}</span>
                              </span>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words font-semibold text-slate-500 dark:text-slate-400">{r.content}</p>
                            {r.adminReply && (
                              <div className="mt-2 rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.05] dark:bg-[#0071E3]/15 px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
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
    </div>
  );
}
