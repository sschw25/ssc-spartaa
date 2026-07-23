'use client';

import React from 'react';
import { MessageSquare, Plus, Trash2, CheckCircle2, Calendar, Rabbit, Turtle, BookPlus, CalendarCog, Pencil, RefreshCw, Lightbulb, AlertTriangle, SquarePen } from 'lucide-react';
import { BookProgress, LectureProgress, ProposedGoal, ProposedMaterial, ProposedMaterialEdit, ProposedMaterialDelete, ProposedProgressCorrection, Student } from '@/lib/types/student';
import { STUDY_TIME_SLOTS } from '@/lib/academy-timetable';

const MA_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type MaDay = (typeof MA_DAY_ORDER)[number];
const MA_DAY_LABELS: Record<MaDay, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const MA_TIME_LABELS: Record<'morning' | 'afternoon' | 'night', string> = { morning: '오전', afternoon: '오후', night: '야간' };
// 교재형 자료의 분량 단위 선택지 — 인강은 '강' 고정. '시간'은 총량=총 몇 시간, 하루 분량과 함께 쓰면 '하루 N시간' 계획이 돼요.
const MA_UNIT_OPTIONS = [
  { key: 'p', label: '페이지', hint: '' },
  { key: '문제', label: '문제 수', hint: '문제집처럼 푼 문제 수로 진도를 세요.' },
  { key: '시간', label: '시간', hint: '총 몇 시간 분량인지로 계획을 세요. 하루 분량과 함께 쓰면 ‘하루 N시간’이 돼요.' },
] as const;
// 커스텀(직접입력) 판정도 같은 칩 목록에서 파생 — 칩을 추가하면 프리필 판정이 자동으로 따라온다.
const MA_UNIT_KEYS: readonly string[] = MA_UNIT_OPTIONS.map((o) => o.key);

type GoalType = 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' | 'selfPaced';

type RequestForm = {
  requestType: string;
  message: string;
  materialId: string;
  materialType: 'book' | 'lecture';
  goalType: GoalType;
  goalValue: string;
  planStartDate: string;
  targetDate: string;
  studyDays: MaDay[];
  currentProgress: string;
  proposedWeekNumber: string;
  proposedRangeText: string;
  speedMultiplier: string;
  currentGoalSnapshot: { goalType?: GoalType; goalValue?: number; speedMultiplier?: number } | null;
};

// KST 오늘(YYYY-MM-DD)
function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}
// 목표 완료일 → 주수(1~12). 오늘~목표일 사이 일수를 7로 나눠 올림, 1~12 클램프.
function weeksUntilFrom(fromStr: string, dateStr: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 0;
  const today = new Date(fromStr + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return 0;
  return Math.max(1, Math.min(12, Math.ceil(days / 7)));
}

interface LearningRequestPanelProps {
  student: Student;
  isStudentReport: boolean;
  requestForm: RequestForm;
  setRequestForm: React.Dispatch<React.SetStateAction<RequestForm>>;
  requestSubmitting: boolean;
  requestCustomOpen: boolean;
  setRequestCustomOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sendRequest: (type: string, message: string, proposedGoal?: ProposedGoal, proposedMaterial?: ProposedMaterial, proposedMakeup?: { materialId: string; materialType: 'book' | 'lecture'; done: number }, proposedMaterialDelete?: ProposedMaterialDelete, proposedMaterialEdit?: ProposedMaterialEdit, proposedProgressCorrection?: ProposedProgressCorrection) => Promise<boolean>;
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
  // 교재/인강 추가 신청 — 이 컴포넌트 로컬 state 로만 관리(공유 requestForm 오염 금지).
  const subjectNames = React.useMemo(
    () => Array.from(new Set((student.subjects || []).map((s) => (s.name || '').trim()).filter(Boolean))),
    [student.subjects],
  );
  // 계획 신청 대상 자료 목록 — 진도 단일소스인 subjects[] 를 우선으로, top-level 과 합쳐 id 기준 중복 제거.
  // (학생이 직접 추가한 자료는 subjects 에만 들어가므로 top-level 만 읽으면 계획 신청에서 누락됨)
  const requestBooks = React.useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const b of (student.subjects || []).flatMap((s) => s.books || [])) if (b?.id) map.set(b.id, { id: b.id, title: b.title });
    for (const b of (student.books || [])) if (b?.id && !map.has(b.id)) map.set(b.id, { id: b.id, title: b.title });
    return Array.from(map.values());
  }, [student.subjects, student.books]);
  const requestLectures = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const l of (student.subjects || []).flatMap((s) => s.lectures || [])) if (l?.id) map.set(l.id, { id: l.id, name: l.name });
    for (const l of (student.lectures || [])) if (l?.id && !map.has(l.id)) map.set(l.id, { id: l.id, name: l.name });
    return Array.from(map.values());
  }, [student.subjects, student.lectures]);
  // id → 자료 상세(진도·목표) 조회: onChange 프리필용. subjects 우선, 없으면 top-level.
  const findMaterialById = React.useCallback((id: string) => {
    const book = (student.subjects || []).flatMap((s) => s.books || []).find((b) => b.id === id)
      || (student.books || []).find((b) => b.id === id);
    if (book) return { kind: 'book' as const, mat: book };
    const lecture = (student.subjects || []).flatMap((s) => s.lectures || []).find((l) => l.id === id)
      || (student.lectures || []).find((l) => l.id === id);
    if (lecture) return { kind: 'lecture' as const, mat: lecture };
    return null;
  }, [student.subjects, student.books, student.lectures]);
  // 진도·계획 요청 폼에서 선택한 자료의 표시 단위 — 교재는 material.unit(기본 p·문제·시간 등), 인강은 '강'.
  const requestFormUnit = React.useMemo(() => {
    if (requestForm.materialType !== 'book') return '강';
    const found = requestForm.materialId ? findMaterialById(requestForm.materialId) : null;
    return found?.kind === 'book' ? ((found.mat as BookProgress).unit || 'p') : 'p';
  }, [requestForm.materialId, requestForm.materialType, findMaterialById]);
  const [materialAddOpen, setMaterialAddOpen] = React.useState(false);
  const [maSubjectMode, setMaSubjectMode] = React.useState<'existing' | 'new'>(subjectNames.length > 0 ? 'existing' : 'new');
  const [maForm, setMaForm] = React.useState({
    subjectName: subjectNames[0] || '',
    newSubjectName: '',
    materialType: 'book' as 'book' | 'lecture',
    title: '',
    studyDays: [] as MaDay[],
    studyTime: '' as 'morning' | 'afternoon' | 'night' | '',
    currentProgress: '',
    total: '',
    unit: '',
    // 단위 직접입력 모드 — false면 칩 선택(페이지/문제/시간), true면 자유 텍스트 입력.
    unitCustom: false,
    note: '',
    // 인강 전용 — 체크 시 승인으로 만들어지는 인강에 오답노트가 켜져요.
    useWrongNotes: false,
    // 추가하면서 학습 방식 지정(선택). 기본 자율. 마감일/하루분량은 총량 입력 필요.
    goalMode: 'selfPaced' as 'selfPaced' | 'deadlineWeeks' | 'dailyAmount',
    goalStartDate: kstToday(),
    goalTargetDate: '',
    goalDaily: '',
  });
  const [maError, setMaError] = React.useState('');

  const resetMaForm = () => {
    setMaForm({
      subjectName: subjectNames[0] || '',
      newSubjectName: '',
      materialType: 'book',
      title: '',
      studyDays: [],
      studyTime: '',
      currentProgress: '',
      total: '',
      unit: '',
      unitCustom: false,
      note: '',
      useWrongNotes: false,
      goalMode: 'selfPaced',
      goalStartDate: kstToday(),
      goalTargetDate: '',
      goalDaily: '',
    });
    setMaSubjectMode(subjectNames.length > 0 ? 'existing' : 'new');
    setMaError('');
  };

  const toggleMaDay = (day: MaDay) => {
    setMaForm((f) => ({
      ...f,
      studyDays: f.studyDays.includes(day) ? f.studyDays.filter((d) => d !== day) : [...f.studyDays, day],
    }));
  };

  const submitMaterialAdd = async () => {
    const subjName = (maSubjectMode === 'new' ? maForm.newSubjectName : maForm.subjectName).trim();
    const title = maForm.title.trim();
    if (!subjName) { setMaError('과목을 선택하거나 입력해 주세요.'); return; }
    if (!title) { setMaError(maForm.materialType === 'lecture' ? '강의명을 입력해 주세요.' : '자료명을 입력해 주세요.'); return; }
    const totalNum = maForm.total ? Number(maForm.total) : 0;
    // 계획(마감일/하루분량)을 정하려면 총량이 필요 — 없으면 자율로만 추가 가능.
    if (maForm.goalMode !== 'selfPaced' && !(totalNum > 0)) {
      setMaError('마감일·하루 분량 계획을 정하려면 총량을 입력해 주세요. (모르면 자율로 두세요)');
      return;
    }
    if (maForm.goalMode !== 'selfPaced' && !maForm.goalStartDate) { setMaError('계획 시작일을 골라 주세요.'); return; }
    if (maForm.goalMode === 'deadlineWeeks' && !maForm.goalTargetDate) { setMaError('목표 완료일을 골라 주세요.'); return; }
    if (maForm.goalMode === 'dailyAmount' && !(Number(maForm.goalDaily) > 0)) { setMaError('하루 학습량을 입력해 주세요.'); return; }
    const deadlineWeeks = maForm.goalMode === 'deadlineWeeks' ? weeksUntilFrom(maForm.goalStartDate, maForm.goalTargetDate) : 0;
    if (maForm.goalMode === 'deadlineWeeks' && deadlineWeeks === 0) { setMaError('목표 완료일은 시작일 이후 날짜로 골라 주세요.'); return; }
    setMaError('');

    const typeLabel = maForm.materialType === 'book' ? '교재' : '인강';
    const unitLabel = maForm.materialType === 'book' ? (maForm.unit.trim() || 'p') : '강';
    const daysStr = MA_DAY_ORDER.filter((d) => maForm.studyDays.includes(d)).map((d) => MA_DAY_LABELS[d]).join('·');
    const timeStr = maForm.studyTime ? MA_TIME_LABELS[maForm.studyTime] : '';
    const parts: string[] = [subjName, `${typeLabel} "${title}"`];
    const schedule = [daysStr, timeStr].filter(Boolean).join(' ');
    if (schedule) parts.push(schedule);
    if (maForm.currentProgress) parts.push(`현재 ${maForm.currentProgress}${unitLabel}`);
    if (totalNum > 0) parts.push(`총 ${totalNum}${unitLabel}`);
    const planStr = maForm.goalMode === 'deadlineWeeks' ? `${maForm.goalStartDate}부터 ${maForm.goalTargetDate}까지`
      : maForm.goalMode === 'dailyAmount' ? `${maForm.goalStartDate}부터 하루 ${maForm.goalDaily}${unitLabel}`
      : '';
    if (planStr) parts.push(`계획 ${planStr}`);
    const message = `[교재/인강 추가] ${parts.join(' · ')}` + (maForm.note.trim() ? `\n메모: ${maForm.note.trim()}` : '');

    const isNewSubject = maSubjectMode === 'new' || !subjectNames.some((n) => n.toLowerCase() === subjName.toLowerCase());
    const proposedMaterial: ProposedMaterial = {
      subjectName: subjName,
      isNewSubject,
      materialType: maForm.materialType,
      title,
      total: totalNum > 0 ? totalNum : undefined,
      unit: maForm.materialType === 'book' && maForm.unit.trim() ? maForm.unit.trim() : undefined,
      currentProgress: maForm.currentProgress ? Number(maForm.currentProgress) : undefined,
      studyDays: maForm.studyDays.length > 0 ? maForm.studyDays : undefined,
      studyTime: maForm.studyTime || undefined,
      useWrongNotes: maForm.materialType === 'lecture' && maForm.useWrongNotes ? true : undefined,
      note: maForm.note.trim() || undefined,
      ...(maForm.goalMode === 'deadlineWeeks' ? { goalType: 'deadlineWeeks' as const, goalValue: deadlineWeeks, planStartDate: maForm.goalStartDate, targetDate: maForm.goalTargetDate }
        : maForm.goalMode === 'dailyAmount' ? { goalType: 'dailyAmount' as const, goalValue: Number(maForm.goalDaily), planStartDate: maForm.goalStartDate }
        : {}),
    };

    const ok = await sendRequest('materialAdd', message, undefined, proposedMaterial);
    if (!ok) return; // 실패 시 입력 보존 — 폼을 지우거나 닫지 않는다
    resetMaForm();
    setMaterialAddOpen(false);
  };

  // 기존 교재/강의 수정 신청(materialEdit) — 추가/삭제와 대칭인 별도 로컬 state.
  // 자료 목록은 subjects[]를 순회해 부모 과목(id/name)까지 함께 뽑고(승인 시 subjectId 필요),
  // 프리필/변경 비교에 필요한 현재 값(자료명·총량·단위·요일·시간대)까지 담는다. 삭제 폼도 이 목록을 공유한다.
  const editableMaterials = React.useMemo(() => {
    type EditableMaterial = {
      id: string; type: 'book' | 'lecture'; title: string; subjectId?: string; subjectName: string;
      total: number; unit: string; studyDays: MaDay[]; studyTime: string;
    };
    const list: EditableMaterial[] = [];
    const seen = new Set<string>();
    const pushBook = (b: BookProgress, subjectId: string | undefined, subjectName: string) => {
      if (!b?.id || seen.has(b.id)) return;
      seen.add(b.id);
      list.push({
        id: b.id, type: 'book', title: b.title, subjectId, subjectName,
        total: Number(b.totalPages) || 0,
        unit: (b.unit || '').trim(),
        studyDays: (b.studyDays || []) as MaDay[],
        studyTime: b.studySlot || b.studyTime || '',
      });
    };
    const pushLecture = (l: LectureProgress, subjectId: string | undefined, subjectName: string) => {
      if (!l?.id || seen.has(l.id)) return;
      seen.add(l.id);
      list.push({
        id: l.id, type: 'lecture', title: l.name, subjectId, subjectName,
        total: Number(l.totalLectures) || 0,
        unit: '',
        studyDays: (l.studyDays || []) as MaDay[],
        studyTime: l.studySlot || l.studyTime || '',
      });
    };
    for (const s of student.subjects || []) {
      for (const b of s.books || []) pushBook(b, s.id, s.name);
      for (const l of s.lectures || []) pushLecture(l, s.id, s.name);
    }
    for (const b of student.books || []) pushBook(b, undefined, '(과목 미지정)');
    for (const l of student.lectures || []) pushLecture(l, undefined, '(과목 미지정)');
    return list;
  }, [student.subjects, student.books, student.lectures]);

  const [materialEditOpen, setMaterialEditOpen] = React.useState(false);
  const [meMaterialId, setMeMaterialId] = React.useState('');
  const [meTitle, setMeTitle] = React.useState('');
  const [meTotal, setMeTotal] = React.useState('');
  const [meUnit, setMeUnit] = React.useState('');
  // 단위 직접입력 모드 — 기존 단위가 칩(페이지/문제/시간) 밖의 값(회·장 등)이면 켜진 채로 프리필된다.
  const [meUnitCustom, setMeUnitCustom] = React.useState(false);
  const [meStudyDays, setMeStudyDays] = React.useState<MaDay[]>([]);
  const [meStudyTime, setMeStudyTime] = React.useState('');
  // 시간대는 학생이 직접 건드렸을 때만 신청에 담는다 — 현재 값이 블록이 아닌(특정 교시/시:분 직접지정)
  // 자료는 폼에 프리필할 수 없어서, 안 건드린 걸 '미지정으로 바꿔주세요'로 오해하면 안 되기 때문.
  const [meTimeTouched, setMeTimeTouched] = React.useState(false);
  const [meReason, setMeReason] = React.useState('');
  const [meError, setMeError] = React.useState('');

  const meTarget = React.useMemo(
    () => editableMaterials.find((m) => m.id === meMaterialId) || null,
    [editableMaterials, meMaterialId],
  );
  // 현재 시간대가 블록(오전/오후/야간)이면 프리필 가능, 그 외(p0~p8·t:HH:MM)는 폼으로 표현 불가.
  const meTimeIsBlock = !!meTarget && (['morning', 'afternoon', 'night'] as string[]).includes(meTarget.studyTime);

  const resetMeForm = () => {
    setMeMaterialId('');
    setMeTitle('');
    setMeTotal('');
    setMeUnit('');
    setMeUnitCustom(false);
    setMeStudyDays([]);
    setMeStudyTime('');
    setMeTimeTouched(false);
    setMeReason('');
    setMeError('');
  };

  // 대상 자료를 고르면 현재 값으로 폼을 채운다 — 학생이 바꾸고 싶은 칸만 고치면 되게.
  const selectEditMaterial = (id: string) => {
    setMeMaterialId(id);
    setMeError('');
    setMeTimeTouched(false);
    const mat = editableMaterials.find((m) => m.id === id);
    if (!mat) {
      setMeTitle(''); setMeTotal(''); setMeUnit(''); setMeUnitCustom(false); setMeStudyDays([]); setMeStudyTime('');
      return;
    }
    setMeTitle(mat.title);
    setMeTotal(mat.total > 0 ? String(mat.total) : '');
    setMeUnit(mat.unit || (mat.type === 'book' ? 'p' : ''));
    setMeUnitCustom(mat.type === 'book' && !MA_UNIT_KEYS.includes(mat.unit || 'p'));
    setMeStudyDays(mat.studyDays);
    setMeStudyTime((['morning', 'afternoon', 'night'] as string[]).includes(mat.studyTime) ? mat.studyTime : '');
  };

  const toggleMeDay = (day: MaDay) => {
    setMeStudyDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const submitMaterialEdit = async () => {
    const mat = meTarget;
    if (!mat) { setMeError('수정할 자료를 선택해 주세요.'); return; }

    const title = meTitle.trim();
    if (!title) { setMeError('자료명은 비워 둘 수 없어요.'); return; }
    const totalNum = meTotal.trim() ? Number(meTotal) : 0;
    if (meTotal.trim() && !(Number.isFinite(totalNum) && totalNum >= 1)) {
      setMeError('총 분량은 1 이상 숫자로 입력해 주세요.');
      return;
    }
    const unit = meUnit.trim();

    // 현재 값과 실제로 달라진 필드만 담는다(undefined = 변경 없음).
    const daysChanged = MA_DAY_ORDER.filter((d) => meStudyDays.includes(d)).join(',')
      !== MA_DAY_ORDER.filter((d) => mat.studyDays.includes(d)).join(',');
    const proposedMaterialEdit: ProposedMaterialEdit = {
      subjectId: mat.subjectId,
      subjectName: mat.subjectName,
      materialType: mat.type,
      materialId: mat.id,
      materialTitle: mat.title,
      title: title !== mat.title ? title : undefined,
      total: totalNum > 0 && totalNum !== mat.total ? totalNum : undefined,
      // 미설정('')은 기본 p와 같은 뜻 — 'p → p' 같은 유령 변경을 만들지 않게 정규화해 비교한다.
      unit: mat.type === 'book' && unit && unit !== (mat.unit || 'p') ? unit : undefined,
      studyDays: daysChanged && meStudyDays.length > 0 ? meStudyDays : undefined,
      studyTime: meTimeTouched && meStudyTime !== mat.studyTime ? meStudyTime : undefined,
      reason: meReason.trim() || undefined,
      current: {
        title: mat.title,
        total: mat.total,
        unit: mat.unit || undefined,
        studyDays: mat.studyDays.length > 0 ? mat.studyDays : undefined,
        studyTime: mat.studyTime || undefined,
      },
    };

    const changes: string[] = [];
    if (proposedMaterialEdit.title) changes.push(`이름 "${mat.title}" → "${proposedMaterialEdit.title}"`);
    if (proposedMaterialEdit.total !== undefined) {
      const unitLabel = mat.type === 'book' ? (unit || mat.unit || 'p') : '강';
      changes.push(`총 분량 ${mat.total || '미정'}${unitLabel} → ${proposedMaterialEdit.total}${unitLabel}`);
    }
    if (proposedMaterialEdit.unit) changes.push(`단위 ${mat.unit || 'p'} → ${proposedMaterialEdit.unit}`);
    if (proposedMaterialEdit.studyDays) {
      changes.push(`학습 요일 ${MA_DAY_ORDER.filter((d) => proposedMaterialEdit.studyDays!.includes(d)).map((d) => MA_DAY_LABELS[d]).join('·')}`);
    }
    if (proposedMaterialEdit.studyTime !== undefined) {
      const timeLabel = proposedMaterialEdit.studyTime
        ? MA_TIME_LABELS[proposedMaterialEdit.studyTime as 'morning' | 'afternoon' | 'night']
        : '교시 지정 안 함';
      changes.push(`시간대 ${timeLabel}`);
    }
    if (changes.length === 0) { setMeError('바뀐 내용이 없어요. 고치고 싶은 칸을 바꿔 주세요.'); return; }
    setMeError('');

    const message = `[교재/강의 수정] ${mat.subjectName} · ${mat.title}\n${changes.map((c) => `- ${c}`).join('\n')}`
      + (meReason.trim() ? `\n사유: ${meReason.trim()}` : '');

    const ok = await sendRequest('materialEdit', message, undefined, undefined, undefined, undefined, proposedMaterialEdit);
    if (!ok) return; // 실패 시 입력 보존
    resetMeForm();
    setMaterialEditOpen(false);
  };

  // 교재/강의(또는 과목 전체) 삭제 신청 — proposedMaterial(추가)과 대칭인 별도 로컬 state.
  // 대상 자료 목록은 수정 폼과 같은 것(editableMaterials)을 쓴다 — 두 폼이 항상 같은 자료를 보여주게.
  const deletableMaterials = editableMaterials;
  const deletableSubjects = React.useMemo(
    () => (student.subjects || []).map((s) => ({ id: s.id, name: s.name, bookCount: (s.books || []).length, lectureCount: (s.lectures || []).length })),
    [student.subjects],
  );
  const [materialDeleteOpen, setMaterialDeleteOpen] = React.useState(false);
  const [mdScope, setMdScope] = React.useState<'material' | 'subject'>('material');
  const [mdMaterialId, setMdMaterialId] = React.useState('');
  const [mdSubjectId, setMdSubjectId] = React.useState('');
  const [mdReason, setMdReason] = React.useState('');
  const [mdError, setMdError] = React.useState('');

  const resetMdForm = () => {
    setMdScope('material');
    setMdMaterialId('');
    setMdSubjectId('');
    setMdReason('');
    setMdError('');
  };

  const submitMaterialDelete = async () => {
    if (mdScope === 'material') {
      const mat = deletableMaterials.find((m) => m.id === mdMaterialId);
      if (!mat) { setMdError('삭제할 자료를 선택해 주세요.'); return; }
      setMdError('');
      const proposedMaterialDelete: ProposedMaterialDelete = {
        scope: 'material',
        subjectId: mat.subjectId,
        subjectName: mat.subjectName,
        materialType: mat.type,
        materialId: mat.id,
        materialTitle: mat.title,
        reason: mdReason.trim() || undefined,
      };
      const message = `[교재/강의 삭제] ${mat.subjectName} · ${mat.title}` + (mdReason.trim() ? `\n사유: ${mdReason.trim()}` : '');
      const ok = await sendRequest('materialDelete', message, undefined, undefined, undefined, proposedMaterialDelete);
      if (!ok) return; // 실패 시 입력 보존
      resetMdForm();
      setMaterialDeleteOpen(false);
    } else {
      const subj = deletableSubjects.find((s) => s.id === mdSubjectId);
      if (!subj) { setMdError('삭제할 과목을 선택해 주세요.'); return; }
      setMdError('');
      const proposedMaterialDelete: ProposedMaterialDelete = {
        scope: 'subject',
        subjectId: subj.id,
        subjectName: subj.name,
        reason: mdReason.trim() || undefined,
      };
      const message = `[교재/강의 삭제] ${subj.name} · 과목 전체 삭제` + (mdReason.trim() ? `\n사유: ${mdReason.trim()}` : '');
      const ok = await sendRequest('materialDelete', message, undefined, undefined, undefined, proposedMaterialDelete);
      if (!ok) return; // 실패 시 입력 보존
      resetMdForm();
      setMaterialDeleteOpen(false);
    }
  };

  // 진도 숫자 정정 신청(progressCorrection) — 자료·정정값이 구조화되어 관리자 승인 시 자동 반영된다.
  // 자료 목록은 editableMaterials(수정/삭제 폼과 동일)를 쓰고, 현재 진도만 student에서 직접 찾는다.
  const [correctionOpen, setCorrectionOpen] = React.useState(false);
  const [pcMaterialId, setPcMaterialId] = React.useState('');
  const [pcToValue, setPcToValue] = React.useState('');
  const [pcReason, setPcReason] = React.useState('');
  const [pcError, setPcError] = React.useState('');

  const getCurrentProgressOf = React.useCallback((materialId: string, type: 'book' | 'lecture'): number => {
    if (type === 'book') {
      const b = [...(student.books || []), ...(student.subjects || []).flatMap((s) => s.books || [])].find((m) => m.id === materialId);
      return Number(b?.currentPage) || 0;
    }
    const l = [...(student.lectures || []), ...(student.subjects || []).flatMap((s) => s.lectures || [])].find((m) => m.id === materialId);
    return Number(l?.completedLectures) || 0;
  }, [student.books, student.lectures, student.subjects]);

  const resetPcForm = () => {
    setPcMaterialId('');
    setPcToValue('');
    setPcReason('');
    setPcError('');
  };

  const openProgressCorrection = () => {
    setCorrectionOpen(true);
    setTimeout(() => {
      document.getElementById('progress-correction-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const submitProgressCorrection = async () => {
    const mat = editableMaterials.find((m) => m.id === pcMaterialId);
    if (!mat) { setPcError('정정할 자료를 선택해 주세요.'); return; }
    const toValue = Math.round(Number(pcToValue));
    if (!Number.isFinite(toValue) || toValue < 0) { setPcError('정정할 진도 값을 입력해 주세요.'); return; }
    if (mat.total > 0 && toValue > mat.total) { setPcError(`총량(${mat.total})을 넘는 값이에요. 총량이 틀렸다면 '교재·강의 수정'으로 신청해 주세요.`); return; }
    setPcError('');
    const unitLabel = mat.type === 'book' ? (mat.unit || 'p') : '강';
    const fromValue = getCurrentProgressOf(mat.id, mat.type);
    const proposedProgressCorrection: ProposedProgressCorrection = {
      subjectName: mat.subjectName,
      materialType: mat.type,
      materialId: mat.id,
      materialTitle: mat.title,
      fromValue,
      toValue,
      reason: pcReason.trim() || undefined,
    };
    const message = `[진도 숫자 정정] ${mat.subjectName} · ${mat.title} — ${fromValue}${unitLabel} → ${toValue}${unitLabel}`
      + (pcReason.trim() ? `\n사유: ${pcReason.trim()}` : '');
    const ok = await sendRequest('progress', message, undefined, undefined, undefined, undefined, undefined, proposedProgressCorrection);
    if (!ok) return; // 실패 시 입력 보존
    resetPcForm();
    setCorrectionOpen(false);
  };

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
      const ok = await sendRequest('plan', message);
      if (ok) {
        setRealignRequested(true);
        setShowRealignBox(false);
      }
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
    materialAdd: '교재/인강 추가',
    materialEdit: '교재/강의 수정',
    materialDelete: '교재/강의 삭제',
    etc: '기타',
  };

  const getRequestTypeLabel = (type?: string) => REQUEST_TYPE_LABEL[type || 'etc'] || '기타 신청';

  // opens 가 있는 항목은 해당 구조화 폼을 바로 연다(자유서술 폼으로 새지 않게). 없으면 자유서술 프리필.
  const QUICK_REQUESTS: Array<{ type: string; label: string; icon: typeof MessageSquare; message: string; opens?: 'add' | 'edit' | 'delete' | 'correction' }> = [
    { type: 'etc', label: '상담 신청할래요', icon: MessageSquare, message: '상담을 신청합니다.' },
    { type: 'progress', label: '진도가 너무 빨라요', icon: Rabbit, message: '진도가 너무 빨라요. 속도를 조정하고 싶어요.' },
    { type: 'progress', label: '진도가 너무 느려요', icon: Turtle, message: '진도가 너무 느려요. 계획을 조정하고 싶어요.' },
    { type: 'materialAdd', label: '교재·인강 추가', icon: BookPlus, message: '', opens: 'add' },
    { type: 'materialEdit', label: '교재·강의 수정', icon: SquarePen, message: '', opens: 'edit' },
    { type: 'materialDelete', label: '교재·강의 삭제', icon: Trash2, message: '', opens: 'delete' },
    { type: 'plan', label: '학습계획 바꾸고 싶어요', icon: CalendarCog, message: '학습계획 조정을 신청합니다.' },
    { type: 'progress', label: '진도 숫자 정정', icon: Pencil, message: '', opens: 'correction' },
  ];

  // 구조화 교재/인강 추가 폼 열기 + 스크롤(퀵버튼 '교재·인강 추가' 진입점)
  const openMaterialAdd = () => {
    setMaterialAddOpen(true);
    setTimeout(() => {
      document.getElementById('material-add-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // 구조화 교재/강의 삭제 폼 열기 + 스크롤(퀵버튼 '교재·강의 삭제' 진입점)
  const openMaterialDelete = () => {
    setMaterialDeleteOpen(true);
    setTimeout(() => {
      document.getElementById('material-delete-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // 구조화 교재/강의 수정 폼 열기 + 스크롤(퀵버튼 '교재·강의 수정' 진입점)
  const openMaterialEdit = () => {
    setMaterialEditOpen(true);
    setTimeout(() => {
      document.getElementById('material-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleQuickRequest = (type: string, message: string) => {
    setRequestCustomOpen(true);
    setRequestForm((f) => ({
      ...f,
      requestType: type,
      message: message,
      materialId: '',
      goalValue: '',
      targetDate: '',
      studyDays: [],
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
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-white/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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
          <div className="rounded-2xl border border-emerald-200 dark:border-white/10 bg-emerald-50/70 dark:bg-emerald-500/10 px-3.5 py-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
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
                onClick={() => (q.opens === 'add' ? openMaterialAdd() : q.opens === 'edit' ? openMaterialEdit() : q.opens === 'delete' ? openMaterialDelete() : q.opens === 'correction' ? openProgressCorrection() : handleQuickRequest(q.type, q.message))}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2.5 text-left text-[11px] font-bold text-slate-700 dark:text-slate-300 shadow-sm transition hover:border-[#0071E3]/40 hover:bg-[#0071E3]/[0.03] dark:hover:bg-[#0071E3]/15 active:scale-[0.97] disabled:opacity-50"
              >
                {React.createElement(q.icon, { className: 'h-4 w-4 shrink-0 text-[#0071E3]' })}
                <span className="min-w-0 leading-tight">{q.label}</span>
              </button>
            ))}
          </div>

          {/* 교재/인강 직접 추가 신청 — 학생이 자료를 만들어 신청하면 코멘터가 채워서 생성해요 */}
          <button
            type="button"
            onClick={() => setMaterialAddOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#0071E3]/30 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 py-2.5 text-[11px] font-bold text-[#0071E3] transition hover:bg-[#0071E3]/[0.08]"
          >
            <BookPlus className={`w-4 h-4 transition-transform ${materialAddOpen ? 'rotate-12' : ''}`} />
            {materialAddOpen ? '교재/인강 추가 닫기' : '교재/인강 직접 추가하기'}
          </button>

          {materialAddOpen && (
            <form
              id="material-add-form"
              onSubmit={(e) => { e.preventDefault(); if (!requestSubmitting) submitMaterialAdd(); }}
              className="space-y-3 rounded-2xl border border-[#0071E3]/15 bg-white/70 dark:bg-[#1c1c1e]/95 p-3 scroll-mt-28"
            >
              <div className="flex items-start gap-1.5 rounded-xl border border-[#0071E3]/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 p-2.5 text-[10px] font-bold leading-normal text-[#0071E3]">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>강의 수·소요 시간은 몰라도 돼요. 코멘터가 채워서 만들어 드려요.</span>
              </div>

              {/* 과목 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">과목</label>
                {subjectNames.length > 0 && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMaSubjectMode('existing')}
                      className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${maSubjectMode === 'existing' ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      기존 과목
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaSubjectMode('new')}
                      className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${maSubjectMode === 'new' ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      새 과목 직접 입력
                    </button>
                  </div>
                )}
                {maSubjectMode === 'existing' && subjectNames.length > 0 ? (
                  <select
                    value={maForm.subjectName}
                    onChange={(e) => setMaForm((f) => ({ ...f, subjectName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                  >
                    {subjectNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={maForm.newSubjectName}
                    onChange={(e) => { setMaForm((f) => ({ ...f, newSubjectName: e.target.value })); setMaError(''); }}
                    placeholder="예: 한국사"
                    maxLength={50}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                  />
                )}
              </div>

              {/* 유형 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">유형</label>
                <div className="flex gap-1.5">
                  {([['book', '교재'], ['lecture', '인강']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMaForm((f) => ({ ...f, materialType: v }))}
                      className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${maForm.materialType === v ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 자료명/강의명 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{maForm.materialType === 'lecture' ? '강의명' : '자료명'}</label>
                <input
                  type="text"
                  value={maForm.title}
                  onChange={(e) => { setMaForm((f) => ({ ...f, title: e.target.value })); setMaError(''); }}
                  placeholder={maForm.materialType === 'book' ? '예: 기본서 한국사' : '예: 교육학 기본강의'}
                  maxLength={100}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              {/* 인강 오답노트 사용 (#6) — 체크하면 승인 후 오답노트 탭에서 이 인강의 오답을 기록할 수 있어요 */}
              {maForm.materialType === 'lecture' && (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5">
                  <input
                    type="checkbox"
                    checked={maForm.useWrongNotes}
                    onChange={(e) => setMaForm((f) => ({ ...f, useWrongNotes: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#0071E3]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">오답노트 사용</span>
                    <span className="mt-0.5 block break-keep text-[9.5px] font-semibold text-slate-400">체크하면 이 인강도 오답노트 탭에서 오답을 기록할 수 있어요. 나중에 오답노트 탭에서 켜고 끌 수도 있어요.</span>
                  </span>
                </label>
              )}

              {/* 학습 요일 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">학습 요일 <span className="font-medium text-slate-400">(선택)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {MA_DAY_ORDER.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleMaDay(day)}
                      className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold transition ${maForm.studyDays.includes(day) ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      {MA_DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
                <p className="break-keep text-[9.5px] font-semibold text-slate-400">이 자료를 공부할 요일이에요. 고르지 않으면 기본 요일로 자동 설정돼요.</p>
              </div>

              {/* 시간대 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">시간대 <span className="font-medium text-slate-400">(선택)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_TIME_SLOTS.map((slot) => (
                    <button
                      key={slot.key}
                      type="button"
                      onClick={() => setMaForm((f) => ({ ...f, studyTime: f.studyTime === slot.key ? '' : slot.key }))}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${maForm.studyTime === slot.key ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 분량 단위 — 페이지/문제/시간 중 선택(교재형). 인강은 강의 수(강) 고정. */}
              {maForm.materialType === 'book' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">분량 단위</label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MA_UNIT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setMaForm((f) => ({ ...f, unit: opt.key, unitCustom: false }))}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${!maForm.unitCustom && (maForm.unit.trim() || 'p') === opt.key ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMaForm((f) => ({ ...f, unitCustom: true }))}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${maForm.unitCustom ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      직접 입력
                    </button>
                    {maForm.unitCustom && (
                      <input
                        type="text"
                        value={maForm.unit}
                        onChange={(e) => setMaForm((f) => ({ ...f, unit: e.target.value }))}
                        placeholder="예: 회, 장"
                        maxLength={10}
                        className="w-20 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-center text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                      />
                    )}
                  </div>
                  {!maForm.unitCustom && (() => {
                    const sel = MA_UNIT_OPTIONS.find((o) => o.key === (maForm.unit.trim() || 'p'));
                    return sel?.hint ? <p className="break-keep text-[9.5px] font-semibold text-slate-400">{sel.hint}</p> : null;
                  })()}
                </div>
              )}

              {/* 현재 진도 + 총량/단위 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">현재 진도 <span className="font-medium text-slate-400">(선택)</span></label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={maForm.currentProgress}
                      onChange={(e) => setMaForm((f) => ({ ...f, currentProgress: e.target.value }))}
                      placeholder="예: 0"
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{maForm.materialType === 'book' ? (maForm.unit.trim() || 'p') : '강'}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">총량 <span className="font-medium text-slate-400">(선택)</span></label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={maForm.total}
                      onChange={(e) => setMaForm((f) => ({ ...f, total: e.target.value }))}
                      placeholder={maForm.materialType === 'book' && maForm.unit.trim() === '시간' ? '예: 30 (총 몇 시간 분량인지)' : '예: 64강처럼 알면 입력, 몰라도 돼요'}
                      className="w-full min-w-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{maForm.materialType === 'book' ? (maForm.unit.trim() || 'p') : '강'}</span>
                  </div>
                </div>
              </div>

              {/* 학습 계획 (선택) — 총량을 알면 마감일/하루분량 계획을 함께 정할 수 있어요. 모르면 자율로. */}
              <div className="space-y-1.5 rounded-xl border border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 p-2.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">학습 계획 <span className="font-medium text-slate-400">(선택)</span></label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['selfPaced', '자율'], ['deadlineWeeks', '마감일'], ['dailyAmount', '하루 분량']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMaForm((f) => ({ ...f, goalMode: v }))}
                      className={`rounded-xl px-2 py-1.5 text-[10.5px] font-bold transition ${maForm.goalMode === v ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {maForm.goalMode === 'selfPaced' ? (
                  <p className="text-[9.5px] font-semibold text-slate-400">자율은 정해진 마감 없이 그날 한 범위를 기록해요. 총량을 몰라도 추가할 수 있고, 나중에 계획형으로 바꿀 수 있어요.</p>
                ) : !(Number(maForm.total) > 0) ? (
                  <p className="text-[9.5px] font-bold text-amber-600">계획을 정하려면 위 ‘총량’을 먼저 입력해 주세요.</p>
                ) : maForm.goalMode === 'deadlineWeeks' ? (
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-400">시작일</label>
                        <input
                          type="date"
                          value={maForm.goalStartDate}
                          min={kstToday()}
                          onChange={(e) => setMaForm((f) => ({ ...f, goalStartDate: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-400">완료 목표일</label>
                        <input
                          type="date"
                          value={maForm.goalTargetDate}
                          min={maForm.goalStartDate || kstToday()}
                          onChange={(e) => setMaForm((f) => ({ ...f, goalTargetDate: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[9.5px] font-semibold text-slate-400">마감일은 시작일부터 목표일까지 남은 기간에 맞춰 주차 계획을 자동으로 나눠요.</p>
                    {maForm.goalTargetDate && weeksUntilFrom(maForm.goalStartDate, maForm.goalTargetDate) > 0 && (
                      <p className="text-[9.5px] font-bold text-[#0071E3]">약 {weeksUntilFrom(maForm.goalStartDate, maForm.goalTargetDate)}주 안에 완주하는 계획으로 만들어요.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-slate-400">시작일</label>
                    <input
                      type="date"
                      value={maForm.goalStartDate}
                      min={kstToday()}
                      onChange={(e) => setMaForm((f) => ({ ...f, goalStartDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        value={maForm.goalDaily}
                        onChange={(e) => setMaForm((f) => ({ ...f, goalDaily: e.target.value }))}
                        placeholder={maForm.materialType === 'book' ? '예: 5' : '예: 1'}
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{maForm.materialType === 'book' ? (maForm.unit.trim() || 'p') : '강'} / 일</span>
                    </div>
                    <p className="text-[9.5px] font-semibold text-slate-400">하루 분량은 시작일부터 매 학습일에 같은 목표량을 배정하고, 남은 분량에 맞춰 완료일을 자동 계산해요.</p>
                  </div>
                )}
              </div>

              {/* 희망 메모 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">희망 메모 <span className="font-medium text-slate-400">(선택)</span></label>
                <textarea
                  value={maForm.note}
                  onChange={(e) => setMaForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="예: 매일 조금씩 듣고 싶어요"
                  rows={2}
                  maxLength={500}
                  className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                />
              </div>

              {maError && <p className="text-[10px] font-bold text-red-500">{maError}</p>}
              <button
                type="submit"
                disabled={requestSubmitting}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {requestSubmitting ? '신청 중...' : '이 자료 추가 신청하기'}
              </button>
            </form>
          )}

          {/* 기존 교재/강의 수정 신청 — 되돌릴 수 있는 변경이라 추가와 같은 기본(blue) 톤 */}
          <button
            type="button"
            onClick={() => setMaterialEditOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#0071E3]/30 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 py-2.5 text-[11px] font-bold text-[#0071E3] transition hover:bg-[#0071E3]/[0.08]"
          >
            <SquarePen className={`w-4 h-4 transition-transform ${materialEditOpen ? 'rotate-12' : ''}`} />
            {materialEditOpen ? '교재/강의 수정 닫기' : '기존 교재/강의 수정 요청하기'}
          </button>

          {materialEditOpen && (
            <form
              id="material-edit-form"
              onSubmit={(e) => { e.preventDefault(); if (!requestSubmitting) submitMaterialEdit(); }}
              className="space-y-3 rounded-2xl border border-[#0071E3]/15 bg-white/70 dark:bg-[#1c1c1e]/95 p-3 scroll-mt-28"
            >
              <div className="flex items-start gap-1.5 rounded-xl border border-[#0071E3]/10 bg-[#0071E3]/5 dark:bg-[#0071E3]/15 p-2.5 text-[10px] font-bold leading-normal text-[#0071E3]">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-keep">자료를 고르면 지금 값이 그대로 채워져요. 고치고 싶은 칸만 바꿔서 신청하면 코멘터가 확인 후 반영해요.</span>
              </div>

              {/* 수정할 자료 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">수정할 자료</label>
                {editableMaterials.length > 0 ? (
                  <select
                    value={meMaterialId}
                    onChange={(e) => selectEditMaterial(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value="">-- 수정할 교재/인강 선택 --</option>
                    {editableMaterials.map((m) => (
                      <option key={m.id} value={m.id}>{m.subjectName} · {m.title} ({m.type === 'book' ? '교재' : '인강'})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[10px] font-semibold text-slate-400">수정할 수 있는 교재/인강이 없어요.</p>
                )}
              </div>

              {meTarget && (
                <>
                  {/* 자료명 */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">자료명</label>
                    <input
                      type="text"
                      value={meTitle}
                      onChange={(e) => { setMeTitle(e.target.value); setMeError(''); }}
                      maxLength={100}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>

                  {/* 총 분량 + 단위 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">총 분량</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={meTotal}
                          onChange={(e) => { setMeTotal(e.target.value); setMeError(''); }}
                          placeholder="그대로 두려면 안 고쳐도 돼요"
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                        />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{meTarget.type === 'book' ? (meUnit.trim() || 'p') : '강'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 분량 단위 — 페이지/문제/시간 칩 선택(교재형). 기존 회·장 등은 직접 입력으로 프리필. */}
                  {meTarget.type === 'book' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">분량 단위 <span className="font-medium text-slate-400">(선택)</span></label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {MA_UNIT_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => { setMeUnit(opt.key); setMeUnitCustom(false); setMeError(''); }}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${!meUnitCustom && (meUnit.trim() || 'p') === opt.key ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setMeUnitCustom(true); setMeError(''); }}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${meUnitCustom ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                        >
                          직접 입력
                        </button>
                        {meUnitCustom && (
                          <input
                            type="text"
                            value={meUnit}
                            onChange={(e) => { setMeUnit(e.target.value); setMeError(''); }}
                            placeholder="예: 회, 장"
                            maxLength={10}
                            className="w-20 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-center text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                          />
                        )}
                      </div>
                      {!meUnitCustom && (() => {
                        const sel = MA_UNIT_OPTIONS.find((o) => o.key === (meUnit.trim() || 'p'));
                        return sel?.hint ? <p className="break-keep text-[9.5px] font-semibold text-slate-400">{sel.hint}</p> : null;
                      })()}
                    </div>
                  )}

                  {/* 학습 요일 */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">학습 요일</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MA_DAY_ORDER.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => { toggleMeDay(day); setMeError(''); }}
                          className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold transition ${meStudyDays.includes(day) ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                        >
                          {MA_DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                    <p className="break-keep text-[9.5px] font-semibold text-slate-400">전부 끄면 요일은 그대로 둬요.</p>
                  </div>

                  {/* 시간대 */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">시간대</label>
                    <div className="flex flex-wrap gap-1.5">
                      {STUDY_TIME_SLOTS.map((slot) => (
                        <button
                          key={slot.key}
                          type="button"
                          onClick={() => { setMeStudyTime((v) => (v === slot.key ? '' : slot.key)); setMeTimeTouched(true); setMeError(''); }}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${meStudyTime === slot.key ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                    {!meTimeIsBlock && meTarget.studyTime && !meTimeTouched && (
                      <p className="break-keep text-[9.5px] font-semibold text-slate-400">지금은 특정 교시로 지정돼 있어요. 시간대를 새로 고르면 그 교시 대신 반영해 달라고 신청돼요.</p>
                    )}
                    {meTimeTouched && !meStudyTime && (
                      <p className="break-keep text-[9.5px] font-bold text-amber-600 dark:text-amber-400">아무것도 안 고르면 교시를 정하지 말아 달라는 신청이 돼요. 그날 비어 있는 교시에 자동으로 들어가요.</p>
                    )}
                  </div>

                  {/* 사유 */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">사유 <span className="font-medium text-slate-400">(선택)</span></label>
                    <textarea
                      value={meReason}
                      onChange={(e) => setMeReason(e.target.value)}
                      placeholder="예: 강의 수가 실제와 달라요"
                      rows={2}
                      maxLength={300}
                      className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                    />
                  </div>
                </>
              )}

              {meError && <p className="text-[10px] font-bold text-red-500">{meError}</p>}
              <button
                type="submit"
                disabled={requestSubmitting || !meTarget}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {requestSubmitting ? '신청 중...' : '이 자료 수정 신청하기'}
              </button>
            </form>
          )}

          {/* 교재/강의(또는 과목 전체) 삭제 신청 — 파괴적 작업이라 색을 위험(red) 톤으로 구분 */}
          <button
            type="button"
            onClick={() => setMaterialDeleteOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-red-300/60 dark:border-red-500/25 bg-red-50/60 dark:bg-red-500/10 py-2.5 text-[11px] font-bold text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-500/15"
          >
            <Trash2 className={`w-4 h-4 transition-transform ${materialDeleteOpen ? 'rotate-12' : ''}`} />
            {materialDeleteOpen ? '교재/강의 삭제 닫기' : '필요없는 교재/강의 삭제하기'}
          </button>

          {materialDeleteOpen && (
            <form
              id="material-delete-form"
              onSubmit={(e) => { e.preventDefault(); if (!requestSubmitting) submitMaterialDelete(); }}
              className="space-y-3 rounded-2xl border border-red-200 dark:border-red-500/25 bg-white/70 dark:bg-[#1c1c1e]/95 p-3 scroll-mt-28"
            >
              <div className="flex items-start gap-1.5 rounded-xl border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 p-2.5 text-[10px] font-bold leading-normal text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>삭제하면 지금까지 쌓인 진도 기록도 함께 사라져요. 되돌릴 수 없어요.</span>
              </div>

              {/* 삭제 범위 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">삭제 범위</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setMdScope('material'); setMdError(''); }}
                    className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${mdScope === 'material' ? 'bg-red-600 text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                  >
                    자료 하나만
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMdScope('subject'); setMdError(''); }}
                    className={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${mdScope === 'subject' ? 'bg-red-600 text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                  >
                    과목 전체
                  </button>
                </div>
              </div>

              {mdScope === 'material' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">삭제할 자료</label>
                  {deletableMaterials.length > 0 ? (
                    <select
                      value={mdMaterialId}
                      onChange={(e) => { setMdMaterialId(e.target.value); setMdError(''); }}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-red-400 focus:outline-none"
                    >
                      <option value="">-- 삭제할 교재/인강 선택 --</option>
                      {deletableMaterials.map((m) => (
                        <option key={m.id} value={m.id}>{m.subjectName} · {m.title} ({m.type === 'book' ? '교재' : '인강'})</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] font-semibold text-slate-400">삭제할 수 있는 교재/인강이 없어요.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">삭제할 과목</label>
                  {deletableSubjects.length > 0 ? (
                    <select
                      value={mdSubjectId}
                      onChange={(e) => { setMdSubjectId(e.target.value); setMdError(''); }}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-red-400 focus:outline-none"
                    >
                      <option value="">-- 삭제할 과목 선택 --</option>
                      {deletableSubjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} (교재 {s.bookCount}개 · 인강 {s.lectureCount}개)</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] font-semibold text-slate-400">삭제할 수 있는 과목이 없어요.</p>
                  )}
                  {mdSubjectId && (
                    <p className="text-[9.5px] font-bold text-red-500">이 과목에 속한 교재/인강이 전부 함께 삭제돼요.</p>
                  )}
                </div>
              )}

              {/* 사유 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">사유 <span className="font-medium text-slate-400">(선택)</span></label>
                <textarea
                  value={mdReason}
                  onChange={(e) => setMdReason(e.target.value)}
                  placeholder="예: 더 이상 필요 없는 자료예요"
                  rows={2}
                  maxLength={300}
                  className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-red-400 focus:outline-none"
                />
              </div>

              {mdError && <p className="text-[10px] font-bold text-red-500">{mdError}</p>}
              <button
                type="submit"
                disabled={requestSubmitting}
                className="w-full rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
              >
                {requestSubmitting ? '신청 중...' : '삭제 신청하기'}
              </button>
            </form>
          )}

          {/* 진도 숫자 정정 신청 — 자료·정정값 구조화. 승인 시 코멘터 수작업 없이 진도가 자동 반영된다. */}
          {correctionOpen && (
            <form
              id="progress-correction-form"
              onSubmit={(e) => { e.preventDefault(); if (!requestSubmitting) submitProgressCorrection(); }}
              className="space-y-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#1c1c1e]/95 p-3 scroll-mt-28"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">진도 숫자 정정 신청</p>
                <button type="button" onClick={() => { resetPcForm(); setCorrectionOpen(false); }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">닫기</button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">정정할 자료</label>
                {editableMaterials.length > 0 ? (
                  <select
                    value={pcMaterialId}
                    onChange={(e) => { setPcMaterialId(e.target.value); setPcError(''); }}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                  >
                    <option value="">-- 정정할 교재/인강 선택 --</option>
                    {editableMaterials.map((m) => (
                      <option key={m.id} value={m.id}>{m.subjectName} · {m.title} ({m.type === 'book' ? '교재' : '인강'})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[10px] font-semibold text-slate-400">정정할 수 있는 교재/인강이 없어요.</p>
                )}
              </div>
              {(() => {
                const mat = editableMaterials.find((m) => m.id === pcMaterialId);
                if (!mat) return null;
                const unitLabel = mat.type === 'book' ? (mat.unit || 'p') : '강';
                const cur = getCurrentProgressOf(mat.id, mat.type);
                return (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      정정할 진도 <span className="font-medium text-slate-400">(현재 {cur}{unitLabel}{mat.total > 0 ? ` / 총 ${mat.total}${unitLabel}` : ''})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={pcToValue}
                        onChange={(e) => { setPcToValue(e.target.value); setPcError(''); }}
                        placeholder={`예: ${cur}`}
                        className="w-28 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                      />
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{unitLabel}까지 한 걸로</span>
                    </div>
                    <p className="text-[9.5px] font-semibold text-slate-400 dark:text-slate-500 break-keep">잘못 입력한 누적 위치를 실제 위치로 바로잡아요. 코멘터 승인 후 자동 반영돼요.</p>
                  </div>
                );
              })()}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">사유 <span className="font-medium text-slate-400">(선택)</span></label>
                <textarea
                  value={pcReason}
                  onChange={(e) => setPcReason(e.target.value)}
                  placeholder="예: 실수로 30까지 입력했는데 실제로는 25까지 했어요"
                  rows={2}
                  maxLength={300}
                  className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none"
                />
              </div>
              {pcError && <p className="text-[10px] font-bold text-red-500">{pcError}</p>}
              <button
                type="submit"
                disabled={requestSubmitting}
                className="w-full rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98] disabled:opacity-50"
              >
                {requestSubmitting ? '신청 중...' : '진도 정정 신청하기'}
              </button>
            </form>
          )}

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
                const isPlanEdit = (requestForm.requestType === 'plan' || requestForm.requestType === 'progress') && !!requestForm.materialId;
                // 마감일 지정 모드: 시작일+날짜 → 주수. 목표일이 시작일 이전/미입력이면 막는다.
                const deadlineWeeks = requestForm.goalType === 'deadlineWeeks' && requestForm.targetDate
                  ? weeksUntilFrom(requestForm.planStartDate || kstToday(), requestForm.targetDate)
                  : 0;
                if (isPlanEdit && requestForm.goalType === 'deadlineWeeks' && requestForm.targetDate && deadlineWeeks === 0) {
                  setValidationError('목표 완료일은 시작일 이후 날짜로 골라 주세요.');
                  return;
                }
                if (isPlanEdit && !requestForm.planStartDate) {
                  setValidationError('계획 시작일을 골라 주세요.');
                  return;
                }
                // 학습계획 변경(plan)은 구체적인 목표가 있어야 신청 — 빈 값(0) 신청으로 관리자에게 의미 없는 제안이 가는 것 방지.
                if (isPlanEdit && requestForm.requestType === 'plan') {
                  if (requestForm.goalType === 'deadlineWeeks' && !requestForm.targetDate) {
                    setValidationError('목표 완료일을 골라 주세요.');
                    return;
                  }
                  if (requestForm.goalType === 'dailyAmount' && !(Number(requestForm.goalValue) > 0)) {
                    setValidationError('하루 학습량을 입력해 주세요.');
                    return;
                  }
                }
                setValidationError('');
                let proposedGoal: ProposedGoal | undefined = undefined;
                if (isPlanEdit) {
                  const goalValue = requestForm.goalType === 'deadlineWeeks'
                    ? deadlineWeeks
                    : (requestForm.goalValue ? Number(requestForm.goalValue) : 0);
                  proposedGoal = {
                    materialId: requestForm.materialId,
                    materialType: requestForm.materialType,
                    goalType: requestForm.goalType,
                    goalValue,
                    planStartDate: requestForm.planStartDate || undefined,
                    targetDate: requestForm.goalType === 'deadlineWeeks' && requestForm.targetDate ? requestForm.targetDate : undefined,
                    studyDays: requestForm.studyDays.length > 0 ? requestForm.studyDays : undefined,
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
                        const found = findMaterialById(selectedId);
                        const isBook = found?.kind === 'book';
                        const material: any = found?.mat;
                        setRequestForm((f) => ({
                          ...f,
                          materialId: selectedId,
                          materialType: isBook ? 'book' : 'lecture',
                          goalType: material?.goalType === 'dailyAmount' ? 'dailyAmount' : 'deadlineWeeks',
                          goalValue: material?.goalType === 'dailyAmount' && material?.goalValue ? String(material.goalValue) : '',
                          planStartDate: kstToday(),
                          targetDate: material?.targetDate || '',
                          studyDays: (Array.isArray(material?.studyDays) ? material.studyDays : []) as MaDay[],
                          currentProgress: material
                            ? String(isBook ? (material.currentPage || 0) : (material.completedLectures || 0))
                            : '',
                          speedMultiplier: !isBook && material?.speedMultiplier ? String(material.speedMultiplier) : '1.0',
                          currentGoalSnapshot: material ? {
                            goalType: material.goalType,
                            goalValue: material.goalValue,
                            speedMultiplier: !isBook ? material?.speedMultiplier : undefined,
                          } : null,
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-material-select"
                    >
                      <option value="">-- 변경할 교재/인강 선택 --</option>
                      {requestBooks.length > 0 && (
                        <optgroup label="교재 목록">
                          {requestBooks.map(b => (
                            <option key={b.id} value={b.id}>{b.title}</option>
                          ))}
                        </optgroup>
                      )}
                      {requestLectures.length > 0 && (
                        <optgroup label="인강 목록">
                          {requestLectures.map(l => (
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
                          <span>{requestForm.currentGoalSnapshot.goalType === 'weeks' ? '목표 기간' : requestForm.currentGoalSnapshot.goalType === 'deadlineWeeks' ? '기간 목표' : requestForm.currentGoalSnapshot.goalType === 'weeklyAmount' ? '주간 학습량' : '일일 학습량'} {requestForm.currentGoalSnapshot.goalValue}{requestForm.currentGoalSnapshot.goalType === 'weeks' || requestForm.currentGoalSnapshot.goalType === 'deadlineWeeks' ? '주' : requestFormUnit}</span>
                          {requestForm.currentGoalSnapshot.speedMultiplier && requestForm.currentGoalSnapshot.speedMultiplier !== 1.0 && (
                            <span>· {requestForm.currentGoalSnapshot.speedMultiplier}배속</span>
                          )}
                          <span className="text-slate-400">→ 아래에서 변경할 값을 입력하세요</span>
                        </div>
                      ) : null}
                      {/* 목표 방식: 마감일 지정(날짜) / 하루 정해진 분량 — 학생이 원하는 방식으로 계획을 지정 */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">어떻게 끝낼까요?</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([['deadlineWeeks', '마감일까지'], ['dailyAmount', '하루 정해진 분량']] as const).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setRequestForm((f) => ({ ...f, goalType: v }))}
                              className={`rounded-xl px-2.5 py-2 text-[11px] font-bold transition ${requestForm.goalType === v ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9.5px] font-semibold text-slate-400">마감일까지는 시작일과 완료 목표일 사이를 주차별로 나누고, 하루 정해진 분량은 시작일부터 매 학습일 같은 분량을 배정해요.</p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">계획 시작일</label>
                        <input
                          type="date"
                          value={requestForm.planStartDate}
                          min={kstToday()}
                          onChange={(e) => setRequestForm((f) => ({ ...f, planStartDate: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-start-date-input"
                        />
                      </div>

                      {requestForm.goalType === 'deadlineWeeks' ? (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">언제까지 끝낼까요? (목표 완료일)</label>
                          <input
                            type="date"
                            value={requestForm.targetDate}
                            min={requestForm.planStartDate || kstToday()}
                            onChange={(e) => setRequestForm((f) => ({ ...f, targetDate: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-target-date-input"
                          />
                          {requestForm.targetDate && (
                            weeksUntilFrom(requestForm.planStartDate || kstToday(), requestForm.targetDate) > 0 ? (
                              <p className="text-[10px] font-bold text-[#0071E3]">약 {weeksUntilFrom(requestForm.planStartDate || kstToday(), requestForm.targetDate)}주 안에 완주하는 계획으로 신청돼요{weeksUntilFrom(requestForm.planStartDate || kstToday(), requestForm.targetDate) === 12 && requestForm.targetDate ? ' (최대 12주)' : ''}.</p>
                            ) : (
                              <p className="text-[10px] font-bold text-red-500">시작일 이후 날짜를 골라 주세요.</p>
                            )
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">하루에 얼마씩 할까요?</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={requestForm.goalValue}
                              onChange={(e) => setRequestForm((f) => ({ ...f, goalValue: e.target.value }))}
                              placeholder={requestForm.materialType === 'book' ? '예: 5' : '예: 1'}
                              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none request-goal-value-input"
                            />
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              {requestFormUnit} / 일
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 학습 요일 — 예: 주말 제외. 미선택 시 현재 설정 유지 */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">학습 요일 <span className="font-medium text-slate-400">(선택)</span></label>
                          <button
                            type="button"
                            onClick={() => setRequestForm((f) => ({ ...f, studyDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }))}
                            className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-0.5 text-[9.5px] font-bold text-slate-500 dark:text-slate-400 transition hover:border-[#0071E3]/40 hover:text-[#0071E3]"
                          >
                            주말 제외(월~금)
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {MA_DAY_ORDER.map((day) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => setRequestForm((f) => ({
                                ...f,
                                studyDays: f.studyDays.includes(day) ? f.studyDays.filter((d) => d !== day) : [...f.studyDays, day],
                              }))}
                              className={`grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold transition ${requestForm.studyDays.includes(day) ? 'bg-[#0071E3] text-white' : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400'}`}
                            >
                              {MA_DAY_LABELS[day]}
                            </button>
                          ))}
                        </div>
                        <p className="break-keep text-[9.5px] font-semibold text-slate-400">이 자료를 공부할 요일이에요. 선택하지 않으면 지금 요일 설정이 그대로 유지돼요.</p>
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
                                {requestFormUnit}
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
