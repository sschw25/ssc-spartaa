'use client';

// 인박스 승인폼 카드 5종 — proposedGoal(계획)·proposedMaterial(자료추가)·proposedMaterialEdit(수정)·
// proposedMaterialDelete(삭제)·proposedProgressCorrection(진도정정).
// 리스트 뷰(상세 패널)와 채팅 뷰(액션 카드)가 같은 폼을 공유한다. 오버라이드 state
// (승인 시작일/마감정책/재생성 체크)는 호출 페이지가 소유하고 props 로 주입 — 두 뷰 전환에도 값 유지.
import React from 'react';
import {
  Target, BookOpen, Tv, BookPlus, Trash2, AlertTriangle, SquarePen, CheckCircle2,
} from 'lucide-react';
import type {
  Student, ProposedGoal, ProposedMaterial, ProposedMaterialEdit, ProposedMaterialDelete, ProposedProgressCorrection,
} from '@/lib/types/student';

export const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

const DAY_LABEL_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const TIME_LABEL_KO: Record<string, string> = { morning: '오전', afternoon: '오후', night: '야간' };

const getGoalTypeLabel = (goalType: string) => {
  if (goalType === 'weeks') return '기간 지정';
  if (goalType === 'weeklyAmount') return '주당 분량';
  if (goalType === 'dailyAmount') return '일일 분량';
  if (goalType === 'deadlineWeeks') return '마감일까지';
  if (goalType === 'selfPaced') return '자율 진행';
  return goalType;
};

// ── 학생 1명 기준 자료 조회 헬퍼 (기존 인박스 페이지의 studentId 검색 헬퍼를 단일 학생으로 단순화) ──

const allBooksOf = (student?: Student) => [
  ...(student?.books || []),
  ...(student?.subjects || []).flatMap((s) => s.books || []),
];
const allLecturesOf = (student?: Student) => [
  ...(student?.lectures || []),
  ...(student?.subjects || []).flatMap((s) => s.lectures || []),
];

const getMaterialTitle = (student: Student | undefined, pg: ProposedGoal): string => {
  if (!student) return pg.materialId;
  if (pg.materialType === 'book') {
    return allBooksOf(student).find((b) => b.id === pg.materialId)?.title || pg.materialId;
  }
  return allLecturesOf(student).find((l) => l.id === pg.materialId)?.name || pg.materialId;
};

// 자료의 실제 단위 조회(교재 전용 — 인강은 '강' 고정). '문'·'회' 단위 자료가 'p'로 표시되지 않게 한다.
const getMaterialUnit = (student: Student | undefined, materialType: 'book' | 'lecture', materialId: string): string => {
  if (materialType === 'lecture') return '강';
  const book = allBooksOf(student).find((b) => b.id === materialId);
  return book?.unit || 'p';
};

// proposedMaterialEdit 수정 대상 자료의 서버 현재 상태(표시용) 조회.
// before 값은 학생이 보낸 스냅샷(pme.current)이 아니라 이 실제 값을 우선한다 — 신청 후 관리자가 자료를
// 고쳤거나 학생이 스냅샷을 위조한 경우 옛 값을 '현재'로 보여주면 승인 판단이 틀어지기 때문.
const getEditTargetState = (student: Student | undefined, pme: ProposedMaterialEdit) => {
  if (!student) return null;
  if (pme.materialType === 'book') {
    const b = allBooksOf(student).find((m) => m.id === pme.materialId);
    if (!b) return null;
    return {
      title: b.title, total: Number(b.totalPages) || 0, progress: Number(b.currentPage) || 0,
      unit: (b.unit || '').trim(), studyDays: b.studyDays as string[] | undefined,
      studyTime: b.studySlot || b.studyTime || '', hasPlans: (b.detailedPlans?.length || 0) > 0,
    };
  }
  const l = allLecturesOf(student).find((m) => m.id === pme.materialId);
  if (!l) return null;
  return {
    title: l.name, total: Number(l.totalLectures) || 0, progress: Number(l.completedLectures) || 0,
    unit: '', studyDays: l.studyDays as string[] | undefined,
    studyTime: l.studySlot || l.studyTime || '', hasPlans: (l.detailedPlans?.length || 0) > 0,
  };
};

// proposedMaterialDelete 삭제 대상의 현재 진도(표시용) 조회. 승인 시 사라질 진도를 미리 경고하는 용도.
const getMaterialDeleteProgress = (student: Student | undefined, pmd: ProposedMaterialDelete): { percent: number; label: string } | null => {
  if (!student || pmd.scope !== 'material' || !pmd.materialId) return null;
  if (pmd.materialType === 'book') {
    const book = allBooksOf(student).find((b) => b.id === pmd.materialId);
    if (!book) return null;
    const total = Number(book.totalPages) || 0;
    const current = Number(book.currentPage) || 0;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const unit = book.unit || 'p';
    return { percent, label: total > 0 ? `${current}/${total}${unit} (${percent}%)` : `${current}${unit} 진행` };
  }
  const lecture = allLecturesOf(student).find((l) => l.id === pmd.materialId);
  if (!lecture) return null;
  const total = Number(lecture.totalLectures) || 0;
  const current = Number(lecture.completedLectures) || 0;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return { percent, label: total > 0 ? `${current}/${total}강 (${percent}%)` : `${current}강 진행` };
};

// proposedMaterialDelete scope==='subject' 삭제 대상의 하위 자료 개수(표시용).
const getSubjectDeleteCount = (student: Student | undefined, pmd: ProposedMaterialDelete): number => {
  if (!student || pmd.scope !== 'subject' || !pmd.subjectId) return 0;
  const subject = (student.subjects || []).find((s) => s.id === pmd.subjectId);
  if (!subject) return 0;
  return (subject.books || []).length + (subject.lectures || []).length;
};

// ── 공용 승인 시작일 / 마감일 처리 폼 조각 ──

function PlanStartDateField(props: {
  value: string;
  onChange: (v: string) => void;
  helper: string;
}) {
  return (
    <>
      <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">승인 시작일</label>
      <input
        type="date"
        min={kstToday()}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
      />
      <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">{props.helper}</p>
    </>
  );
}

function DeadlinePolicyField(props: {
  targetDate: string;
  goalValue: number | string;
  policy: 'keep-deadline' | 'keep-duration';
  onChange: (v: 'keep-deadline' | 'keep-duration') => void;
}) {
  return (
    <>
      <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">마감일 처리</label>
      <div className="flex gap-1.5">
        {([['keep-deadline', `마감일 유지 (${props.targetDate})`], ['keep-duration', `기간 유지 (약 ${props.goalValue}주)`]] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => props.onChange(mode)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
              props.policy === mode
                ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3]'
                : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 break-keep">마감일 유지는 시작일이 늦어져도 계획이 학생이 고른 마감일을 넘지 않아요(주당 분량 증가).</p>
    </>
  );
}

// ── 승인폼 5종을 proposed* 존재 여부로 스위칭하는 단일 진입 컴포넌트 ──

export interface ApprovalFormsProps {
  raw: any;                          // InboxItem.rawItem (ConsultationLog + proposed* 페이로드)
  student?: Student;                 // 자료 제목/단위/현재상태 파생용
  planStartDateOverride?: string;
  onPlanStartDateChange: (v: string) => void;
  deadlinePolicy?: 'keep-deadline' | 'keep-duration';
  onDeadlinePolicyChange: (v: 'keep-deadline' | 'keep-duration') => void;
  regenerate?: boolean;
  onRegenerateChange: (v: boolean) => void;
}

export function ApprovalForms(props: ApprovalFormsProps) {
  const { raw, student } = props;
  if (!raw) return null;
  return (
    <>
      {raw.proposedGoal && <ProposedGoalCard {...props} pg={raw.proposedGoal} />}
      {raw.proposedMaterial && <ProposedMaterialCard {...props} pm={raw.proposedMaterial} />}
      {raw.proposedMaterialEdit && <ProposedMaterialEditCard {...props} pme={raw.proposedMaterialEdit} />}
      {raw.proposedMaterialDelete && <ProposedMaterialDeleteCard student={student} pmd={raw.proposedMaterialDelete} />}
      {raw.proposedProgressCorrection && <ProposedProgressCorrectionCard student={student} ppc={raw.proposedProgressCorrection} />}
    </>
  );
}

// proposedGoal 제안 계획 표시
function ProposedGoalCard(props: ApprovalFormsProps & { pg: ProposedGoal }) {
  const { pg, student } = props;
  const cg = pg.currentGoal;
  const materialTitle = getMaterialTitle(student, pg);
  const isBook = pg.materialType === 'book';
  const matUnit = getMaterialUnit(student, pg.materialType, pg.materialId);
  const unitFor = (gt?: string) =>
    gt === 'weeks' || gt === 'deadlineWeeks' ? '주'
    : gt === 'weeklyAmount' ? `${matUnit}/주`
    : gt === 'selfPaced' ? ''
    : `${matUnit}/일`;
  // 변경 후 값 문구: 마감일 모드는 날짜를, 자율은 '자율'을, 그 외는 값+단위를 보여준다.
  // 값이 비어(0) 있고 날짜도 없으면 목표 문구는 생략(요일만 변경 등).
  const hasGoal = pg.goalType === 'selfPaced' || !!pg.targetDate || Number(pg.goalValue) > 0;
  const afterText = pg.goalType === 'deadlineWeeks' && pg.targetDate
    ? `${pg.targetDate}까지 (약 ${pg.goalValue}주)`
    : pg.goalType === 'selfPaced'
    ? '자율 진행'
    : `${getGoalTypeLabel(pg.goalType)}: ${pg.goalValue}${unitFor(pg.goalType)}`;
  return (
    <div className="rounded-2xl border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
        <Target className="w-3.5 h-3.5" />
        학생 제안 변경 내역
      </div>

      {/* 교재/인강 제목 */}
      <div className="flex items-center gap-2 text-[11px]">
        {isBook
          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : <Tv className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />}
        <span className="font-black text-slate-700 dark:text-slate-300 truncate">{materialTitle}</span>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 shrink-0">{isBook ? '교재' : '인강'}</span>
      </div>

      {/* 변경 전/후 비교 */}
      {cg ? (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 space-y-1.5">
            <p className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">변경 전 (현재)</p>
            {cg.goalType && cg.goalValue ? (
              <span className="inline-block bg-slate-100 dark:bg-white/10 rounded-md px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
                {getGoalTypeLabel(cg.goalType)}: {cg.goalValue}{unitFor(cg.goalType)}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 font-semibold">미설정</span>
            )}
            {cg.speedMultiplier && cg.speedMultiplier !== 1.0 && (
              <span className="inline-block ml-1 bg-slate-100 dark:bg-white/10 rounded-md px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
                {cg.speedMultiplier}×
              </span>
            )}
          </div>
          <div className="rounded-xl border border-[#0071E3]/30 dark:border-[#0071E3]/40 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 p-2.5 space-y-1.5">
            <p className="font-black text-[#0071E3]/70 uppercase tracking-wider text-[9px]">변경 후 (신청)</p>
            {hasGoal ? (
              <span className="inline-block bg-[#0071E3]/10 rounded-md px-2 py-0.5 font-black text-[#0071E3]">
                {afterText}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 font-semibold">요일만 변경</span>
            )}
            {pg.speedMultiplier && pg.speedMultiplier !== 1.0 && (
              <span className="inline-block ml-1 bg-[#0071E3]/10 rounded-md px-2 py-0.5 font-black text-[#0071E3]">
                {pg.speedMultiplier}×
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hasGoal && (
            <span className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
              {afterText}
            </span>
          )}
          {pg.speedMultiplier && pg.speedMultiplier !== 1.0 && (
            <span className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
              배속 {pg.speedMultiplier}×
            </span>
          )}
        </div>
      )}

      {pg.currentProgress !== undefined && (
        <span className="inline-block bg-white dark:bg-[#1c1c1e] border border-[#0071E3]/20 dark:border-[#0071E3]/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-[#0071E3]">
          현재 진도 정정: {pg.currentProgress}{matUnit}
        </span>
      )}

      {pg.proposedWeekNumber && pg.proposedRangeText && (
        <span className="inline-block bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          {pg.proposedWeekNumber}주차: {pg.proposedRangeText}
        </span>
      )}

      {pg.studyDays && pg.studyDays.length > 0 && (
        <span className="inline-block bg-white dark:bg-[#1c1c1e] border border-[#0071E3]/20 dark:border-[#0071E3]/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-[#0071E3]">
          학습 요일: {pg.studyDays.map((d) => DAY_LABEL_KO[d] || d).join('·')}
        </span>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 space-y-1.5">
        <PlanStartDateField
          value={props.planStartDateOverride ?? pg.planStartDate ?? ''}
          onChange={props.onPlanStartDateChange}
          helper="그대로 두면 학생 선택값 또는 오늘 기준으로 승인됩니다."
        />
      </div>

      {pg.goalType === 'deadlineWeeks' && pg.targetDate && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 space-y-1.5">
          <DeadlinePolicyField
            targetDate={pg.targetDate}
            goalValue={pg.goalValue}
            policy={props.deadlinePolicy ?? 'keep-deadline'}
            onChange={props.onDeadlinePolicyChange}
          />
        </div>
      )}

      <p className="text-[9px] font-bold text-[#0071E3]/70 flex items-center gap-1">
        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> 승인 시 해당 교재/인강에 제안 계획이 자동 반영됩니다.
      </p>
    </div>
  );
}

// proposedMaterial 교재/인강 추가 제안 표시
function ProposedMaterialCard(props: ApprovalFormsProps & { pm: ProposedMaterial }) {
  const { pm } = props;
  const isBook = pm.materialType === 'book';
  const unitLabel = isBook ? (pm.unit || 'p') : '강';
  return (
    <div className="rounded-2xl border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
        <BookPlus className="w-3.5 h-3.5" />
        교재/인강 추가 요청
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {isBook
          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : <Tv className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />}
        <span className="font-black text-slate-700 dark:text-slate-300 truncate">{pm.title}</span>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 shrink-0">{isBook ? '교재' : '인강'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <span className="inline-flex items-center gap-1 bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
          과목: {pm.subjectName}
          {pm.isNewSubject && <span className="rounded-full bg-[#0071E3]/10 px-1.5 py-0.5 text-[9px] font-black text-[#0071E3]">신규</span>}
        </span>
        {(pm.studyDays?.length || pm.studyTime) && (
          <span className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
            {pm.studyDays?.length ? pm.studyDays.map((d) => DAY_LABEL_KO[d]).join('·') : ''}
            {pm.studyTime ? ` ${TIME_LABEL_KO[pm.studyTime]}` : ''}
          </span>
        )}
        {pm.currentProgress !== undefined && (
          <span className="bg-white dark:bg-[#1c1c1e] border border-[#0071E3]/20 dark:border-[#0071E3]/30 rounded-lg px-2 py-0.5 font-bold text-[#0071E3]">
            현재 {pm.currentProgress}{unitLabel}
          </span>
        )}
        <span className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/10 rounded-lg px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
          총량: {pm.total ? `${pm.total}${unitLabel} (예상)` : '자율(총량 미정)'}
        </span>
        {(pm.goalType === 'deadlineWeeks' || pm.goalType === 'dailyAmount') && (
          <span className="bg-[#0071E3]/10 border border-[#0071E3]/20 rounded-lg px-2 py-0.5 font-black text-[#0071E3]">
            계획: {pm.goalType === 'deadlineWeeks'
              ? `${pm.targetDate || ''}까지 (약 ${pm.goalValue}주)`
              : `하루 ${pm.goalValue}${unitLabel}`}
          </span>
        )}
      </div>
      {(pm.goalType === 'deadlineWeeks' || pm.goalType === 'dailyAmount') && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 space-y-1.5">
          <PlanStartDateField
            value={props.planStartDateOverride ?? pm.planStartDate ?? ''}
            onChange={props.onPlanStartDateChange}
            helper="그대로 두면 학생 선택값 또는 오늘 기준으로 자료 계획이 생성됩니다."
          />
          {pm.goalType === 'deadlineWeeks' && pm.targetDate && (
            <div className="space-y-1.5 pt-1">
              <DeadlinePolicyField
                targetDate={pm.targetDate}
                goalValue={pm.goalValue ?? ''}
                policy={props.deadlinePolicy ?? 'keep-deadline'}
                onChange={props.onDeadlinePolicyChange}
              />
            </div>
          )}
        </div>
      )}
      {pm.note && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-keep">메모: {pm.note}</p>
      )}
      {(() => {
        const willPlan = (pm.goalType === 'deadlineWeeks' || pm.goalType === 'dailyAmount') && !!pm.total && pm.total > 0;
        return (
          <p className="text-[9px] font-bold text-[#0071E3]/70 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
            {willPlan ? ' 승인 시 위 계획으로 자료가 생성됩니다.' : ' 승인 시 자율(selfPaced) 자료로 생성됩니다.'}
          </p>
        );
      })()}
    </div>
  );
}

// proposedMaterialEdit 기존 교재/강의 수정 제안 표시 — 바뀌는 필드만 before → after 로
function ProposedMaterialEditCard(props: ApprovalFormsProps & { pme: ProposedMaterialEdit }) {
  const { pme, student } = props;
  const isBook = pme.materialType === 'book';
  const unitLabel = isBook ? (pme.unit || pme.current?.unit || 'p') : '강';
  const daysText = (days?: string[]) => (days?.length ? days.map((d) => DAY_LABEL_KO[d] || d).join('·') : '기본');
  // 미지정('')은 시간표 제외가 아니라 교시 고정 해제 — 빈 교시에 자동 배치되고, 과목 시간대가 있으면 그쪽을 따른다.
  const timeText = (t?: string) => (t ? (TIME_LABEL_KO[t] || t) : '교시 미지정(자동 배치)');
  // 서버 실제 값 우선, 없으면(자료 조회 실패) 학생 스냅샷으로 폴백.
  const cur = getEditTargetState(student, pme);
  const before = {
    title: cur?.title ?? pme.current?.title ?? pme.materialTitle,
    total: cur?.total ?? pme.current?.total ?? 0,
    unit: cur?.unit || pme.current?.unit || 'p',
    studyDays: cur?.studyDays ?? pme.current?.studyDays,
    studyTime: cur?.studyTime ?? pme.current?.studyTime,
  };
  const diffs: Array<{ field: string; before: string; after: string }> = [];
  if (pme.title) diffs.push({ field: '자료명', before: before.title, after: pme.title });
  if (pme.total !== undefined) diffs.push({ field: '총 분량', before: before.total ? `${before.total}${unitLabel}` : '미정', after: `${pme.total}${unitLabel}` });
  if (pme.unit) diffs.push({ field: '단위', before: before.unit, after: pme.unit });
  if (pme.studyDays) diffs.push({ field: '학습 요일', before: daysText(before.studyDays), after: daysText(pme.studyDays) });
  if (pme.studyTime !== undefined) diffs.push({ field: '시간대', before: timeText(before.studyTime), after: timeText(pme.studyTime) });
  const hasPlans = !!cur?.hasPlans;
  // 총량이 진도보다 작아지면 승인 시 진도가 새 총량으로 내려간다 — 미리 알린다.
  const willClampProgress = pme.total !== undefined && !!cur && cur.progress > pme.total;
  return (
    <div className="rounded-2xl border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
        <SquarePen className="w-3.5 h-3.5" />
        교재/강의 수정 요청
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {isBook
          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : <Tv className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />}
        <span className="font-black text-slate-700 dark:text-slate-300 truncate">{pme.subjectName} · {pme.materialTitle}</span>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 shrink-0">{isBook ? '교재' : '인강'}</span>
      </div>
      <div className="space-y-1">
        {diffs.map((d) => (
          <div key={d.field} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-14 shrink-0 font-bold text-slate-400 dark:text-slate-500">{d.field}</span>
            <span className="min-w-0 truncate rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-semibold text-slate-500 dark:text-slate-400 line-through">{d.before}</span>
            <span className="shrink-0 font-black text-slate-300 dark:text-slate-600">→</span>
            <span className="min-w-0 truncate rounded-lg border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-black text-[#0071E3]">{d.after}</span>
          </div>
        ))}
      </div>
      {pme.reason && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-keep">사유: {pme.reason}</p>
      )}
      {(pme.total !== undefined || pme.studyDays || pme.studyTime !== undefined) && hasPlans && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={props.regenerate ?? true}
            onChange={(e) => props.onRegenerateChange(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#0071E3]"
          />
          <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 break-keep">
            승인하면서 학습계획도 새 총량·요일 기준으로 재생성 (권장) — 끄면 자료 정보만 바뀌고 기존 주차 계획(옛 범위)이 그대로 남아요.
          </span>
        </label>
      )}
      {willClampProgress && (
        <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 break-keep">
          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
          현재 진도 {cur!.progress}{unitLabel} &gt; 신청 총량 {pme.total}{unitLabel} — 승인 시 진도가 {pme.total}{unitLabel}(완료)로 조정됩니다.
        </p>
      )}
      <p className="text-[9px] font-bold text-[#0071E3]/70 flex items-center gap-1 break-keep">
        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
        승인 시 위 값으로 자료 정보가 수정됩니다. {willClampProgress ? '진도는 위 안내대로 조정됩니다.' : '진도 기록은 유지됩니다.'}
      </p>
    </div>
  );
}

// proposedMaterialDelete 교재/강의(또는 과목 전체) 삭제 제안 표시 — 파괴적 작업이라 위험(red) 톤
function ProposedMaterialDeleteCard(props: { student?: Student; pmd: ProposedMaterialDelete }) {
  const { pmd, student } = props;
  const isSubject = pmd.scope === 'subject';
  const progress = getMaterialDeleteProgress(student, pmd);
  const subjectCount = isSubject ? getSubjectDeleteCount(student, pmd) : 0;
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-wider">
        <Trash2 className="w-3.5 h-3.5" />
        교재/강의 삭제 요청
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {isSubject
          ? <Target className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : pmd.materialType === 'book'
          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : <Tv className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />}
        <span className="font-black text-slate-700 dark:text-slate-300 truncate">
          {isSubject
            ? `과목 전체 삭제: ${pmd.subjectName}`
            : `자료 하나 삭제: ${pmd.subjectName} · ${pmd.materialTitle || pmd.materialId}`}
        </span>
      </div>
      {isSubject && (
        <span className="inline-block bg-white dark:bg-[#1c1c1e] border border-red-200 dark:border-red-500/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
          하위 자료 {subjectCount}개 포함
        </span>
      )}
      {progress && (
        <span className="inline-block bg-white dark:bg-[#1c1c1e] border border-red-200 dark:border-red-500/30 rounded-lg px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
          현재 진도 {progress.label} — 삭제하면 사라져요
        </span>
      )}
      {pmd.reason && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-keep">사유: {pmd.reason}</p>
      )}
      <p className="text-[9px] font-bold text-red-600/80 dark:text-red-400/80 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
        승인 시 되돌릴 수 없이 삭제됩니다. 진도 기록도 함께 사라져요.
      </p>
    </div>
  );
}

// proposedProgressCorrection 진도 숫자 정정 제안 표시 — 승인 시 진도 자동 반영
function ProposedProgressCorrectionCard(props: { student?: Student; ppc: ProposedProgressCorrection }) {
  const { ppc, student } = props;
  const unitLabel = getMaterialUnit(student, ppc.materialType, ppc.materialId);
  return (
    <div className="rounded-2xl border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
        <Target className="w-3.5 h-3.5" />
        진도 숫자 정정 요청
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {ppc.materialType === 'book'
          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          : <Tv className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />}
        <span className="font-black text-slate-700 dark:text-slate-300 truncate">
          {ppc.subjectName ? `${ppc.subjectName} · ` : ''}{ppc.materialTitle || ppc.materialId}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="min-w-0 truncate rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-semibold text-slate-500 dark:text-slate-400 line-through">
          {ppc.fromValue !== undefined ? `${ppc.fromValue}${unitLabel}` : '현재값'}
        </span>
        <span className="shrink-0 font-black text-slate-300 dark:text-slate-600">→</span>
        <span className="min-w-0 truncate rounded-lg border border-[#0071E3]/20 dark:border-[#0071E3]/30 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 font-black text-[#0071E3]">
          {ppc.toValue}{unitLabel}
        </span>
      </div>
      {ppc.reason && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-keep">사유: {ppc.reason}</p>
      )}
      <p className="text-[9px] font-bold text-[#0071E3]/70 flex items-center gap-1 break-keep">
        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
        승인 시 진도가 {ppc.toValue}{unitLabel}(으)로 자동 정정됩니다(총량 초과 시 총량으로 조정).
      </p>
    </div>
  );
}
