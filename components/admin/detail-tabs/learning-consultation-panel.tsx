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
      className={className || 'rounded-lg border-black/[0.08] text-xs bg-white min-h-[132px]'}
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
    loadEtcStudyTemplate,
    loadNotionTemplate,
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
    setLastSavedConsultationContent,
    setSelectedConsultationPlanItems,
    subjectsState,
    syncConsultationContent,
  } = useDetailSheet();

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3.5 p-4 rounded-xl border border-[#0071E3]/15 bg-[#F8FBFF] shadow-sm">
      <div className="admin-fit-row flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-[#1D1D1F]">학습 상담 기록 작성</h4>
          <p className="text-[10px] text-[#86868B] mt-0.5">현재 진도를 상담 코멘트로 정리하고 다음 조치를 남깁니다.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={loadCurrentStudySummaryTemplate}
            className="h-7 rounded-lg border-[#0071E3]/20 bg-white text-[10px] text-[#0071E3] font-bold px-2.5"
          >
            현재 학습상황 불러오기
          </Button>
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

      <div className="rounded-lg border border-black/[0.04] bg-white p-3 text-[10px] text-[#434345]">
        <div className="font-bold text-[#1D1D1F] mb-1">현재 학습상황 요약</div>
        <div className="space-y-1">
          {subjectsState.length === 0 ? (
            <p className="text-[#86868B]">등록된 과목이 없습니다.</p>
          ) : (
            subjectsState.slice(0, 3).map((subject: { id: string; name: string; books?: unknown[]; lectures?: unknown[] }) => {
              const materials = getMaterialSummary(subject);
              return (
                <p key={subject.id} className="truncate">
                  <span className="font-bold">{subject.name}</span>
                  <span className="text-[#86868B]"> · {materials.length > 0 ? materials.join(' / ') : '등록된 교재·강의 없음'}</span>
                </p>
              );
            })
          )}
          {subjectsState.length > 3 && (
            <p className="text-[#86868B]">외 {subjectsState.length - 3}개 과목</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">상담일자</Label>
          <Input
            type="date"
            value={cslDate}
            onChange={(e) => setCslDate(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs bg-white h-9"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-[#86868B]">상담자</Label>
          <Input
            placeholder="예: 원주센터장"
            value={cslManager}
            onChange={(e) => setCslManager(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs bg-white h-9"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-[#86868B]">학습 상담 및 목표 계획 내용</Label>
        <ConsultationContentEditor
          placeholder="학습 상담 내용, 목표 조정, 다음 주 계획을 입력하세요."
          value={cslContent}
          onChange={handleConsultationContentChange}
          onBlur={() => syncConsultationContent(cslContentRef.current)}
          className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[132px]"
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
        <Label className="text-[10px] font-semibold text-[#86868B]">다음 상담 예정일 (선택)</Label>
        <Input
          type="date"
          value={cslNextDate}
          onChange={(e) => setCslNextDate(e.target.value)}
          className="rounded-lg border-black/[0.08] text-xs bg-white h-9"
        />
      </div>

      <div className="rounded-xl border border-black/[0.05] bg-white p-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-[#1D1D1F]">변경사항 미리보기</div>
            <p className="text-[10px] text-[#86868B] mt-0.5">현재 진도 기준으로 학생별 학습계획을 재계산합니다.</p>
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
          <div className="text-[10px] text-[#86868B] py-2">재조정할 교재/강의 계획이 없습니다.</div>
        ) : (
          <>
            <div className="text-[10px] font-bold text-[#86868B]">
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
                  className={`rounded-lg border p-2.5 text-[10px] transition-colors cursor-pointer hover:border-[#0071E3]/30 ${selectedConsultationPlanItems[item.selectionKey] === false ? 'border-black/[0.04] bg-white opacity-60' : 'border-[#0071E3]/15 bg-[#F5F5F7]/70'}`}
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
                        <div className="font-bold text-[#1D1D1F] truncate">{item.subjectName} · {item.title}</div>
                        <div className="text-[#86868B] mt-0.5">
                          현재 {item.current}/{item.total}{item.unit} · {item.status}
                        </div>
                      </div>
                    </label>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-bold text-[#0071E3] border border-[#0071E3]/10">
                      {item.newGoalLabel}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[#434345]">
                    <div>
                      <span className="text-[#86868B]">기존</span> {item.oldGoalLabel} · {item.oldTargetDate}
                    </div>
                    <div>
                      <span className="text-[#86868B]">변경</span> {item.newGoalLabel} · {item.newTargetDate}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[#86868B]">첫 주 계획: {item.firstPlanText}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="mr-0.5 text-[9px] font-bold text-[#86868B]">계획 수정</span>
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
                          : 'border-black/[0.08] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]'
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
                          ? 'bg-[#1D1D1F] text-white hover:bg-[#323236]'
                          : 'border-black/[0.08] bg-white text-[#1D1D1F] hover:bg-[#F5F5F7]'
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
    </form>
  );
}
