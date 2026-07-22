import type { Student, BookProgress, LectureProgress, DetailedPlan } from '@/lib/types/student';
import { generateDetailedPlans, getMaterialStudyDays } from '@/lib/progress-plan';

// ── 계획 정합성 점검(무결성 검증) ────────────────────────────────────────────
// 하루 목표(goalType==='dailyAmount') 자료에서, 마지막 부분 주의 일일량이 ceil(잔량/주학습일)로
// 희석돼 저장된 케이스를 검출한다("하루 3강 목표인데 계획표엔 일일 2강" 버그).
//
// 판정: 그 자료의 일일계획(periodType 없는 plan) 중 저장된 일일량이
//   기대치 = min(R, 그 주 목표량)  (R = 그 자료 최대 저장 일일량 = 실제 목표 일일량)
// 보다 작으면 희석된 것 → 재설정 필요.
//
// 시간예산 캡(무거운 자료라 하루 2강으로 눌린 경우)은 모든 주가 동일하게 2라 R=2 → 오탐 없이 통과.
// 재설정은 targetAmount·날짜·rangeText·완료상태를 건드리지 않고 dailyAmount 만 제자리 교정하므로
// 전체 재생성(완료상태·마감 리앵커 위험)보다 안전하고, 재생성과 동일한 결과를 낸다.

type Material = BookProgress | LectureProgress;

export interface StalePlanWeek {
  weekNumber: number;
  stored: number;      // 현재 저장된 일일량
  expected: number;    // 교정 후 일일량
  targetAmount: number;
  rangeText: string;
}

export interface StalePlanMaterial {
  subjectId: string;
  subjectName: string;
  materialId: string;
  type: 'book' | 'lecture';
  title: string;
  unit: string;        // 표시용 단위(p/강 등)
  goalDaily: number;   // 목표 일일량(R)
  weeks: StalePlanWeek[];
}

export interface StalePlanStudent {
  studentId: string;
  studentName: string;
  campus: string;
  manager: string;
  materials: StalePlanMaterial[];
}

// plan 에 저장된 일일량(미설정이면 레거시 폴백 ceil(목표/6)).
function storedDaily(p: DetailedPlan): number {
  return Math.max(1, Math.round(p.dailyAmount ?? Math.ceil((p.targetAmount || 1) / 6)));
}

// 자료 하나에 대해 희석된 주를 계산. weeks 는 검출된(교정 필요) 주만. 없으면 null.
function analyzeMaterial(material: Material): { goalDaily: number; weeks: StalePlanWeek[] } | null {
  if (material.goalType !== 'dailyAmount') return null;
  const daily = (material.detailedPlans || []).filter((p) => !p.periodType);
  if (daily.length < 2) return null; // 단일 주는 희석이 불가능

  const goalDaily = Math.max(...daily.map(storedDaily));
  const weeks: StalePlanWeek[] = [];
  for (const p of daily) {
    const tgt = Math.max(1, Math.round(p.targetAmount || 0));
    const expected = Math.min(goalDaily, tgt);
    const cur = storedDaily(p);
    if (cur < expected) {
      weeks.push({ weekNumber: p.weekNumber, stored: cur, expected, targetAmount: p.targetAmount, rangeText: p.rangeText });
    }
  }
  return weeks.length > 0 ? { goalDaily, weeks } : null;
}

// 자료의 표시 단위.
function unitOf(material: Material, type: 'book' | 'lecture'): string {
  if (type === 'lecture') return '강';
  return (material as BookProgress).unit || 'p';
}

// 학생의 모든 자료(과목 하위 + 레거시 최상위)를 과목 컨텍스트와 함께 순회.
function eachMaterial(
  student: Student,
  cb: (subjectId: string, subjectName: string, material: Material, type: 'book' | 'lecture') => void,
) {
  if (student.subjects && student.subjects.length > 0) {
    for (const sub of student.subjects) {
      (sub.books || []).forEach((b) => cb(sub.id, sub.name, b, 'book'));
      (sub.lectures || []).forEach((l) => cb(sub.id, sub.name, l, 'lecture'));
    }
  } else {
    (student.books || []).forEach((b) => cb('', '기본', b, 'book'));
    (student.lectures || []).forEach((l) => cb('', '기본', l, 'lecture'));
  }
}

// 학생 1명의 재설정 필요 자료 목록.
export function detectStalePlansForStudent(student: Student): StalePlanMaterial[] {
  const out: StalePlanMaterial[] = [];
  eachMaterial(student, (subjectId, subjectName, material, type) => {
    const res = analyzeMaterial(material);
    if (!res) return;
    out.push({
      subjectId,
      subjectName,
      materialId: material.id,
      type,
      title: type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name,
      unit: unitOf(material, type),
      goalDaily: res.goalDaily,
      weeks: res.weeks,
    });
  });
  return out;
}

// 여러 학생 스캔 → 재설정 필요한 학생만.
export function scanStalePlans(students: Student[]): StalePlanStudent[] {
  const out: StalePlanStudent[] = [];
  for (const student of students) {
    const materials = detectStalePlansForStudent(student);
    if (materials.length === 0) continue;
    out.push({
      studentId: student.id,
      studentName: student.name,
      campus: student.campus,
      manager: student.manager,
      materials,
    });
  }
  return out;
}

// 특정 자료의 일일량을 제자리 교정(재설정). 바뀌면 true.
// targetAmount·날짜·rangeText·isCompleted·actualAmount 는 그대로 두고 dailyAmount 만 올린다.
export function fixStalePlansForMaterial(material: Material): boolean {
  if (material.goalType !== 'dailyAmount') return false;
  const plans = material.detailedPlans || [];
  const daily = plans.filter((p) => !p.periodType);
  if (daily.length < 2) return false;

  const goalDaily = Math.max(...daily.map(storedDaily));
  let changed = false;
  for (const p of plans) {
    if (p.periodType) continue;
    const tgt = Math.max(1, Math.round(p.targetAmount || 0));
    const expected = Math.min(goalDaily, tgt);
    if (storedDaily(p) < expected) {
      p.dailyAmount = expected;
      changed = true;
    }
  }
  return changed;
}

// 학생의 특정 자료를 찾아 교정. 대상 자료를 찾았으면 그 자료를, 못 찾으면 null.
// (updateStudentById 뮤테이터에서 사용 — student 를 직접 변형)
export function fixStalePlansForStudentMaterial(student: Student, materialId: string): boolean {
  let changed = false;
  eachMaterial(student, (_subjectId, _subjectName, material) => {
    if (material.id !== materialId) return;
    if (fixStalePlansForMaterial(material)) {
      material.updatedAt = new Date().toISOString();
      changed = true;
    }
  });
  return changed;
}

// ── 검사 2: 총량 ↔ 계획 범위 불일치 ─────────────────────────────────────────
// 수정 승인 등으로 총량이 줄었는데 주차 계획은 옛 범위(예: 총량 300p 자료에 "251p ~ 500p")로
// 남은 케이스를 검출한다. 계획 범위 끝(rangeText의 마지막 숫자)이 총량을 넘으면 불일치.

export interface TotalMismatchMaterial {
  subjectId: string;
  subjectName: string;
  materialId: string;
  type: 'book' | 'lecture';
  title: string;
  unit: string;
  total: number;        // 현재 총량
  maxPlanEnd: number;   // 계획이 참조하는 최대 위치
  progress: number;     // 현재 진도(재생성 기준점 표시용)
  goalLabel: string;    // 표시용 목표 요약(예: dailyAmount/30)
}

export interface TotalMismatchStudent {
  studentId: string;
  studentName: string;
  campus: string;
  manager: string;
  materials: TotalMismatchMaterial[];
}

// 1회독 계획(rangeText "1회독 251p ~ 500p")의 끝 위치. 회독(passNumber>1) 계획은 같은 범위를
// 다시 돌므로 총량 초과 판정에서 제외할 필요 없음(같은 총량 기준).
function planEndOf(p: DetailedPlan): number {
  const nums = (p.rangeText || '').replace(/\d+\s*회독/g, '').match(/\d+/g)?.map(Number) || [];
  return nums.length > 0 ? nums[nums.length - 1] : 0;
}

export function detectTotalMismatchForStudent(student: Student): TotalMismatchMaterial[] {
  const out: TotalMismatchMaterial[] = [];
  eachMaterial(student, (subjectId, subjectName, material, type) => {
    const total = type === 'book'
      ? Number((material as BookProgress).totalPages) || 0
      : Number((material as LectureProgress).totalLectures) || 0;
    if (total <= 0) return; // selfPaced(총량 미정)는 대상 아님
    const plans = material.detailedPlans || [];
    if (plans.length === 0) return;
    const maxPlanEnd = Math.max(...plans.map(planEndOf));
    if (maxPlanEnd <= total) return;
    const progress = type === 'book'
      ? Number((material as BookProgress).currentPage) || 0
      : Number((material as LectureProgress).completedLectures) || 0;
    out.push({
      subjectId,
      subjectName,
      materialId: material.id,
      type,
      title: type === 'book' ? (material as BookProgress).title : (material as LectureProgress).name,
      unit: unitOf(material, type),
      total,
      maxPlanEnd,
      progress,
      goalLabel: `${material.goalType || '-'}${material.goalValue ? `/${material.goalValue}` : ''}`,
    });
  });
  return out;
}

export function scanTotalMismatches(students: Student[]): TotalMismatchStudent[] {
  const out: TotalMismatchStudent[] = [];
  for (const student of students) {
    const materials = detectTotalMismatchForStudent(student);
    if (materials.length === 0) continue;
    out.push({
      studentId: student.id,
      studentName: student.name,
      campus: student.campus,
      manager: student.manager,
      materials,
    });
  }
  return out;
}

// 총량 불일치 자료의 계획을 현재 총량·진도 기준으로 재생성. 진도·목표(goalType/goalValue)는 보존.
// (updateStudentById 뮤테이터에서 사용 — student 를 직접 변형. 미러(top-level)와 subjects 양쪽에
// 같은 결과가 들어가도록 한 번 생성해 양쪽에 대입한다.)
export function regeneratePlansForStudentMaterial(student: Student, materialId: string): boolean {
  const planTypes = ['weeks', 'weeklyAmount', 'dailyAmount', 'deadlineWeeks'];
  let generated: { plans: DetailedPlan[]; calculatedTargetDate: string } | null = null;
  let matType: 'book' | 'lecture' = 'book';

  // 대상 자료(과목 하위 우선)를 찾아 컨텍스트와 함께 1회 생성.
  let parentStudyDays: string[] | undefined;
  let parentStudyTime: string | undefined;
  let found: Material | null = null;
  for (const sub of student.subjects || []) {
    const b = (sub.books || []).find((m) => m.id === materialId);
    if (b) { found = b; matType = 'book'; parentStudyDays = sub.studyDays; parentStudyTime = sub.studyTime; break; }
    const l = (sub.lectures || []).find((m) => m.id === materialId);
    if (l) { found = l; matType = 'lecture'; parentStudyDays = sub.studyDays; parentStudyTime = sub.studyTime; break; }
  }
  if (!found) {
    found = (student.books || []).find((m) => m.id === materialId) || null;
    if (found) matType = 'book';
    else {
      found = (student.lectures || []).find((m) => m.id === materialId) || null;
      if (found) matType = 'lecture';
    }
  }
  if (!found || !planTypes.includes(found.goalType || '')) return false;
  const total = matType === 'book'
    ? Number((found as BookProgress).totalPages) || 0
    : Number((found as LectureProgress).totalLectures) || 0;
  const goalValue = Number(found.goalValue) || 0;
  if (total <= 0 || goalValue <= 0) return false;
  const progress = matType === 'book'
    ? Number((found as BookProgress).currentPage) || 0
    : Number((found as LectureProgress).completedLectures) || 0;

  generated = generateDetailedPlans(
    materialId,
    total,
    matType,
    found.goalType as 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks',
    goalValue,
    progress,
    matType === 'book' ? (found as BookProgress).unit : undefined,
    found.reviewPasses || [],
    getMaterialStudyDays(parentStudyDays, found.studyDays),
    matType === 'lecture' ? Number((found as LectureProgress).speedMultiplier) || 1.0 : 1.0,
    found.estimatedMinutesPerUnit,
    parentStudyTime,
    found.category,
  );

  const nowIso = new Date().toISOString();
  const apply = (m: Material) => {
    if (m.id !== materialId || !generated) return;
    m.detailedPlans = generated.plans;
    m.targetDate = generated.calculatedTargetDate;
    m.updatedAt = nowIso;
  };
  for (const sub of student.subjects || []) {
    (sub.books || []).forEach(apply);
    (sub.lectures || []).forEach(apply);
  }
  (student.books || []).forEach(apply);
  (student.lectures || []).forEach(apply);
  return true;
}
