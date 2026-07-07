'use client';

import React, { useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Student, BookProgress, LectureProgress, ConsultationLog, GradeItem, SubjectProgress, SharedMaterial, DetailedPlan, ReviewPassSetting } from '@/lib/types/student';
import { getStudentTodayTotalStudyTimeMin, getEstimatedStudyTimeMin, getActiveStudyDays, getMaterialStudyDays } from '@/lib/progress-plan';
import {
  formatMaterialBenchmarkSummary,
  getMaterialBenchmark,
} from '@/lib/material-benchmark';
import { BenchmarkSection } from '@/components/learning/benchmark-section';
import { STUDY_TIME_SLOTS } from '@/lib/academy-timetable';
import { toast } from 'sonner';
import { Plus, Minus, Trash2, Calendar, User, Phone, CheckCircle, BookOpen, Tv, MessageSquare, Award, Copy, Link, Printer, Loader2, Pencil, Save, ArrowLeft, LayoutDashboard, ChevronDown, ChevronUp } from 'lucide-react';
import { useDetailSheet } from '@/components/admin/detail-tabs/detail-sheet-context';
import { LearningConsultationPanel } from '@/components/admin/detail-tabs/learning-consultation-panel';
import { LectureReviewRecommender } from '@/components/admin/detail-tabs/lecture-review-recommender';

const WEEKDAY_OPTIONS: Array<['mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', string]> = [
  ['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금'], ['sat', '토'], ['sun', '일'],
];

// 자료별 학습 요일 선택기 — 과목 요일과 별개로 이 교재/강의만의 요일을 지정한다.
// 자료에 개별 요일이 없으면 과목 요일(없으면 기본 월~토)을 폴백으로 보여준다.
function MaterialStudyDayPicker({
  subId,
  materialId,
  type,
  subjectStudyDays,
  materialStudyDays,
  onToggle,
}: {
  subId: string;
  materialId: string;
  type: 'book' | 'lecture';
  subjectStudyDays?: string[];
  materialStudyDays?: string[];
  onToggle: (subId: string, materialId: string, type: 'book' | 'lecture', day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun') => void;
}) {
  const active = getActiveStudyDays(getMaterialStudyDays(subjectStudyDays, materialStudyDays));
  const hasOwn = !!(materialStudyDays && materialStudyDays.length > 0);
  return (
    <div className="space-y-1">
      <Label className="text-[9px] text-slate-500 dark:text-slate-400">
        이 자료 학습 요일 <span className="font-semibold text-[#0071E3]">{hasOwn ? '개별 지정' : '기본(월~토)'}</span>
      </Label>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_OPTIONS.map(([day, label]) => {
          const on = active.includes(day);
          return (
            <Button
              key={day}
              type="button"
              variant={on ? 'default' : 'outline'}
              onClick={() => onToggle(subId, materialId, type, day)}
              className={`h-6 rounded-md text-[9px] px-0 ${on ? 'bg-[#0071E3] text-white' : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// 시작점 조정 이력 — 학생이 시작점(current)을 옮긴 감사 로그(adjustLog) 읽기 전용 노출.
// 최근 5개(최신 먼저). (자동)=하루 한도 내 즉시 반영 / (승인)=신청 후 관리자 승인 반영.
// 표시는 학생 화면과 동일하게 "시작점"(=current+1) 기준. 사유는 괄호+툴팁.
function MaterialAdjustLogList({
  adjustLog,
  unit,
}: {
  adjustLog?: BookProgress['adjustLog'];
  unit: string;
}) {
  const entries = (adjustLog || []).slice(-5).reverse();
  if (entries.length === 0) return null;
  const fmtDate = (key: string) => {
    const [, m, d] = key.split('-');
    return `${Number(m)}/${Number(d)}`;
  };
  return (
    <div className="pt-2 border-t border-black/[0.03] dark:border-white/10 space-y-1">
      <Label className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">시작점 조정 이력 (학생)</Label>
      <div className="space-y-0.5">
        {entries.map((entry, idx) => (
          <p
            key={`${entry.date}_${idx}`}
            title={entry.reason || undefined}
            className="text-[10px] text-slate-600 dark:text-slate-300 tabular-nums truncate"
          >
            {fmtDate(entry.date)} 시작점 {(Number(entry.from) || 0) + 1}{unit}→{(Number(entry.to) || 0) + 1}{unit} ({entry.auto ? '자동' : '승인'})
            {entry.reason ? <span className="text-slate-400 dark:text-slate-500"> — {entry.reason}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ProgressTab() {
  const {
    categoryFilter,
    collapsedSubjects,
    commitProgressValue,
    cslContent,
    cslDate,
    cslManager,
    cslNextDate,
    customCategories,
    customUnitInput,
    debouncedQuickPlanText,
    dropdownRef,
    editingGoals,
    editingMaterialEstimatedMinutes,
    editingMaterialSpeedMultiplier,
    editingMaterialId,
    editingMaterialTitle,
    editingMaterialTotal,
    generateAndSavePlans,
    handleAddConsultationSubmit,
    handleApplyQuickPlan,
    handleConsultationContentChange,
    handleCreateCustomCategory,
    handleDeleteSubject,
    handleSaveMaterial,
    handleToggleMaterialStudyDay,
    handleUpdateSubjectStudyTime,
    hasSearchedIntegrated,
    integratedSearchResults,
    integratedSearchTimerRef,
    isAutoSaving,
    isApplyingQuickPlan,
    isCustomUnit,
    isLearningInputOpen,
    isSearchingIntegrated,
    learningInputMode,
    learningLogs,
    loadEtcStudyTemplate,
    loadNotionTemplate,
    loading,
    materialBenchmarks,
    materialTargetDates,
    newMaterialAuthor,
    newMaterialCategory,
    newMaterialEstimatedMinutes,
    newMaterialSpeedMultiplier,
    newMaterialPublisher,
    newMaterialSubject,
    newMaterialTitle,
    newMaterialTotal,
    newMaterialType,
    newMaterialUnit,
    progressDrafts,
    queueIntegratedMaterialSearch,
    quickPlanPreview,
    quickPlanText,
    setCategoryFilter,
    setCollapsedSubjects,
    setCslDate,
    setCslManager,
    setCslNextDate,
    setCustomUnitInput,
    setEditingGoals,
    setEditingMaterialEstimatedMinutes,
    setEditingMaterialSpeedMultiplier,
    setEditingMaterialId,
    setEditingMaterialTitle,
    setEditingMaterialTotal,
    setHasSearchedIntegrated,
    setIntegratedSearchResults,
    setIsCustomUnit,
    setIsLearningInputOpen,
    setLearningInputMode,
    setMaterialTargetDates,
    setNewMaterialAuthor,
    setNewMaterialCategory,
    setNewMaterialEstimatedMinutes,
    setNewMaterialSpeedMultiplier,
    setNewMaterialPublisher,
    setNewMaterialSubject,
    setNewMaterialTitle,
    setNewMaterialTotal,
    setNewMaterialType,
    setNewMaterialUnit,
    setProgressDraft,
    setQuickPlanText,
    setShowGuideDetail,
    setShowIntegratedSuggestions,
    setSortOrder,
    setSubjectsState,
    setWeeklyPlanRanges,
    showGuideDetail,
    showIntegratedSuggestions,
    sortOrder,
    studentId,
    subjectsState,
    planStartOf,
    updateMaterialPlanStart,
    updateBookGoalField,
    updateLectureGoalField,
    updateProgress,
    updateReviewPassSetting,
    wasOpenRef,
    weeklyPlanRanges,
  } = useDetailSheet();
  return (
    <>

              <LearningConsultationPanel />

              <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">학습/교재 입력</h4>
                  <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    교재, 인강, 빠른 학습 입력은 필요할 때만 팝업에서 추가합니다.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (integratedSearchTimerRef.current) {
                      clearTimeout(integratedSearchTimerRef.current);
                    }
                    setIntegratedSearchResults([]);
                    setHasSearchedIntegrated(false);
                    setShowIntegratedSuggestions(false);
                    setLearningInputMode(null);
                    setIsLearningInputOpen(true);
                  }}
                  className="admin-fit-button h-8 shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-[#323236]"
                >
                  입력하기
                </Button>
              </div>

              <Dialog open={isLearningInputOpen} onOpenChange={setIsLearningInputOpen}>
                <DialogContent className="max-h-[88vh] overflow-y-auto bg-white dark:bg-[#1c1c1e] p-0 sm:max-w-2xl">
                  <DialogHeader className="border-b border-black/[0.05] dark:border-white/10 px-5 py-4">
                    <DialogTitle className="text-base text-slate-900 dark:text-slate-100">학습/교재 입력</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                      빠른 학습 입력 또는 교재/인강 자료를 추가합니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 p-5">
                    {!learningInputMode && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setLearningInputMode('quick')}
                          className="rounded-xl border border-black/[0.06] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 text-left transition-colors hover:bg-[#F5F5F7] dark:hover:bg-white/5"
                        >
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">빠른 학습 입력</div>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 break-keep">
                            한 줄 입력으로 과목, 교재/강좌와 현재 진도 위치를 일괄 등록합니다.
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLearningInputMode('material')}
                          className="rounded-xl border border-black/[0.06] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 text-left transition-colors hover:bg-[#F5F5F7] dark:hover:bg-white/5"
                        >
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">교재/인강 추가</div>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            과목에 교재나 인강 자료를 하나씩 등록합니다.
                          </p>
                        </button>
                      </div>
                    )}
                    {learningInputMode === 'quick' && (
              <div className="space-y-3.5 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">빠른 학습 입력</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 break-keep">
                      한 줄로 입력하면 과목과 자료, 현재 진도 위치가 등록됩니다. 목표는 등록 후 자료별로 설정합니다.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setQuickPlanText('행정법 기본강의 4강/64강\n매일 영어 단어장 30p/200p\n월수금 오후 수학I 기출문제집 15/150p\n국어 봉투모의고사 10회')}
                      className="admin-fit-button rounded-lg text-xs h-8 border-black/[0.08] dark:border-white/10 bg-white dark:bg-white/5 px-3 font-bold text-slate-900 dark:text-slate-100 hover:bg-[#F5F5F7] dark:hover:bg-white/10"
                    >
                      예시 입력
                    </Button>
                    <Button
                      type="button"
                      onClick={handleApplyQuickPlan}
                      disabled={isApplyingQuickPlan}
                      className="admin-fit-button rounded-lg text-xs h-8 bg-slate-900 hover:bg-[#323236] text-white px-3 font-bold flex items-center justify-center"
                    >
                      {isApplyingQuickPlan ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          반영 중...
                        </>
                      ) : (
                        '학습DB 반영'
                      )}
                    </Button>
                  </div>
                </div>

                <textarea
                  placeholder={'예: 행정법 기본강의 4강/64강 (64강 중 4강까지 들음)\n예: 영어 단어장 30p/200p (200p 중 30p까지 풂)\n예: 수학I 기출문제집 150p (새 교재 = 0/150p)\n예: 행정법 행정법오엑스 (이름만 = 총량·요일은 나중에 설정)\n예: 월수금 오전 국어 봉투모의고사 2회/10회 (요일·시간대는 선택)'}
                  value={quickPlanText}
                  onChange={(e) => setQuickPlanText(e.target.value)}
                  className="flex w-full rounded-lg border border-black/[0.08] dark:border-white/10 px-3 py-2 text-xs bg-white dark:bg-white/5 dark:text-slate-100 min-h-[78px] resize-y outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/20"
                />

                <div className="rounded-lg bg-[#F5F5F7]/70 dark:bg-white/5 border border-black/[0.03] dark:border-white/10 p-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-bold text-slate-600 dark:text-slate-300 flex items-center">
                      빠른 입력 가이드 및 예시
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowGuideDetail(!showGuideDetail)}
                      className="text-[10px] font-bold text-[#0071E3] hover:underline cursor-pointer focus:outline-none"
                    >
                      {showGuideDetail ? '접기' : '자세히 보기'}
                    </button>
                  </div>
                  {!showGuideDetail ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal break-keep">
                      한 줄에 하나씩 입력하면 자료와 현재 진도 위치가 일괄 등록됩니다. 첫 숫자 = 지금까지 한 위치, 둘째 숫자 = 총량입니다.
                    </p>
                  ) : (
                    <>
                      <p>
                        • <strong>한 줄에 하나씩</strong> 입력하여 여러 자료를 동시에 등록할 수 있습니다.
                      </p>
                      <p>
                        • 입력 형식: <strong>[요일(선택)] [시간대(선택)] [과목명] [자료명] [현재 위치/총분량(필수)]</strong>
                      </p>
                      <p>
                        • <strong>현재 위치/총분량</strong>: <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">4강/64강</code>은 <strong>총 64강 중 4강까지 수강함</strong>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">30p/200p</code>는 <strong>총 200p 중 30p까지 풂</strong>을 뜻합니다. 슬래시 없이 <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">150p</code>처럼 총량만 쓰면 아직 시작 전(0/150p)으로 등록됩니다. 페이지(p), 강의(강), 회차(회) 외에 <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">장</code>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">문제</code>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">세트</code> 등 커스텀 단위도 감지합니다. <strong>자료명만</strong> 써도(예: <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">행정법 행정법오엑스</code>) 일단 등록되고, 총량·요일·목표는 나중에 자료별 설정에서 지정할 수 있어요.
                      </p>
                      <p>
                        • <strong>과목 및 자료명</strong>: 요일/시간대 키워드 뒤에 오는 <strong>첫 단어</strong>가 과목명으로 감지되며, 그 뒤 단어들이 교재/강좌명이 됩니다.
                      </p>
                      <p>
                        • <strong>요일/시간대(선택)</strong>: <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">매일</code>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">월수금</code>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">월,수,금</code>, <code className="bg-black/[0.05] dark:bg-white/10 px-1 rounded text-slate-900 dark:text-slate-100">오전/오후</code> 등을 문장 앞에 붙이면 과목의 학습 요일/시간대로만 저장됩니다. 없어도 등록에는 지장이 없습니다.
                      </p>
                      <p>
                        • <strong>목표와 계획</strong>: 빠른 입력은 자료 등록까지만 담당합니다. 기간 목표(N주 완주)나 일일 목표(하루 N강/Np)는 등록 후 자료별 <strong>학습 목표 설정</strong>에서 지정하세요.
                      </p>
                      <div className="border-t border-black/[0.05] dark:border-white/10 pt-1.5 mt-1.5 text-xs text-slate-900 dark:text-slate-100 space-y-1">
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">정확한 입력 예시:</p>
                        <p className="text-[11px] font-mono bg-white/60 dark:bg-white/5 p-1.5 rounded border border-black/[0.04] dark:border-white/10 leading-relaxed">
                          행정법 기본강의 4강/64강 <span className="text-slate-500 dark:text-slate-400 text-[10px]">(총 64강 중 4강까지 들음)</span> <br/>
                          영어 단어장 30p/200p <span className="text-slate-500 dark:text-slate-400 text-[10px]">(총 200p 중 30p까지 풂)</span> <br/>
                          수학I 기출문제집 150p <span className="text-slate-500 dark:text-slate-400 text-[10px]">(새 교재, 0/150p로 등록)</span> <br/>
                          월수금 오전 국어 봉투모의고사 2회/10회 <span className="text-slate-500 dark:text-slate-400 text-[10px]">(요일·시간대는 선택 입력)</span> <br/>
                          영어 어휘 10문제/100문제 <span className="text-slate-500 dark:text-slate-400 text-[10px]">(커스텀 단위 '문제')</span> <br/>
                          행정법 행정법오엑스 <span className="text-slate-500 dark:text-slate-400 text-[10px]">(이름만 등록 = 총량·목표는 나중에 설정)</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {debouncedQuickPlanText.trim() && (
                  <div className="space-y-1.5 rounded-lg bg-[#F5F5F7] dark:bg-white/5 border border-black/[0.03] dark:border-white/10 p-3">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">자동 감지 결과</p>
                    {quickPlanPreview.length === 0 ? (
                      <p className="text-[10px] text-red-500 break-keep">
                        인식할 수 없습니다. 마지막에 4강/64강, 30p/200p처럼 [현재 위치/총량]을 붙여주세요.
                      </p>
                    ) : (
                      <>
                        {quickPlanPreview.map((plan, index) => (
                          <div key={`${plan.original}_${index}`} className="admin-fit-row flex items-center justify-between gap-2 text-[10px]">
                            <span className="admin-fit-text font-bold text-slate-900 dark:text-slate-100">
                              {plan.subjectName} · {plan.title}
                            </span>
                            {plan.invalidReason ? (
                              <span className="shrink-0 text-red-500 font-bold break-keep">
                                {plan.invalidReason}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[#0071E3] font-bold">
                                {[plan.cadence, plan.timeLabel].filter(Boolean).join(' ')}{plan.cadence || plan.timeLabel ? ' · ' : ''}{plan.totalAmount > 0 ? `현재 ${plan.currentAmount}/${plan.totalAmount}${plan.unit}` : `${plan.type === 'lecture' ? '인강' : '교재'} · 총량 미정(나중에 설정)`}
                              </span>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 break-keep">
                          목표(기간/일일)는 등록 후 자료별 학습 목표 설정에서 지정합니다.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
                    )}

              {/* 통합 자료(교재/인강) 등록 폼 */}
              {learningInputMode === 'material' && (
              <div className="admin-fit-box p-5 rounded-2xl border border-black/[0.06] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/10 pb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center">
                    통합 학습 자료(교재/인강) 추가
                  </h3>
                  <div className="flex bg-black/[0.05] dark:bg-white/10 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setNewMaterialType('book');
                        if (integratedSearchTimerRef.current) {
                          clearTimeout(integratedSearchTimerRef.current);
                        }
                        setIntegratedSearchResults([]);
                        setHasSearchedIntegrated(false);
                        setShowIntegratedSuggestions(false);
                      }}
                      className={`text-[10px] px-3 py-1 font-bold rounded-md transition-all ${
                        newMaterialType === 'book'
                          ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      교재 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMaterialType('lecture');
                        if (integratedSearchTimerRef.current) {
                          clearTimeout(integratedSearchTimerRef.current);
                        }
                        setIntegratedSearchResults([]);
                        setHasSearchedIntegrated(false);
                        setShowIntegratedSuggestions(false);
                      }}
                      className={`text-[10px] px-3 py-1 font-bold rounded-md transition-all ${
                        newMaterialType === 'lecture'
                          ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      인강 추가
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 과목명 지정 영역 */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">과목 선택 및 입력</Label>
                    <div className="relative">
                      <Input
                        placeholder="과목명 직접 입력 (예: 수학I, 영어독해)"
                        value={newMaterialSubject}
                        onChange={(e) => setNewMaterialSubject(e.target.value)}
                        className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100"
                      />
                    </div>
                    {/* 빠른 선택 칩 */}
                    {subjectsState.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">기존 과목:</span>
                        {subjectsState.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setNewMaterialSubject(sub.name);
                              setIntegratedSearchResults([]);
                              setHasSearchedIntegrated(false);
                              setShowIntegratedSuggestions(false);
                            }}
                            className={`h-5 text-[9px] px-2.5 rounded-full border transition-all ${
                              newMaterialSubject === sub.name
                                ? 'bg-[#0071E3] text-white border-[#0071E3] font-bold'
                                : 'bg-white dark:bg-white/5 text-[#515154] dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/10'
                            }`}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 제목 입력 및 공유 DB 자동완성 영역 */}
                  <div className="space-y-2 relative">
                    <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {newMaterialType === 'book' ? '교재명' : '인강 강좌명'}
                    </Label>
                    <div className="relative" ref={dropdownRef}>
                      <Input
                        placeholder={newMaterialType === 'book' ? "교재명 입력 (예: 쎈 수학I)" : "인강 강좌명 입력 (예: 뉴런 수학I)"}
                        value={newMaterialTitle}
                        onMouseDown={() => {
                          wasOpenRef.current = showIntegratedSuggestions;
                        }}
                        onFocus={() => {
                          if (!showIntegratedSuggestions && integratedSearchResults.length > 0) {
                            setShowIntegratedSuggestions(true);
                          }
                        }}
                        onClick={() => {
                          if (wasOpenRef.current) {
                            setShowIntegratedSuggestions(false);
                          } else if (integratedSearchResults.length > 0) {
                            setShowIntegratedSuggestions(true);
                          }
                        }}
                        onChange={(e) => {
                          const query = e.target.value;
                          setNewMaterialTitle(query);
                          queueIntegratedMaterialSearch(query);
                        }}
                        className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100"
                      />

                      {/* 공유 DB 자동완성 드롭다운 */}
                      {showIntegratedSuggestions && (isSearchingIntegrated || hasSearchedIntegrated || integratedSearchResults.length > 0) && (
                        <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-[#1c1c1e] border border-black/[0.08] dark:border-white/10 rounded-xl shadow-lg z-[60] max-h-56 overflow-y-auto">
                          <div className="px-2.5 py-1.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-[#F5F5F7] dark:bg-white/5 border-b border-black/[0.04] dark:border-white/10 flex justify-between items-center">
                            <span>공유 DB 검색 결과</span>
                            <button
                              type="button"
                              onClick={() => setShowIntegratedSuggestions(false)}
                              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-[9px]"
                            >
                              닫기
                            </button>
                          </div>
                          {isSearchingIntegrated && (
                            <div className="p-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">검색 중...</div>
                          )}
                          {!isSearchingIntegrated && hasSearchedIntegrated && integratedSearchResults.length === 0 && (
                            <div className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                              일치하는 공유 자료가 없습니다. 직접 입력하여 추가하세요.
                            </div>
                          )}
                          {integratedSearchResults.map(mat => (
                            <div
                              key={mat.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewMaterialTitle(mat.name);
                                setNewMaterialTotal(mat.totalPagesOrLectures);
                                setNewMaterialSubject(mat.subject);
                                if (mat.type === 'book') {
                                  setNewMaterialPublisher(mat.publisher || '');
                                }
                                setNewMaterialAuthor(mat.author || '');
                                setShowIntegratedSuggestions(false);
                                toast.info(`공유 DB '${mat.name}' 정보 및 과목명이 적용되었습니다.`);
                              }}
                              className="admin-fit-row p-2 text-xs hover:bg-[#F5F5F7] dark:hover:bg-white/5 cursor-pointer flex justify-between items-center gap-2 border-b border-black/[0.02] dark:border-white/10"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="admin-fit-text block font-bold text-slate-900 dark:text-slate-100">{mat.name}</span>
                                <span className="admin-fit-text block text-[9px] text-slate-500 dark:text-slate-400">
                                  {mat.type === 'book' ? (mat.publisher || mat.author || '저자/출판사 정보없음') : (mat.author || '강사 정보없음')} · {mat.subject}
                                </span>
                              </div>
                              <span className="text-[9px] font-bold text-[#0071E3] shrink-0">
                                {mat.totalPagesOrLectures}{mat.type === 'book' ? 'p' : '강'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* 총 분량 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                        {newMaterialType === 'book' ? `총 분량 (${newMaterialUnit === 'p' ? '페이지' : newMaterialUnit})` : '총 강의 수'}
                      </Label>
                      {newMaterialType === 'book' && (
                        <div className="flex gap-1 items-center">
                          <button
                            type="button"
                            onClick={() => {
                              setNewMaterialUnit('p');
                              setIsCustomUnit(false);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors ${
                              !isCustomUnit && newMaterialUnit === 'p'
                                ? 'bg-slate-900 text-white border-transparent'
                                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10'
                            }`}
                          >
                            페이지
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewMaterialUnit('회');
                              setIsCustomUnit(false);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors ${
                              !isCustomUnit && newMaterialUnit === '회'
                                ? 'bg-slate-900 text-white border-transparent'
                                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10'
                            }`}
                          >
                            회
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomUnit(true);
                              setNewMaterialUnit(customUnitInput || '장');
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold border transition-colors ${
                              isCustomUnit
                                ? 'bg-slate-900 text-white border-transparent'
                                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10'
                            }`}
                          >
                            직접 입력
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={newMaterialType === 'book' ? (newMaterialUnit === 'p' ? "예: 350" : "예: 10") : "예: 30"}
                        value={newMaterialTotal || ''}
                        onChange={(e) => setNewMaterialTotal(e.target.value === '' ? '' : Number(e.target.value))}
                        className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100 flex-1"
                      />
                      {newMaterialType === 'book' && isCustomUnit && (
                        <Input
                          placeholder="단위 (예: 장, 문제)"
                          value={customUnitInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomUnitInput(val);
                            setNewMaterialUnit(val || '장');
                          }}
                          className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100 w-24 shrink-0"
                        />
                      )}
                    </div>
                  </div>

                  {/* 출판사 (교재 전용) / 강사 (인강 전용) */}
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {newMaterialType === 'book' ? '출판사 (선택)' : '강사/플랫폼 (선택)'}
                    </Label>
                    <Input
                      placeholder={newMaterialType === 'book' ? "예: 신사고" : "예: 현우진/메가스터디"}
                      value={newMaterialType === 'book' ? newMaterialPublisher : newMaterialAuthor}
                      onChange={(e) => {
                        if (newMaterialType === 'book') {
                          setNewMaterialPublisher(e.target.value);
                        } else {
                          setNewMaterialAuthor(e.target.value);
                        }
                      }}
                      className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100"
                    />
                  </div>

                  {/* 저자 (교재 전용 필드) */}
                  {newMaterialType === 'book' && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">저자 (선택)</Label>
                      <Input
                        placeholder="예: 홍길동"
                        value={newMaterialAuthor}
                        onChange={(e) => setNewMaterialAuthor(e.target.value)}
                        className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                      {newMaterialType === 'book' ? '단위당 예상 소요 시간 (선택)' : '강의당 예상 소요 시간 (선택)'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder={newMaterialType === 'book' ? "예: 1.5" : "예: 60"}
                        value={newMaterialEstimatedMinutes}
                        onChange={(e) => setNewMaterialEstimatedMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                        className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100 flex-1"
                      />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">분</span>
                    </div>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      지정하지 않으면 기본값({newMaterialType === 'book' ? '단위별 기준 시간' : '60분'})이 적용됩니다.
                    </p>
                  </div>

                  {newMaterialType === 'lecture' && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">기본 강의 배속 설정</Label>
                      <select
                        value={newMaterialSpeedMultiplier}
                        onChange={(e) => setNewMaterialSpeedMultiplier(Number(e.target.value))}
                        className="w-full rounded-lg border border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100 px-2 focus:outline-none"
                      >
                        <option value="1.0">1.0 배속 (기본)</option>
                        <option value="1.2">1.2 배속</option>
                        <option value="1.5">1.5 배속</option>
                        <option value="1.8">1.8 배속</option>
                        <option value="2.0">2.0 배속</option>
                      </select>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">
                        인강 학습 시 기본 적용할 배속을 지정합니다.
                      </p>
                    </div>
                  )}
                </div>

                {/* 학습 유형 분류 (동적 카테고리) 및 플러스 버튼 */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">학습 자료 유형 (그룹)</Label>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {customCategories.map((cat) => {
                      const isActive = newMaterialCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setNewMaterialCategory(cat)}
                          className={`h-7 text-[10px] px-3 rounded-lg border font-semibold transition-all ${
                            isActive
                              ? newMaterialType === 'book'
                                ? 'bg-[#0071E3] text-white border-[#0071E3]'
                                : 'bg-[#0071E3] text-white border-[#0071E3]'
                              : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/10'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                    {/* 카테고리 추가 플러스 버튼 */}
                    <button
                      type="button"
                      onClick={handleCreateCustomCategory}
                      className="h-7 w-7 flex items-center justify-center rounded-lg border border-dashed border-black/[0.2] dark:border-white/20 bg-white dark:bg-white/5 hover:bg-black/[0.02] dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
                      title="새 그룹 추가"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/[0.04] dark:border-white/10">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    * 등록 시 지정한 과목명으로 과목 카드가 자동 생성되거나 추가됩니다.
                  </span>
                  <Button
                    onClick={handleSaveMaterial}
                    disabled={loading || isAutoSaving}
                    className={`rounded-lg text-xs h-9 px-5 font-bold text-white transition-all shadow-sm flex items-center justify-center ${
                      newMaterialType === 'book'
                        ? 'bg-slate-900 hover:bg-[#323236]'
                        : 'bg-[#0071E3] hover:bg-[#973df8]'
                    }`}
                  >
                    {loading || isAutoSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      '자료 및 과목 등록'
                    )}
                  </Button>
                </div>
              </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* 과목 리스트 */}
              {subjectsState.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 dark:text-slate-400 bg-[#F5F5F7] dark:bg-white/5 rounded-2xl border border-dashed border-black/[0.05] dark:border-white/10">
                  설정된 과목이 없습니다. 상단 통합 등록 폼에서 첫 교재/인강을 등록하여 과목을 시작하세요.
                </div>
              ) : (
                <div className="space-y-6">
                  {subjectsState.map((sub) => {
                    const isCollapsed = collapsedSubjects[sub.id] ?? true;
                    return (
                      <Card key={sub.id} id={`subject-card-${sub.name}`} className="border border-black/[0.06] dark:border-white/10 dark:bg-[#1c1c1e] shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader
                          className="bg-[#F5F5F7] dark:bg-white/5 p-4 flex flex-row items-center justify-between cursor-pointer select-none"
                          onClick={() => setCollapsedSubjects(prev => ({ ...prev, [sub.id]: !isCollapsed }))}
                        >
                          <div className="flex items-center gap-2.5">
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            )}
                            <div>
                              <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">{sub.name}</CardTitle>
                              <CardDescription className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                교재 {sub.books.length}개 · 인강 {sub.lectures.length}개 설정됨
                              </CardDescription>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSubject(sub.id, sub.name);
                            }}
                            className="text-red-500 hover:text-red-700 w-8 h-8 rounded-lg hover:bg-red-50 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </CardHeader>
                        {!isCollapsed && (() => {
                          const currentFilter = categoryFilter[sub.id] || '전체';
                          const currentSort = sortOrder[sub.id] || 'latest';

                          // 1. 교재 필터 및 정렬
                          const filteredBooks = [...sub.books].filter(b => currentFilter === '전체' || (b.category || '기본') === currentFilter);
                          if (currentSort === 'latest') {
                            filteredBooks.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
                          } else if (currentSort === 'name') {
                            filteredBooks.sort((a, b) => a.title.localeCompare(b.title));
                          }

                          // 2. 인강 필터 및 정렬
                          const filteredLectures = [...sub.lectures].filter(l => currentFilter === '전체' || (l.category || '기본') === currentFilter);
                          if (currentSort === 'latest') {
                            filteredLectures.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
                          } else if (currentSort === 'name') {
                            filteredLectures.sort((a, b) => a.name.localeCompare(b.name));
                          }

                          return (
                            <CardContent className="p-4 space-y-4 bg-white dark:bg-[#1c1c1e]">
                              {/* 필터 및 정렬 바 배치 */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#F5F5F7] dark:bg-white/5 rounded-xl border border-black/[0.03] dark:border-white/10">
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-slate-500 dark:text-slate-400 font-bold">진도 유형 토글 필터</Label>
                                  <div className="flex flex-wrap gap-1">
                                                                  {['전체', ...customCategories].map((cat) => {
                                      const isFilterActive = currentFilter === cat;
                                      return (
                                        <Button
                                          key={cat}
                                          type="button"
                                          size="sm"
                                          variant={isFilterActive ? 'default' : 'outline'}
                                          onClick={() => setCategoryFilter(prev => ({ ...prev, [sub.id]: cat }))}
                                          className={`h-6 text-[9px] px-2.5 rounded-lg font-semibold ${isFilterActive ? 'bg-slate-900 text-white hover:bg-slate-900/90' : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-black/[0.06] dark:border-white/10'}`}
                                        >
                                          {cat}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="space-y-1 shrink-0">
                                  <Label className="text-[9px] text-slate-500 dark:text-slate-400 font-bold">자료 정렬</Label>
                                  <Select
                                    value={currentSort}
                                    onValueChange={(val) => setSortOrder(prev => ({ ...prev, [sub.id]: val }))}
                                  >
                                    <SelectTrigger className="h-7 text-[9px] w-28 bg-white dark:bg-white/5 dark:text-slate-100 border-black/[0.08] dark:border-white/10 rounded-lg">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white dark:bg-[#1c1c1e] text-[9px]">
                                      <SelectItem value="latest" className="text-[9px]">최신 수정순</SelectItem>
                                      <SelectItem value="name" className="text-[9px]">이름순</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="space-y-1.5 p-3 rounded-xl bg-white dark:bg-white/5 border border-black/[0.04] dark:border-white/10">
                          <Label className="text-[10px] font-bold text-slate-900 dark:text-slate-100">학생용 시간표 학습 시간</Label>
                          <Select
                            value={sub.studyTime || 'none'}
                            onValueChange={(value) => handleUpdateSubjectStudyTime(sub.id, value === 'none' ? '' : value as 'morning' | 'afternoon' | 'night')}
                          >
                            <SelectTrigger className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs h-9 bg-white dark:bg-white/5 dark:text-slate-100">
                              <SelectValue placeholder="학습 시간 선택" />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-[#1c1c1e]">
                              <SelectItem value="none" className="text-xs">미지정</SelectItem>
                              {STUDY_TIME_SLOTS.map((slot) => (
                                <SelectItem key={slot.key} value={slot.key} className="text-xs">
                                  {slot.displayLabel} ({slot.timeRange})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {sub.studyTime && (
                            <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                              {STUDY_TIME_SLOTS.find((slot) => slot.key === sub.studyTime)?.periodLabel}
                            </p>
                          )}
                          {/* 학습 요일은 과목이 아니라 각 교재/강의(자료) 단위에서 설정한다. */}
                        </div>

                        {/* 학습 목표 설정 */}
                        <div className="space-y-1.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/[0.03] dark:border-white/10">
                          <Label className="text-[10px] font-bold text-slate-900 dark:text-slate-100 flex items-center">
                            <CheckCircle className="w-3.5 h-3.5 mr-1 text-[#0071E3]" />
                            {sub.name} 학습 목표
                          </Label>
                          <Textarea
                            placeholder={`이 과목의 세부 목표를 입력하세요 (예: 6월 모평 2등급 달성, 시발점 완독)`}
                            value={editingGoals[sub.id] || ''}
                            onChange={(e) => {
                              const newGoal = e.target.value;
                              setEditingGoals(prev => ({ ...prev, [sub.id]: newGoal }));
                              setSubjectsState(prev => prev.map(s => s.id === sub.id ? { ...s, learningGoal: newGoal } : s));
                            }}
                            className="w-full rounded-lg border-black/[0.08] dark:border-white/10 text-xs min-h-[48px] bg-white dark:bg-white/5 dark:text-slate-100 p-2"
                          />
                        </div>

                        {/* 1. 학습 교재 관리 */}
                        <div className="space-y-3.5">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center border-b border-black/[0.04] dark:border-white/10 pb-1.5">
                            <BookOpen className="w-3.5 h-3.5 mr-1.5 text-[#0071E3]" />
                            교재 진도 및 목표일 설정
                          </h4>

                          {filteredBooks.length === 0 ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2 bg-black/[0.01] dark:bg-white/5 rounded-lg">등록된 교재가 없습니다.</p>
                          ) : (
                            <div className="space-y-3">
                              {filteredBooks.map((book) => {
                                const isEditing = editingMaterialId === book.id;
                                const hasDetailedPlans = book.detailedPlans && book.detailedPlans.length > 0;
                                const currentPageValue = progressDrafts[book.id] ?? book.currentPage;
                                const percent = book.totalPages > 0 ? Math.round((currentPageValue / book.totalPages) * 100) : 0;
                                const commitBookCurrent = () => commitProgressValue(sub.id, 'book', book.id, currentPageValue, book.totalPages);
                                const bookReviewPass2 = book.reviewPasses?.find((pass) => pass.passNumber === 2);
                                const bookReviewPass3 = book.reviewPasses?.find((pass) => pass.passNumber === 3);
                                const bookBenchmarkSummary = formatMaterialBenchmarkSummary(
                                  getMaterialBenchmark(materialBenchmarks, 'book', book.title)
                                );
                                return (
                                  <div key={book.id} id={`material-card-${book.id}`} className="p-3.5 rounded-xl border border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] flex flex-col gap-2.5 shadow-sm transition-all duration-300">
                                    {isEditing ? (
                                      <div className="space-y-2.5">
                                        <div className="flex gap-2">
                                          <div className="flex-1 space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">교재명</Label>
                                            <Input
                                              value={editingMaterialTitle}
                                              onChange={(e) => setEditingMaterialTitle(e.target.value)}
                                              className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 edit-title-input-book"
                                            />
                                          </div>
                                          <div className="w-24 space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">총 분량({book.unit || '페이지'})</Label>
                                            <Input
                                              type="number"
                                              value={editingMaterialTotal}
                                              onChange={(e) => setEditingMaterialTotal(Number(e.target.value))}
                                              className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 edit-total-input-book"
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[9px] text-slate-500 dark:text-slate-400">단위당 소요 시간 (분)</Label>
                                          <div className="flex items-center gap-2">
                                            <Input
                                              type="number"
                                              placeholder="글로벌 기본값 사용"
                                              value={editingMaterialEstimatedMinutes}
                                              onChange={(e) => setEditingMaterialEstimatedMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                                              className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10"
                                            />
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400">분</span>
                                          </div>
                                        </div>
                                        <div className="flex gap-1.5 justify-end">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditingMaterialId(null)}
                                            className="h-7 text-[10px] rounded-md cancel-edit-btn-book"
                                          >
                                            취소
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={async () => {
                                              if (!editingMaterialTitle.trim()) return toast.error('교재명을 입력해 주세요.');
                                              if (editingMaterialTotal <= 0) return toast.error('올바른 총 분량을 입력해 주세요.');
                                              await updateProgress(sub.id, 'book', book.id, 'edit', {
                                                title: editingMaterialTitle,
                                                total: editingMaterialTotal,
                                                estimatedMinutesPerUnit: editingMaterialEstimatedMinutes !== '' ? Number(editingMaterialEstimatedMinutes) : null
                                              });
                                              setEditingMaterialId(null);
                                            }}
                                            className="h-7 text-[10px] bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-md font-bold save-edit-btn-book"
                                          >
                                            저장
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">{book.title}</h5>
                                          {bookBenchmarkSummary && (
                                            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-[#0071E3]">
                                              {bookBenchmarkSummary}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">목표 완독일:</Label>
                                            <input
                                              type="date"
                                              value={materialTargetDates[book.id] || ''}
                                              onChange={(e) => {
                                                const newDate = e.target.value;
                                                setMaterialTargetDates(prev => ({ ...prev, [book.id]: newDate }));
                                                updateProgress(sub.id, 'book', book.id, 'targetDate', { targetDate: newDate });
                                              }}
                                              className="text-[10px] border border-black/[0.08] dark:border-white/10 rounded px-1.5 py-0.5 bg-[#F5F5F7] dark:bg-white/5 dark:text-slate-100"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setMaterialTargetDates(prev => ({ ...prev, [book.id]: '' }));
                                                updateProgress(sub.id, 'book', book.id, 'targetDate', { targetDate: '' });
                                              }}
                                              className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                                            >
                                              설정 안함
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              setEditingMaterialId(book.id);
                                              setEditingMaterialTitle(book.title);
                                              setEditingMaterialTotal(book.totalPages);
                                              setEditingMaterialEstimatedMinutes(book.estimatedMinutesPerUnit !== undefined ? book.estimatedMinutesPerUnit : '');
                                            }}
                                            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 w-7 h-7 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/10 edit-btn-book"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => updateProgress(sub.id, 'book', book.id, 'delete')}
                                            className="text-red-500 hover:text-red-700 w-7 h-7 rounded-lg hover:bg-red-50"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {/* 진도율 */}
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-semibold text-slate-500 dark:text-slate-400">
                                          진도율: <span className="text-slate-900 dark:text-slate-100 font-bold">{currentPageValue}</span> / {book.totalPages} {book.unit || '페이지'}
                                        </span>
                                        <span className="font-bold text-[#0071E3]">{percent}%</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="flex-1 space-y-2">
                                          <Slider
                                            value={[currentPageValue]}
                                            min={0}
                                            max={Math.max(1, book.totalPages)}
                                            step={1}
                                            onValueChange={(value) => setProgressDraft(book.id, value[0], book.totalPages)}
                                            onValueCommit={(value) => commitProgressValue(sub.id, 'book', book.id, value[0], book.totalPages)}
                                            className="progress-slider-book"
                                          />
                                          <div className="admin-fit-row flex items-center gap-2">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">현재 {book.unit || '페이지'}</Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              max={book.totalPages}
                                              value={currentPageValue}
                                              onChange={(e) => setProgressDraft(book.id, Number(e.target.value), book.totalPages)}
                                              onBlur={commitBookCurrent}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.currentTarget.blur();
                                                }
                                              }}
                                              className="h-7 w-24 text-[10px] rounded-lg border-black/[0.08] dark:border-white/10 bg-white dark:bg-white/5 dark:text-slate-100 progress-current-input-book"
                                            />
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {([2, 3] as const).map((passNumber) => {
                                            const passSetting = passNumber === 2 ? bookReviewPass2 : bookReviewPass3;
                                            const isChecked = Boolean(passSetting);
                                            return (
                                              <div key={passNumber} className="flex items-center gap-2 rounded-lg border border-black/[0.05] dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5">
                                                <Checkbox
                                                  checked={isChecked}
                                                  onCheckedChange={(checked) => updateReviewPassSetting(
                                                    sub.id,
                                                    book.id,
                                                    'book',
                                                    passNumber,
                                                    checked === true,
                                                    passSetting?.days || 7
                                                  )}
                                                  className="w-3.5 h-3.5"
                                                />
                                                <Label className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">{passNumber}회독</Label>
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  disabled={!isChecked}
                                                  value={passSetting?.days || ''}
                                                  onChange={(e) => updateReviewPassSetting(
                                                    sub.id,
                                                    book.id,
                                                    'book',
                                                    passNumber,
                                                    true,
                                                    Number(e.target.value)
                                                  )}
                                                  placeholder="소요일"
                                                  className="h-7 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-md border-black/[0.08] dark:border-white/10"
                                                />
                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">일</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 목표 설정 영역 */}
                                    <div className="p-3 bg-black/[0.02] dark:bg-white/5 rounded-xl border border-black/[0.03] dark:border-white/10 space-y-2.5">
                                      <Label className="text-[10px] font-bold text-slate-900 dark:text-slate-100 flex items-center">
                                        학습 목표 설정
                                      </Label>

                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <Label className="text-[9px] text-slate-500 dark:text-slate-400">학습목표 세부사항</Label>
                                          <Input
                                            placeholder="예: 수능 1등급 달성, 완독하기"
                                            value={book.goalDescription || ''}
                                            onChange={(e) => updateBookGoalField(sub.id, book.id, 'goalDescription', e.target.value)}
                                            className="h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-description-input-book"
                                          />
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_96px_92px] gap-2 items-end">
                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">설정 방식</Label>
                                            <Select
                                              // 3택(기간/일일/자율). 레거시(weeks/weeklyAmount) 저장값은 placeholder로 재선택 유도.
                                              value={book.goalType === 'deadlineWeeks' || book.goalType === 'dailyAmount' || book.goalType === 'selfPaced' ? book.goalType : ''}
                                              onValueChange={(val: 'dailyAmount' | 'deadlineWeeks' | 'selfPaced') => updateBookGoalField(sub.id, book.id, 'goalType', val)}
                                            >
                                              <SelectTrigger className="admin-fit-text h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-type-select-book">
                                                <SelectValue placeholder="목표 방식 선택" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="deadlineWeeks">기간 목표 (N주 안에 완주)</SelectItem>
                                                <SelectItem value="dailyAmount">일일 목표 (하루 Np, 공부 요일만)</SelectItem>
                                                <SelectItem value="selfPaced">자율 목표 (분량 자유 · 누적 입력)</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          {book.goalType !== 'selfPaced' && (
                                          <>
                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">
                                              {book.goalType === 'deadlineWeeks' ? '기간(주, 1~12)' : book.goalType === 'dailyAmount' ? '하루 페이지' : '목표 값'}
                                            </Label>
                                            <Input
                                              type="number"
                                              value={book.goalValue || ''}
                                              onChange={(e) => updateBookGoalField(sub.id, book.id, 'goalValue', Number(e.target.value))}
                                              placeholder="값"
                                              className="h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-value-input-book"
                                            />
                                          </div>

                                          <div className="flex items-end col-span-2 sm:col-span-1">
                                            <Button
                                              type="button"
                                              aria-label={loading ? '생성 중' : '계획 생성'}
                                              onClick={() => generateAndSavePlans(sub.id, book.id, 'book')}
                                              disabled={loading}
                                              className="admin-fit-button w-full h-8 text-[10px] bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-lg font-bold generate-plan-btn-book flex items-center justify-center gap-1.5"
                                            >
                                              {loading ? (
                                                <>
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                  <span>생성 중...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span className="hidden sm:inline">계획 생성</span>
                                                  <span className="sm:hidden">생성</span>
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                          </>
                                          )}
                                        </div>

                                        {book.goalType !== 'selfPaced' && (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">시작일</Label>
                                            <Input
                                              type="date"
                                              value={planStartOf(book.id)}
                                              onChange={(e) => e.target.value && updateMaterialPlanStart(sub.id, book.id, 'book', e.target.value)}
                                              className="h-8 w-[140px] text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10"
                                            />
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500">기본 내일 · 계획 첫 주가 이 날부터</span>
                                          </div>
                                        )}

                                        {book.goalType === 'selfPaced' && (
                                          <div className="rounded-lg bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/10 border border-[#0071E3]/15 px-2.5 py-2 text-[10px] font-semibold text-[#0071E3] leading-relaxed">
                                            자율 목표 자료예요. 정해진 분량 없이 학생이 그날 한 만큼 누적으로 입력합니다. 현재 누적 <b>{book.currentPage}{book.unit || 'p'}</b>.
                                          </div>
                                        )}

                                        <MaterialStudyDayPicker
                                          subId={sub.id}
                                          materialId={book.id}
                                          type="book"
                                          subjectStudyDays={sub.studyDays}
                                          materialStudyDays={book.studyDays}
                                          onToggle={handleToggleMaterialStudyDay}
                                        />
                                      </div>
                                    </div>

                                    {/* 주간 학습 계획 테이블 */}
                                    {book.targetDate && (
                                      <div className="pt-2 border-t border-black/[0.03] dark:border-white/10 space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">주간 학습 계획표 (학습 요일 기준)</Label>

                                        {!hasDetailedPlans ? (
                                          <p className="text-[9px] text-slate-500 dark:text-slate-400 py-1">위 목표 설정 완료 후 계획 생성 버튼을 눌러 주세요.</p>
                                        ) : (
                                          <div className="overflow-x-auto rounded-lg border border-black/[0.04] dark:border-white/10">
                                            <table className="min-w-full text-[10px] bg-white dark:bg-[#1c1c1e]">
                                              <thead>
                                                <tr className="bg-[#F5F5F7] dark:bg-white/5 border-b border-black/[0.04] dark:border-white/10 text-slate-500 dark:text-slate-400 font-semibold">
                                                  <th className="py-1 px-2 text-center w-10">주차</th>
                                                  <th className="py-1 px-2 text-left">기간</th>
                                                  <th className="py-1 px-2 text-left">목표 범위</th>
                                                  <th className="py-1 px-2 text-center w-16">일일 목표</th>
                                                  <th className="py-1 px-2 text-center w-14">실제</th>
                                                  <th className="py-1 px-2 text-center w-12">완료</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {(book.detailedPlans || []).map(plan => (
                                                  <tr key={plan.weekNumber} className="border-b border-black/[0.02] dark:border-white/10 last:border-0">
                                                    <td className="py-1.5 px-2 text-center font-bold">{plan.weekNumber}주</td>
                                                    <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</td>
                                                    <td className="py-1.5 px-2">
                                                      <input
                                                        type="text"
                                                        value={weeklyPlanRanges[`${book.id}_${plan.weekNumber}`] ?? plan.rangeText ?? ''}
                                                        onChange={(e) => {
                                                          const val = e.target.value;
                                                          setWeeklyPlanRanges(prev => ({ ...prev, [`${book.id}_${plan.weekNumber}`]: val }));
                                                        }}
                                                        onBlur={(e) => {
                                                          updateProgress(sub.id, 'book', book.id, 'updatePlan', {
                                                            weekNumber: plan.weekNumber,
                                                            rangeText: e.target.value
                                                          });
                                                        }}
                                                        className="w-full border-b border-dashed border-black/[0.1] dark:border-white/20 hover:border-black/30 dark:hover:border-white/40 focus:border-[#0071E3] focus:outline-none bg-transparent dark:text-slate-100 py-0.5 plan-range-input-book"
                                                      />
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center font-semibold text-slate-700 dark:text-slate-300">
                                                      {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}{book.unit || 'p'}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center">
                                                      {plan.isCompleted && plan.actualAmount !== undefined ? (
                                                        <span className="font-bold text-emerald-700">{plan.actualAmount}{book.unit || 'p'}</span>
                                                      ) : (
                                                        <span className="text-[#C7C7CC]">—</span>
                                                      )}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center">
                                                      <input
                                                        type="checkbox"
                                                        checked={plan.isCompleted}
                                                        onChange={(e) => {
                                                          updateProgress(sub.id, 'book', book.id, 'updatePlan', {
                                                            weekNumber: plan.weekNumber,
                                                            isCompleted: e.target.checked
                                                          });
                                                        }}
                                                        className="w-3.5 h-3.5 accent-[#0071E3] cursor-pointer plan-complete-check-book"
                                                      />
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <MaterialAdjustLogList adjustLog={book.adjustLog} unit={book.unit || 'p'} />

                                    <BenchmarkSection
                                      type="book"
                                      subject={sub.name}
                                      name={book.title}
                                      studentId={studentId}
                                      audience="admin"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 2. 인터넷 강의 관리 */}
                        <div className="space-y-3.5 pt-3 border-t border-black/[0.04] dark:border-white/10">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center border-b border-black/[0.04] dark:border-white/10 pb-1.5">
                            <Tv className="w-3.5 h-3.5 mr-1.5 text-[#0071E3]" />
                            인강 진도 및 목표일 설정
                          </h4>

                          {filteredLectures.length === 0 ? (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2 bg-black/[0.01] dark:bg-white/5 rounded-lg">등록된 인터넷 강의가 없습니다.</p>
                          ) : (
                            <div className="space-y-3">
                              {filteredLectures.map((lec) => {
                                const isEditing = editingMaterialId === lec.id;
                                const hasDetailedPlans = lec.detailedPlans && lec.detailedPlans.length > 0;
                                const completedLectureValue = progressDrafts[lec.id] ?? lec.completedLectures;
                                const percent = lec.totalLectures > 0 ? Math.round((completedLectureValue / lec.totalLectures) * 100) : 0;
                                const commitLectureCurrent = () => commitProgressValue(sub.id, 'lecture', lec.id, completedLectureValue, lec.totalLectures);
                                const lectureReviewPass2 = lec.reviewPasses?.find((pass) => pass.passNumber === 2);
                                const lectureReviewPass3 = lec.reviewPasses?.find((pass) => pass.passNumber === 3);
                                const lectureBenchmarkSummary = formatMaterialBenchmarkSummary(
                                  getMaterialBenchmark(materialBenchmarks, 'lecture', lec.name)
                                );
                                return (
                                  <div key={lec.id} id={`material-card-${lec.id}`} className="p-3.5 rounded-xl border border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] flex flex-col gap-2.5 shadow-sm transition-all duration-300">
                                    {isEditing ? (
                                      <div className="space-y-2.5">
                                        <div className="flex gap-2">
                                          <div className="flex-1 space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">강좌명</Label>
                                            <Input
                                              value={editingMaterialTitle}
                                              onChange={(e) => setEditingMaterialTitle(e.target.value)}
                                              className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 edit-title-input-lecture"
                                            />
                                          </div>
                                          <div className="w-24 space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">총 강의 수</Label>
                                            <Input
                                              type="number"
                                              value={editingMaterialTotal}
                                              onChange={(e) => setEditingMaterialTotal(Number(e.target.value))}
                                              className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 edit-total-input-lecture"
                                            />
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">강의당 소요 시간 (분)</Label>
                                            <div className="flex items-center gap-2">
                                              <Input
                                                type="number"
                                                placeholder="글로벌 기본값 (60분) 사용"
                                                value={editingMaterialEstimatedMinutes}
                                                onChange={(e) => setEditingMaterialEstimatedMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                                                className="h-8 text-[11px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10"
                                              />
                                              <span className="text-[10px] text-slate-500 dark:text-slate-400">분</span>
                                            </div>
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">강의 배속 설정</Label>
                                            <select
                                              value={editingMaterialSpeedMultiplier}
                                              onChange={(e) => setEditingMaterialSpeedMultiplier(Number(e.target.value))}
                                              className="w-full rounded-lg border border-black/[0.08] dark:border-white/10 text-[11px] h-8 bg-white dark:bg-white/5 dark:text-slate-100 px-2 focus:outline-none"
                                            >
                                              <option value="1.0">1.0 배속 (기본)</option>
                                              <option value="1.2">1.2 배속</option>
                                              <option value="1.5">1.5 배속</option>
                                              <option value="1.8">1.8 배속</option>
                                              <option value="2.0">2.0 배속</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div className="flex gap-1.5 justify-end">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setEditingMaterialId(null)}
                                            className="h-7 text-[10px] rounded-md cancel-edit-btn-lecture"
                                          >
                                            취소
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={async () => {
                                              if (!editingMaterialTitle.trim()) return toast.error('강좌명을 입력해 주세요.');
                                              if (editingMaterialTotal <= 0) return toast.error('올바른 총 강의 수를 입력해 주세요.');
                                              await updateProgress(sub.id, 'lecture', lec.id, 'edit', {
                                                title: editingMaterialTitle,
                                                total: editingMaterialTotal,
                                                estimatedMinutesPerUnit: editingMaterialEstimatedMinutes !== '' ? Number(editingMaterialEstimatedMinutes) : null,
                                                speedMultiplier: editingMaterialSpeedMultiplier
                                              });
                                              setEditingMaterialId(null);
                                            }}
                                            className="h-7 text-[10px] bg-[#0071E3] hover:bg-[#973df8] text-white rounded-md font-bold save-edit-btn-lecture"
                                          >
                                            저장
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">{lec.name}</h5>
                                          {lectureBenchmarkSummary && (
                                            <p className="mt-1 text-[10px] font-semibold leading-relaxed text-[#0071E3]">
                                              {lectureBenchmarkSummary}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">목표 완강일:</Label>
                                            <input
                                              type="date"
                                              value={materialTargetDates[lec.id] || ''}
                                              onChange={(e) => {
                                                const newDate = e.target.value;
                                                setMaterialTargetDates(prev => ({ ...prev, [lec.id]: newDate }));
                                                updateProgress(sub.id, 'lecture', lec.id, 'targetDate', { targetDate: newDate });
                                              }}
                                              className="text-[10px] border border-black/[0.08] dark:border-white/10 rounded px-1.5 py-0.5 bg-[#F5F5F7] dark:bg-white/5 dark:text-slate-100"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setMaterialTargetDates(prev => ({ ...prev, [lec.id]: '' }));
                                                updateProgress(sub.id, 'lecture', lec.id, 'targetDate', { targetDate: '' });
                                              }}
                                              className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                                            >
                                              설정 안함
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              setEditingMaterialId(lec.id);
                                              setEditingMaterialTitle(lec.name);
                                              setEditingMaterialTotal(lec.totalLectures);
                                              setEditingMaterialEstimatedMinutes(lec.estimatedMinutesPerUnit !== undefined ? lec.estimatedMinutesPerUnit : '');
                                              setEditingMaterialSpeedMultiplier(lec.speedMultiplier || 1.0);
                                            }}
                                            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 w-7 h-7 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/10 edit-btn-lecture"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => updateProgress(sub.id, 'lecture', lec.id, 'delete')}
                                            className="text-red-500 hover:text-red-700 w-7 h-7 rounded-lg hover:bg-red-50"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                    {/* 진도율 */}
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="font-semibold text-slate-500 dark:text-slate-400">
                                          진도: {completedLectureValue} / {lec.totalLectures} 강의
                                        </span>
                                        <span className="font-bold text-[#0071E3]">{percent}%</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="flex-1 space-y-2">
                                          <Slider
                                            value={[completedLectureValue]}
                                            min={0}
                                            max={Math.max(1, lec.totalLectures)}
                                            step={1}
                                            onValueChange={(value) => setProgressDraft(lec.id, value[0], lec.totalLectures)}
                                            onValueCommit={(value) => commitProgressValue(sub.id, 'lecture', lec.id, value[0], lec.totalLectures)}
                                            className="progress-slider-lecture"
                                          />
                                          <div className="admin-fit-row flex items-center gap-2">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">현재 강의</Label>
                                            <Input
                                              type="number"
                                              min={0}
                                              max={lec.totalLectures}
                                              value={completedLectureValue}
                                              onChange={(e) => setProgressDraft(lec.id, Number(e.target.value), lec.totalLectures)}
                                              onBlur={commitLectureCurrent}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  e.currentTarget.blur();
                                                }
                                              }}
                                              className="h-7 w-24 text-[10px] rounded-lg border-black/[0.08] dark:border-white/10 bg-white dark:bg-white/5 dark:text-slate-100 progress-current-input-lecture"
                                            />
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {([2, 3] as const).map((passNumber) => {
                                            const passSetting = passNumber === 2 ? lectureReviewPass2 : lectureReviewPass3;
                                            const isChecked = Boolean(passSetting);
                                            return (
                                              <div key={passNumber} className="flex items-center gap-2 rounded-lg border border-black/[0.05] dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5">
                                                <Checkbox
                                                  checked={isChecked}
                                                  onCheckedChange={(checked) => updateReviewPassSetting(
                                                    sub.id,
                                                    lec.id,
                                                    'lecture',
                                                    passNumber,
                                                    checked === true,
                                                    passSetting?.days || 7
                                                  )}
                                                  className="w-3.5 h-3.5"
                                                />
                                                <Label className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">{passNumber}회독</Label>
                                                <Input
                                                  type="number"
                                                  min={1}
                                                  disabled={!isChecked}
                                                  value={passSetting?.days || ''}
                                                  onChange={(e) => updateReviewPassSetting(
                                                    sub.id,
                                                    lec.id,
                                                    'lecture',
                                                    passNumber,
                                                    true,
                                                    Number(e.target.value)
                                                  )}
                                                  placeholder="소요일"
                                                  className="h-7 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-md border-black/[0.08] dark:border-white/10"
                                                />
                                                <span className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">일</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                    {/* 목표 설정 영역 */}
                                    <div className="p-3 bg-black/[0.02] dark:bg-white/5 rounded-xl border border-black/[0.03] dark:border-white/10 space-y-2.5">
                                      <Label className="text-[10px] font-bold text-slate-900 dark:text-slate-100 flex items-center">
                                        학습 목표 설정
                                      </Label>

                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <Label className="text-[9px] text-slate-500 dark:text-slate-400">학습목표 세부사항</Label>
                                          <Input
                                            placeholder="예: 수능 1등급 달성, 완강하기"
                                            value={lec.goalDescription || ''}
                                            onChange={(e) => updateLectureGoalField(sub.id, lec.id, 'goalDescription', e.target.value)}
                                            className="h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-description-input-lecture"
                                          />
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_96px_96px_86px_92px] gap-2 items-end">
                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">설정 방식</Label>
                                            <Select
                                              // 3택(기간/일일/자율). 레거시(weeks/weeklyAmount) 저장값은 placeholder로 재선택 유도.
                                              value={lec.goalType === 'deadlineWeeks' || lec.goalType === 'dailyAmount' || lec.goalType === 'selfPaced' ? lec.goalType : ''}
                                              onValueChange={(val: 'dailyAmount' | 'deadlineWeeks' | 'selfPaced') => updateLectureGoalField(sub.id, lec.id, 'goalType', val)}
                                            >
                                              <SelectTrigger className="admin-fit-text h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-type-select-lecture">
                                                <SelectValue placeholder="목표 방식 선택" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="deadlineWeeks">기간 목표 (N주 안에 완주)</SelectItem>
                                                <SelectItem value="dailyAmount">일일 목표 (하루 N강, 공부 요일만)</SelectItem>
                                                <SelectItem value="selfPaced">자율 목표 (분량 자유 · 누적 입력)</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          {lec.goalType !== 'selfPaced' && (
                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">
                                              {lec.goalType === 'deadlineWeeks' ? '기간(주, 1~12)' : lec.goalType === 'dailyAmount' ? '하루 강의' : '목표 값'}
                                            </Label>
                                            <Input
                                              type="number"
                                              value={lec.goalValue || ''}
                                              onChange={(e) => updateLectureGoalField(sub.id, lec.id, 'goalValue', Number(e.target.value))}
                                              placeholder="값"
                                              className="h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 goal-value-input-lecture"
                                            />
                                          </div>
                                          )}

                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">평균 시간(분)</Label>
                                            <Input
                                              type="number"
                                              min={1}
                                              value={lec.estimatedMinutesPerUnit ?? ''}
                                              onChange={(e) => updateLectureGoalField(
                                                sub.id,
                                                lec.id,
                                                'estimatedMinutesPerUnit',
                                                e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1)
                                              )}
                                              placeholder="기본 60"
                                              className="h-8 text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10 estimated-minutes-input-lecture"
                                            />
                                          </div>

                                          <div className="space-y-1 min-w-0">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400">배속</Label>
                                            <select
                                              value={lec.speedMultiplier || 1.0}
                                              onChange={(e) => updateLectureGoalField(sub.id, lec.id, 'speedMultiplier', Number(e.target.value))}
                                              className="w-full rounded-lg border border-black/[0.08] dark:border-white/10 text-[10px] h-8 bg-white dark:bg-white/5 dark:text-slate-100 px-1.5 focus:outline-none"
                                            >
                                              <option value="1.0">1.0배속</option>
                                              <option value="1.2">1.2배속</option>
                                              <option value="1.5">1.5배속</option>
                                              <option value="1.8">1.8배속</option>
                                              <option value="2.0">2.0배속</option>
                                            </select>
                                          </div>

                                          {lec.goalType !== 'selfPaced' && (
                                          <div className="flex items-end col-span-2 sm:col-span-1">
                                            <Button
                                              type="button"
                                              aria-label={loading ? '생성 중' : '계획 생성'}
                                              onClick={() => generateAndSavePlans(sub.id, lec.id, 'lecture')}
                                              disabled={loading}
                                              className="admin-fit-button w-full h-8 text-[10px] bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-lg font-bold generate-plan-btn-lecture flex items-center justify-center gap-1.5"
                                            >
                                              {loading ? (
                                                <>
                                                  <Loader2 className="w-3 h-3 animate-spin" />
                                                  <span>생성 중...</span>
                                                </>
                                              ) : (
                                                <>
                                                  <span className="hidden sm:inline">계획 생성</span>
                                                  <span className="sm:hidden">생성</span>
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                          )}
                                        </div>

                                        {lec.goalType !== 'selfPaced' && (
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Label className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">시작일</Label>
                                            <Input
                                              type="date"
                                              value={planStartOf(lec.id)}
                                              onChange={(e) => e.target.value && updateMaterialPlanStart(sub.id, lec.id, 'lecture', e.target.value)}
                                              className="h-8 w-[140px] text-[10px] bg-white dark:bg-white/5 dark:text-slate-100 rounded-lg border-black/[0.08] dark:border-white/10"
                                            />
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500">기본 내일 · 계획 첫 주가 이 날부터</span>
                                          </div>
                                        )}

                                        {lec.goalType === 'selfPaced' && (
                                          <div className="rounded-lg bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/10 border border-[#0071E3]/15 px-2.5 py-2 text-[10px] font-semibold text-[#0071E3] leading-relaxed">
                                            자율 목표 자료예요. 정해진 분량 없이 학생이 그날 들은 만큼 누적으로 입력합니다. 현재 누적 <b>{lec.completedLectures}강</b>.
                                          </div>
                                        )}

                                        <MaterialStudyDayPicker
                                          subId={sub.id}
                                          materialId={lec.id}
                                          type="lecture"
                                          subjectStudyDays={sub.studyDays}
                                          materialStudyDays={lec.studyDays}
                                          onToggle={handleToggleMaterialStudyDay}
                                        />
                                      </div>

                                      <div className="mt-2">
                                        <LectureReviewRecommender
                                          estimatedMinutesPerUnit={lec.estimatedMinutesPerUnit}
                                          speedMultiplier={lec.speedMultiplier}
                                          studyTime={sub.studyTime}
                                        />
                                      </div>
                                    </div>

                                    {/* 주간 학습 계획 테이블 */}
                                    {lec.targetDate && (
                                      <div className="pt-2 border-t border-black/[0.03] dark:border-white/10 space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">주간 학습 계획표 (학습 요일 기준)</Label>

                                        {!hasDetailedPlans ? (
                                          <p className="text-[9px] text-slate-500 dark:text-slate-400 py-1">위 목표 설정 완료 후 계획 생성 버튼을 눌러 주세요.</p>
                                        ) : (
                                          <div className="overflow-x-auto rounded-lg border border-black/[0.04] dark:border-white/10">
                                            <table className="min-w-full text-[10px] bg-white dark:bg-[#1c1c1e]">
                                              <thead>
                                                <tr className="bg-[#F5F5F7] dark:bg-white/5 border-b border-black/[0.04] dark:border-white/10 text-slate-500 dark:text-slate-400 font-semibold">
                                                  <th className="py-1 px-2 text-center w-10">주차</th>
                                                  <th className="py-1 px-2 text-left">기간</th>
                                                  <th className="py-1 px-2 text-left">목표 범위</th>
                                                  <th className="py-1 px-2 text-center w-16">일일 목표</th>
                                                  <th className="py-1 px-2 text-center w-14">실제</th>
                                                  <th className="py-1 px-2 text-center w-12">완료</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {(lec.detailedPlans || []).map(plan => (
                                                  <tr key={plan.weekNumber} className="border-b border-black/[0.02] dark:border-white/10 last:border-0">
                                                    <td className="py-1.5 px-2 text-center font-bold">{plan.weekNumber}주</td>
                                                    <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{plan.startDate.substring(5)} ~ {plan.endDate.substring(5)}</td>
                                                    <td className="py-1.5 px-2">
                                                      <input
                                                        type="text"
                                                        value={weeklyPlanRanges[`${lec.id}_${plan.weekNumber}`] ?? plan.rangeText ?? ''}
                                                        onChange={(e) => {
                                                          const val = e.target.value;
                                                          setWeeklyPlanRanges(prev => ({ ...prev, [`${lec.id}_${plan.weekNumber}`]: val }));
                                                        }}
                                                        onBlur={(e) => {
                                                          updateProgress(sub.id, 'lecture', lec.id, 'updatePlan', {
                                                            weekNumber: plan.weekNumber,
                                                            rangeText: e.target.value
                                                          });
                                                        }}
                                                        className="w-full border-b border-dashed border-black/[0.1] dark:border-white/20 hover:border-black/30 dark:hover:border-white/40 focus:border-[#0071E3] focus:outline-none bg-transparent dark:text-slate-100 py-0.5 plan-range-input-lecture"
                                                      />
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center font-semibold text-slate-700 dark:text-slate-300">
                                                      {plan.dailyAmount || Math.ceil(plan.targetAmount / 6)}강
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center">
                                                      {plan.isCompleted && plan.actualAmount !== undefined ? (
                                                        <span className="font-bold text-emerald-700">{plan.actualAmount}강</span>
                                                      ) : (
                                                        <span className="text-[#C7C7CC]">—</span>
                                                      )}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-center">
                                                      <input
                                                        type="checkbox"
                                                        checked={plan.isCompleted}
                                                        onChange={(e) => {
                                                          updateProgress(sub.id, 'lecture', lec.id, 'updatePlan', {
                                                            weekNumber: plan.weekNumber,
                                                            isCompleted: e.target.checked
                                                          });
                                                        }}
                                                        className="w-3.5 h-3.5 accent-[#0071E3] cursor-pointer plan-complete-check-lecture"
                                                      />
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <MaterialAdjustLogList adjustLog={lec.adjustLog} unit="강" />

                                    <BenchmarkSection
                                      type="lecture"
                                      subject={sub.name}
                                      name={lec.name}
                                      studentId={studentId}
                                      audience="admin"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>



                            </CardContent>
                          );
                        })()}
                      </Card>
                    );
                  })}
                </div>
              )}

              {false && (
              <form onSubmit={handleAddConsultationSubmit} className="space-y-3.5 p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-[#F5F5F7] dark:bg-white/5">
                <div className="admin-fit-row flex items-center justify-between gap-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">학습 상담 기록 작성</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={loadNotionTemplate}
                      className="text-[10px] text-[#0071E3] font-bold p-0 h-auto hover:bg-transparent"
                    >
                      기본 템플릿
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={loadEtcStudyTemplate}
                      className="text-[10px] text-[#0071E3] font-bold p-0 h-auto hover:bg-transparent"
                    >
                      기타 학습상담
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">상담일자</Label>
                    <Input
                      type="date"
                      value={cslDate}
                      onChange={(e) => setCslDate(e.target.value)}
                      className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 dark:text-slate-100 h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">상담자</Label>
                    <Input
                      placeholder="예: 원주센터장"
                      value={cslManager}
                      onChange={(e) => setCslManager(e.target.value)}
                      className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 dark:text-slate-100 h-9"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">학습 상담 및 목표 계획 내용</Label>
                  <Textarea
                    placeholder="학습 상담 내용, 목표 조정, 다음 주 계획을 입력하세요."
                    value={cslContent}
                    onChange={(e) => handleConsultationContentChange(e.target.value)}
                    className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 dark:text-slate-100 min-h-[120px]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">다음 상담 예정일 (선택)</Label>
                  <Input
                    type="date"
                    value={cslNextDate}
                    onChange={(e) => setCslNextDate(e.target.value)}
                    className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-white/5 dark:text-slate-100 h-9"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || isAutoSaving}
                  className="w-full rounded-lg text-xs bg-slate-900 hover:bg-[#323236] text-white py-4.5 font-bold flex items-center justify-center"
                >
                  {loading || isAutoSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      기록 저장 중...
                    </>
                  ) : (
                    '학습 상담 기록 저장'
                  )}
                </Button>
              </form>
              )}

              <div className="space-y-4">
                <h3 className="text-sm font-bold border-b border-black/[0.05] dark:border-white/10 pb-2 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                  누적 학습 상담 기록 ({learningLogs.length}건)
                </h3>

                {learningLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
                    등록된 학습 상담 기록이 없습니다.
                  </div>
                ) : (
                  <div className="relative border-l border-black/[0.08] dark:border-white/10 pl-5 ml-2.5 space-y-5">
                    {learningLogs.map((log) => (
                      <div key={log.id} className="relative group">
                        <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 dark:border-slate-100 bg-white dark:bg-[#1c1c1e] group-hover:bg-[#0071E3] transition-colors" />
                        <div className="p-4 rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] space-y-2 shadow-sm">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-900 dark:text-slate-100">{log.date}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-[#F5F5F7] dark:bg-white/5 rounded-full text-slate-500 dark:text-slate-400 font-semibold">
                              상담자: {log.manager}
                            </span>
                          </div>
                          <pre className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                            {log.content}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
    </>
  );
}
