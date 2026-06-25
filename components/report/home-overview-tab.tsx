'use client';

import React from 'react';
import { Sparkles, CheckCircle2, Clock, Award, MessageSquare } from 'lucide-react';
import { Student } from '@/lib/types/student';
import { StudyStatsCard, StudyStats } from './study-stats-card';
import { LeaderboardCard } from './leaderboard-card';
import { AttendanceStatusCard } from './attendance-status-card';
import { PomodoroTimer } from './pomodoro-timer-modal';

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

interface HomeOverviewTabProps {
  student: Student;
  setStudent: React.Dispatch<React.SetStateAction<Student | null>>;
  isStudentReport: boolean;
  todayDailyPlan: DailyPlanDay | undefined;
  todayPlanEntries: DailyPlanEntry[];
  pendingPlanId: string | null;
  setPendingPlanId: (id: string | null) => void;
  pendingAmount: number;
  setPendingAmount: React.Dispatch<React.SetStateAction<number>>;
  updatePlanCompletion: (materialType: 'book' | 'lecture', materialId: string, planId: string, isCompleted: boolean, actualAmount?: number, dateKey?: string) => void;
  homeAttend: { loading: boolean; checkedIn: boolean; todayMinutes: number; since: string | null; sinceToday: boolean };
  homeTotalMin: number;
  currentSubjectText: string;
  currentStudyLabel: string;
  currentStudyRange: string;
  timeGreeting: string;
  currentBriefingPhrase: string;
  briefingSubMessage: string;
  rewardBanner: { show: boolean; reasons: string[] };
  setRewardBanner: React.Dispatch<React.SetStateAction<{ show: boolean; reasons: string[] }>>;
  submitChecklist: (e: React.FormEvent) => Promise<void>;
  checklistForm: { sleepHours: number; phoneSubmitted: boolean };
  setChecklistForm: React.Dispatch<React.SetStateAction<{ sleepHours: number; phoneSubmitted: boolean }>>;
  checklistSubmitting: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  studyTimeLabels: Record<string, string>;
  studyStats: StudyStats | null;
  completedQuests: Record<number, boolean>;
  setCompletedQuests: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}

export function HomeOverviewTab({
  student,
  setStudent,
  isStudentReport,
  todayDailyPlan,
  todayPlanEntries,
  pendingPlanId,
  setPendingPlanId,
  pendingAmount,
  setPendingAmount,
  updatePlanCompletion,
  homeAttend,
  homeTotalMin,
  currentSubjectText,
  currentStudyLabel,
  currentStudyRange,
  timeGreeting,
  currentBriefingPhrase,
  briefingSubMessage,
  rewardBanner,
  setRewardBanner,
  submitChecklist,
  checklistForm,
  setChecklistForm,
  checklistSubmitting,
  activeTab,
  setActiveTab,
  studyTimeLabels,
  studyStats,
  completedQuests,
  setCompletedQuests,
}: HomeOverviewTabProps) {

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

  const renderCoachQuestList = () => {
    if (coachQuests.length === 0) return null;
    return (
      <div className="rounded-3xl border border-[#0071E3]/15 bg-white p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#0071E3]">
            🔵 코치 특별 퀘스트
          </h3>
          <span className="text-[10px] text-[#0071E3]/80 font-bold bg-[#0071E3]/5 px-2.5 py-1 rounded-full">
            완료 체크 시 리포트에 실시간 반영
          </span>
        </div>
        <div className="space-y-3.5 pl-0.5">
          {coachQuests.map((quest, idx) => {
            const storageKey = `ssc-coach-quest-done:${student.id}:${quest}:${idx}`;
            const isDone = completedQuests[idx] || false;
            return (
              <div key={`${quest}_${idx}`} className="flex items-center gap-3 text-xs font-bold text-slate-700 bg-slate-50/50 border border-slate-100/50 p-3.5 rounded-2xl">
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
                  className="w-4.5 h-4.5 rounded border-slate-300 text-[#0071E3] focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-transform active:scale-90"
                />
                <span className={isDone ? 'line-through text-slate-400 font-medium' : ''}>
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
            <div className="no-print relative overflow-hidden rounded-3xl border border-emerald-300/60 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 shadow-[0_8px_24px_rgba(16,185,129,0.12)] animate-fade-in-up">
              <div className="absolute -right-4 -top-4 text-6xl opacity-10 select-none pointer-events-none">🎁</div>
              <div className="flex items-start gap-3.5">
                <div className="shrink-0 w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
                  <span className="text-lg">🎁</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-emerald-800 tracking-tight">미션 달성! 쿠폰이 지급되었어요 🎉</p>
                  <p className="text-[11px] font-bold text-emerald-700/80 mt-0.5">오늘 학습 미션을 완수하여 휴가/반차 쿠폰이 자동 적립되었습니다.</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {rewardBanner.reasons.map((r, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 bg-white/80 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-200/60 shadow-sm">
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 🔵 뽀모도로 타이머 & 아침 자가 점검표 위젯 레이아웃 (가로 2열 그리드) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. 뽀모도로 타이머 */}
            <PomodoroTimer
              student={student}
              setStudent={setStudent}
              setRewardBanner={setRewardBanner}
            />

            {/* 2. 아침 자가 점검표 & 코칭 팁 */}
            {(() => {
              const note = getSpecialNoteObj();
              const todayKey = getSeoulDateKey();
              const checklist = note.daily_checklist?.[todayKey];

              if (!checklist) {
                return (
                  <form onSubmit={submitChecklist} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">아침 자가 점검표 ☀️</p>
                      <p className="text-[10px] text-slate-400/80 font-bold mt-0.5">매일 아침 본인의 컨디션과 환경을 스스로 기록하세요.</p>
                    </div>
                    
                    <div className="space-y-3 my-1">
                      <div className="flex justify-between items-center">
                        <label htmlFor="sleepHoursInput" className="text-xs font-bold text-slate-600">어젯밤 수면 시간:</label>
                        <div className="flex items-center gap-1">
                          <select
                            id="sleepHoursInput"
                            value={checklistForm.sleepHours}
                            onChange={(e) => setChecklistForm(f => ({ ...f, sleepHours: Number(e.target.value) }))}
                            className="rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs font-black text-slate-700 focus:border-[#0071E3] focus:outline-none"
                          >
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12].map(h => (
                              <option key={h} value={h}>{h}시간</option>
                            ))}
                          </select>
                        </div>
                      </div>

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
                {todayPlanEntries.map((entry, index) => {
                  const isPending = pendingPlanId === entry.id;
                  const _r = entry.rangeText || '';
                  const unit = _r.includes('문제') ? '문제' : _r.includes('강') ? '강' : _r.toLowerCase().includes('p') ? 'p' : _r.replace(/\d+회독/g, '').includes('회') ? '회' : '';
                  return (
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
                          onClick={() => {
                            if (entry.isCompleted) {
                              updatePlanCompletion(entry.materialType, entry.materialId, entry.planId, false, undefined, entry.dateKey);
                            } else {
                              setPendingPlanId(entry.id);
                              setPendingAmount(entry.dailyAmount ?? 1);
                            }
                          }}
                          aria-pressed={entry.isCompleted}
                          className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-[10px] font-black transition active:scale-[0.96] ${
                            entry.isCompleted
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : isPending
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-[#0071E3]/20 bg-[#0071E3]/5 text-[#0071E3] hover:bg-[#0071E3]/10'
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {entry.isCompleted ? `완료 (${entry.actualAmount ?? '?'}${unit})` : '완료'}
                        </button>
                      </div>
                      {isPending && (
                        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3">
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
              <p className="text-[10px] font-black uppercase tracking-wider text-[#0071E3]">오늘 누적 시간</p>
              <p className="mt-2 text-base font-black text-[#0071E3] tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtStudyMin(homeTotalMin)}
              </p>
              <p className="mt-1 text-[9px] font-bold text-slate-400">
                {homeAttend.checkedIn ? '등원 및 순공 합산' : '등원 기록 없음'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">관리자 배정 코치</p>
              <p className="mt-2 text-xs font-black text-slate-800 leading-tight truncate">{student.manager || '배정 대기'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">{getCampusLabel(student.campus)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">학습 기기 번호</p>
              <p className="mt-2 text-xs font-black text-slate-800 leading-tight truncate">{student.contact ? student.contact.slice(-4) : '등록 바람'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">SMS 수신 설정 완료</p>
            </div>
          </div>

          {/* 3단계 생활 및 순공 지표 (실시간 통계 컴포넌트 호출) */}
          <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-6">
            <AttendanceStatusCard />
            <StudyStatsCard stats={studyStats} />
            <LeaderboardCard studentId={student.id} />
          </div>

          {/* 코치 코멘트 피드백 퀘스트 리스트 */}
          {renderCoachQuestList()}
        </div>
      ) : (
        // 학부모 리포트인 경우, 심플 브리핑 요약 렌더링
        <div className="w-full space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071E3]/5 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#0071E3]">
                <Sparkles className="h-3.5 w-3.5 text-[#0071E3]" />
                SSC SPARTA PARENT REPORT
              </div>
              <h2 className="mt-2 text-2xl font-black text-slate-800">
                {student.name} 원생 학습 결과 리포트
              </h2>
            </div>
            <span className="rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500">
              학부모 브리핑 전용
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <h3 className="text-xs font-black tracking-wider text-slate-800 uppercase">실시간 등하원 상태</h3>
        </div>
        <AttendanceStatusCard />
      </section>
    )}

    <section id="study-stats" className={`scroll-mt-24 space-y-5 print-card ${!isStudentReport || activeTab === 'study-stats' ? '' : 'hidden print:block'}`}>
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-[#0071E3]" />
        <h3 className="text-xs font-black tracking-wider text-slate-800 uppercase">순공 시간 및 랭킹 리포트</h3>
      </div>
      <div className={`grid grid-cols-1 gap-6 ${isStudentReport ? 'lg:grid-cols-2' : ''}`}>
        <StudyStatsCard stats={studyStats} />
        {isStudentReport && <LeaderboardCard studentId={student.id} />}
      </div>
    </section>

    <section id="coach-feedback" className={`scroll-mt-24 space-y-4 print-card ${!isStudentReport || activeTab === 'coach-feedback' ? '' : 'hidden print:block'}`}>
      <h3 className="text-xs font-black text-[#1D1D1F] tracking-widest uppercase flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#0071E3]" />
        코칭 소견 및 생활 관리 피드백
      </h3>

      {isStudentReport ? (
        student.studentLifeComment ? (
          <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-700">
              {student.studentLifeComment}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
            <p className="text-xs font-bold text-slate-400">아직 학생용 코칭 소견이 등록되지 않았습니다.</p>
          </div>
        )
      ) : (
        student.lifeComment ? (
          <div className="rounded-3xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-5 md:p-6 shadow-sm">
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-700">
              {student.lifeComment}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
            <p className="text-xs font-bold text-slate-400">아직 학부모용 코칭 소견이 등록되지 않았습니다.</p>
          </div>
        )
      )}

      {isStudentReport && renderCoachQuestList()}
    </section>
    </>
  );
}
