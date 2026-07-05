'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useDetailSheet } from '@/components/admin/detail-tabs/detail-sheet-context';

const ConsultationContentEditor = React.memo(function ConsultationContentEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <Textarea
      placeholder={placeholder || '학습 상담 내용, 목표 조정, 다음 주 계획을 입력하세요.'}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onBlur={onBlur}
      className={className || 'rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] min-h-[132px]'}
      required={required}
    />
  );
});

export function LearningConsultationPanel() {
  const {
    consultationPlanPreview,
    cslContent,
    cslContentRef,
    cslDate,
    cslManager,
    cslNextDate,
    getMaterialSummary,
    handleConsultationContentChange,
    isConsultationDraftDirty,
    lastSavedConsultationContent,
    loadCurrentStudySummaryTemplate,
    learningLogs,
    scrollToSubjectCard,
    selectedConsultationPlanItems,
    selectedPlanCount,
    setCslContent,
    setCslDate,
    setCslManager,
    setCslNextDate,
    setConsultationPlanModes,
    setIsConsultationDraftDirty,
    setIsConsultationPlanDirty,
    setIsLearningInputOpen,
    setLastSavedConsultationContent,
    setSelectedConsultationPlanItems,
    subjectsState,
    syncConsultationContent,
    // 생활상담 (탭 분리)
    lifeComment,
    setLifeComment,
    studentLifeComment,
    setStudentLifeComment,
    handleSaveLifeComment,
    loading,
  } = useDetailSheet();

  // 상담 작성 모드: 학습상담 / 생활상담 (한 화면에서 탭으로 전환)
  const [consultMode, setConsultMode] = React.useState<'learning' | 'life'>('learning');

  // 기존 학습상담 내역 유무 — 없으면 학습/교재 입력으로 안내
  const hasLearningHistory = (learningLogs || []).length > 0;

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3.5 p-4 rounded-xl border border-[#0071E3]/15 bg-[#F8FBFF] dark:bg-white/5 shadow-sm">
      {/* 학습상담 / 생활상담 탭 */}
      <div className="flex items-center gap-1 bg-[#EEF2F7] dark:bg-white/5 p-0.5 rounded-xl">
        <button
          type="button"
          onClick={() => setConsultMode('learning')}
          className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-all ${consultMode === 'learning' ? 'bg-white dark:bg-[#2c2c2e] text-[#0071E3] shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'}`}
        >
          학습상담
        </button>
        <button
          type="button"
          onClick={() => setConsultMode('life')}
          className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-all ${consultMode === 'life' ? 'bg-white dark:bg-[#2c2c2e] text-[#0071E3] shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'}`}
        >
          생활상담
        </button>
      </div>

      {consultMode === 'life' ? (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">생활 상담 기록 작성</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">생활 면담 내용을 정리하면 면담 이력으로 누적됩니다.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-slate-500">생활 코멘트 (학부모 공유)</Label>
            <Textarea
              placeholder="생활 태도, 출결, 면담 내용 등 학부모와 공유할 코멘트를 입력하세요."
              value={lifeComment}
              onChange={(e) => setLifeComment(e.target.value)}
              className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] min-h-[96px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-slate-500">학생 공유 코멘트</Label>
            <Textarea
              placeholder="학생 본인에게 전달할 격려/조언을 입력하세요."
              value={studentLifeComment}
              onChange={(e) => setStudentLifeComment(e.target.value)}
              className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] min-h-[72px]"
            />
          </div>
          <Button
            type="button"
            onClick={handleSaveLifeComment}
            disabled={loading}
            className="w-full h-9 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold"
          >
            생활 상담 기록 저장
          </Button>
        </div>
      ) : (
      <>
      <div className="admin-fit-row flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">학습 상담 기록 작성</h4>
          <p className="text-[10px] text-slate-500 mt-0.5">현재 진도를 상담 코멘트로 정리하고 다음 조치를 남깁니다.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={loadCurrentStudySummaryTemplate}
            className="h-7 rounded-lg border-[#0071E3]/20 bg-white dark:bg-[#1c1c1e] text-[10px] text-[#0071E3] font-bold px-2.5"
          >
            현재 학습상황 불러오기
          </Button>
        </div>
      </div>

      {!hasLearningHistory && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#FF9500]/25 bg-[#FF9500]/[0.06] p-3 text-[10px]">
          <span className="font-bold text-[#A25F00]">상담내역이 없어 학습/교재 입력으로 진행합니다.</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIsLearningInputOpen?.(true);
              const first = subjectsState[0];
              if (first) scrollToSubjectCard(first.name);
            }}
            className="h-7 self-start rounded-lg border-[#FF9500]/30 bg-white dark:bg-[#1c1c1e] text-[10px] font-bold text-[#A25F00] px-2.5"
          >
            학습/교재 입력으로 이동 →
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 text-[10px] text-slate-700 dark:text-slate-300">
        <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">현재 학습상황 요약</div>
        <div className="space-y-1">
          {subjectsState.length === 0 ? (
            <p className="text-slate-500">등록된 과목이 없습니다.</p>
          ) : (
            subjectsState.slice(0, 3).map((subject: { id: string; name: string; books?: unknown[]; lectures?: unknown[] }) => {
              const materials = getMaterialSummary(subject);
              return (
                <p key={subject.id} className="truncate">
                  <span className="font-bold">{subject.name}</span>
                  <span className="text-slate-500"> · {materials.length > 0 ? materials.join(' / ') : '등록된 교재·강의 없음'}</span>
                </p>
              );
            })
          )}
          {subjectsState.length > 3 && (
            <p className="text-slate-500">외 {subjectsState.length - 3}개 과목</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-slate-500">상담일자</Label>
          <Input
            type="date"
            value={cslDate}
            onChange={(e) => setCslDate(e.target.value)}
            className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] h-9"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-slate-500">상담자</Label>
          <Input
            placeholder="예: 원주센터장"
            value={cslManager}
            onChange={(e) => setCslManager(e.target.value)}
            className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] h-9"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-slate-500">학습 상담 및 목표 계획 내용</Label>
        <ConsultationContentEditor
          placeholder="학습 상담 내용, 목표 조정, 다음 주 계획을 입력하세요."
          value={cslContent}
          onChange={handleConsultationContentChange}
          onBlur={() => syncConsultationContent(cslContentRef.current)}
          className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] min-h-[132px]"
          required
        />
        {lastSavedConsultationContent && !isConsultationDraftDirty && cslContent === lastSavedConsultationContent && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[#34C759]/10 border border-[#34C759]/20 px-3 py-2">
            <span className="text-[10px] font-bold text-[#248A3D]">방금 저장된 상담 내용입니다. 확인 후 새 상담을 작성할 수 있습니다.</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                cslContentRef.current = '';
                setCslContent('');
                setLastSavedConsultationContent('');
                setIsConsultationDraftDirty(false);
              }}
              className="h-6 px-2 text-[10px] font-bold text-[#248A3D] hover:bg-[#34C759]/10"
            >
              새 상담 작성
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-slate-500">다음 상담 예정일 (선택)</Label>
        <Input
          type="date"
          value={cslNextDate}
          onChange={(e) => setCslNextDate(e.target.value)}
          className="rounded-lg border-black/[0.08] dark:border-white/10 text-xs bg-white dark:bg-[#1c1c1e] h-9"
        />
      </div>

      <div className="rounded-xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">변경사항 미리보기</div>
            <p className="text-[10px] text-slate-500 mt-0.5">현재 진도 기준으로 학생별 학습계획을 재계산합니다.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const allSelected = selectedPlanCount === consultationPlanPreview.length;
                setSelectedConsultationPlanItems((prev: Record<string, boolean>) => {
                  const next = { ...prev };
                  consultationPlanPreview.forEach((item: { selectionKey: string }) => {
                    next[item.selectionKey] = !allSelected;
                  });
                  return next;
                });
                setIsConsultationPlanDirty(true);
              }}
              className="h-8 px-2 text-[10px] font-bold text-[#0071E3] hover:bg-[#0071E3]/5"
            >
              {selectedPlanCount === consultationPlanPreview.length ? '전체 해제' : '전체 선택'}
            </Button>
          </div>
        </div>

        {consultationPlanPreview.length === 0 ? (
          <div className="text-[10px] text-slate-500 py-2">재조정할 교재/강의 계획이 없습니다.</div>
        ) : (
          <>
            <div className="text-[10px] font-bold text-slate-500">
              선택된 계획 {selectedPlanCount}/{consultationPlanPreview.length}개 반영
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {consultationPlanPreview.map((item: {
                selectionKey: string;
                subjectName: string;
                title: string;
                current: number;
                total: number;
                unit: string;
                status: string;
                newGoalLabel: string;
                oldGoalLabel: string;
                oldTargetDate: string;
                newTargetDate: string;
                firstPlanText: string;
                warningMessage: string | null;
                planMode: string;
              }) => (
                <div
                  key={item.selectionKey}
                  onClick={() => scrollToSubjectCard(item.subjectName)}
                  className={`rounded-lg border p-2.5 text-[10px] transition-colors cursor-pointer hover:border-[#0071E3]/30 ${selectedConsultationPlanItems[item.selectionKey] === false ? 'border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] opacity-60' : 'border-[#0071E3]/15 bg-[#F5F5F7]/70 dark:bg-white/5'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex items-start gap-2 min-w-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedConsultationPlanItems[item.selectionKey] !== false}
                        onCheckedChange={(checked) => {
                          setSelectedConsultationPlanItems((prev: Record<string, boolean>) => ({
                            ...prev,
                            [item.selectionKey]: checked === true,
                          }));
                          setIsConsultationPlanDirty(true);
                        }}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{item.subjectName} · {item.title}</div>
                        <div className="text-slate-500 mt-0.5">
                          현재 {item.current}/{item.total}{item.unit} · {item.status}
                        </div>
                      </div>
                    </label>
                    <span className="shrink-0 rounded-full bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-bold text-[#0071E3] border border-[#0071E3]/10">
                      {item.newGoalLabel}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-slate-500">기존</span> {item.oldGoalLabel} · {item.oldTargetDate}
                    </div>
                    <div>
                      <span className="text-slate-500">변경</span> {item.newGoalLabel} · {item.newTargetDate}
                    </div>
                  </div>
                  <div className="mt-1.5 text-slate-500">첫 주 계획: {item.firstPlanText}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="mr-0.5 text-[9px] font-bold text-slate-500">계획 수정</span>
                    <Button
                      type="button"
                      variant={item.planMode === 'keepTargetDate' ? 'default' : 'outline'}
                      onClick={() => {
                        setConsultationPlanModes((prev: Record<string, string>) => ({
                          ...prev,
                          [item.selectionKey]: 'keepTargetDate',
                        }));
                        setIsConsultationPlanDirty(true);
                      }}
                      className={`h-6 rounded-md px-2 text-[9px] font-bold ${
                        item.planMode === 'keepTargetDate'
                          ? 'bg-[#0071E3] text-white hover:bg-[#0077ED]'
                          : 'border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 hover:bg-[#F5F5F7] dark:hover:bg-white/5'
                      }`}
                    >
                      마감일 기준
                    </Button>
                    <Button
                      type="button"
                      variant={item.planMode === 'keepPace' ? 'default' : 'outline'}
                      onClick={() => {
                        setConsultationPlanModes((prev: Record<string, string>) => ({
                          ...prev,
                          [item.selectionKey]: 'keepPace',
                        }));
                        setIsConsultationPlanDirty(true);
                      }}
                      className={`h-6 rounded-md px-2 text-[9px] font-bold ${
                        item.planMode === 'keepPace'
                          ? 'bg-slate-900 text-white hover:bg-[#323236]'
                          : 'border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 hover:bg-[#F5F5F7] dark:hover:bg-white/5'
                      }`}
                    >
                      하루 목표 기준
                    </Button>
                  </div>
                  {item.warningMessage && (
                    <div className="mt-2 rounded-lg bg-[#FF9500]/10 border border-[#FF9500]/20 px-2.5 py-1.5 text-[9px] text-[#A25F00] font-bold">
                      {item.warningMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      </>
      )}
    </form>
  );
}
