'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Student, BookProgress, LectureProgress, ConsultationLog, GradeItem, SubjectProgress, SharedMaterial, DetailedPlan, ReviewPassSetting, LeaveRequest, AwaySchedule } from '@/lib/types/student';
import { getStudentTodayTotalStudyTimeMin, generateDetailedPlans as generateDetailedPlansLib } from '@/lib/progress-plan';
import { getGradeChartData, getGradeSubjects } from '@/lib/grade-chart';
import { buildMaterialBenchmarks } from '@/lib/material-benchmark';
import { getStudyTimeSlot } from '@/lib/academy-timetable';
import { getPendingChangeRequests, getPendingSuggestions, getRequestTypeLabel } from '@/lib/student-requests';
import { LEAVE_TYPES, getLeaveTypeLabel } from '@/lib/leave';
import { getDailyChecklist, getPomodoroStats, getPomodoroStatsFromStudent, getSeoulDateKey } from '@/lib/student-activity';
import { toast } from 'sonner';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import {
  Calendar, User,
  BookOpen, MessageSquare, Award, Printer, Loader2, Save,
  ArrowLeft, Home, ChevronDown, ChevronUp, History, Shield, AlertCircle, X,
  CalendarDays, Plus, Trash2, Send
} from 'lucide-react';
import { GradesTab } from '@/components/admin/detail-tabs/grades-tab';
import { InfoTab } from '@/components/admin/detail-tabs/info-tab';
import { ProgressTab } from '@/components/admin/detail-tabs/progress-tab';
import { ConsultTab } from '@/components/admin/detail-tabs/consult-tab';
import { PenaltyTab } from '@/components/admin/detail-tabs/penalty-tab';
import { DetailSheetProvider, type QuickPlanPreviewItem } from '@/components/admin/detail-tabs/detail-sheet-context';

interface StudentDetailSheetProps {
  student: Student | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedStudent: Student) => void;
  onDelete: (studentId: string) => void;
  students?: Student[];
  defaultTab?: string;
}

function normalizeSmsTargetsForState(value: Student['smsTargets']): Array<'parent' | 'student'> {
  return Array.isArray(value) ? value : ['parent'];
}

type TodayAttendanceStatus = {
  configured: boolean;
  today?: string;
  status: 'present' | 'left' | 'absent' | 'unconfigured' | 'unknown';
  checkInAt?: string;
  checkOutAt?: string | null;
  minutes?: number | null;
  minutesSoFar?: number;
  autoClosed?: boolean;
};

const parseProgressFromConsultationContent = (
  content: string,
  subjectsState: SubjectProgress[],
  currentDrafts: Record<string, number>
): Record<string, number> => {
  const nextDrafts = { ...currentDrafts };
  if (!content) return nextDrafts;
  const lines = content.split('\n');
  let inSummarySection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.includes('[현재 학습상황 요약]')) {
      inSummarySection = true;
      continue;
    }
    if (inSummarySection && line.startsWith('[') && !line.includes('현재 학습상황 요약')) {
      inSummarySection = false;
    }

    if (!inSummarySection) continue;

    const subjectMatch = line.match(/^-\s*([^:]+):\s*(.*)$/);
    if (!subjectMatch) continue;

    const subjectName = subjectMatch[1].trim();
    const contentBody = subjectMatch[2].trim();

    if (
      contentBody === '등록된 교재·강의 없음' ||
      contentBody === '등록된 과목이 없습니다.' ||
      contentBody === '등록된 시간표가 없습니다.'
    ) {
      continue;
    }

    const materialsRaw = contentBody.split(/\s+[\/\uFF0F]\s+/);
    const subject = subjectsState.find((s) => s.name === subjectName);
    if (!subject) continue;

    for (const matRaw of materialsRaw) {
      const trimMat = matRaw.trim();
      if (!trimMat) continue;

      const match = trimMat.match(/^(.+?)\s+(\d+)\s*[\/\uFF0F]\s*(\d+)\s*([^\s(]+)?(?:\s*\(\s*\d+%\s*\))?$/);
      if (!match) continue;

      const title = match[1].trim();
      const currentVal = parseInt(match[2], 10);
      const cleanTitle = title.replace(/\s+/g, '').toLowerCase();

      const matchedBook = subject.books?.find((b) => {
        const cleanBookTitle = b.title.replace(/\s+/g, '').toLowerCase();
        return cleanBookTitle === cleanTitle || cleanBookTitle.includes(cleanTitle) || cleanTitle.includes(cleanBookTitle);
      });

      if (matchedBook) {
        nextDrafts[matchedBook.id] = currentVal;
        continue;
      }

      const matchedLecture = subject.lectures?.find((l) => {
        const cleanLectureName = l.name.replace(/\s+/g, '').toLowerCase();
        return cleanLectureName === cleanTitle || cleanLectureName.includes(cleanTitle) || cleanTitle.includes(cleanLectureName);
      });

      if (matchedLecture) {
        nextDrafts[matchedLecture.id] = currentVal;
      }
    }
  }

  return nextDrafts;
};


// specialNote 컬럼은 학생 리워드/뽀모도로 JSON 상태({ noteText, pomodoro_*, rewards_log, daily_checklist })와
// 어드민 내부 메모를 함께 담는다. 어드민 메모 textarea 는 noteText 만 편집해야 하며, 저장 시 나머지 JSON 봉투를
// 보존해야 한다(과거: 메모 저장이 학생 리워드/뽀모도로 상태를 통째로 덮어쓰던 데이터 손실 버그).
function extractAdminNote(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') return typeof obj.noteText === 'string' ? obj.noteText : '';
    } catch { /* JSON 아님 → 평문 메모로 취급 */ }
  }
  return raw;
}

function mergeAdminNote(raw: string | undefined, noteText: string): string {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        return JSON.stringify({ ...obj, noteText });
      }
    } catch { /* JSON 아님 → 평문으로 저장 */ }
  }
  return noteText;
}

interface QuickAwayEntry {
  lineNo: number;
  name: string;
  nameKey: string;
  awayTime: string;
  returnTime?: string;
}

interface QuickAwayApplyResult {
  applied: number;
  skippedNoMatch: number;
  skippedDuplicateName: number;
  skippedInvalid: number;
  skippedDuplicateSchedule: number;
  failed: number;
}

function normalizeQuickAwayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function formatQuickAwayTime(hour: number, minute: number): string {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '';
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isCheckoutReturnValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || ['-', 'x', '하원', '퇴실', '미복귀', '없음', '없슴'].includes(normalized);
}

function normalizeQuickAwayTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || isCheckoutReturnValue(trimmed)) return '';

  const koreanMatch = trimmed.match(/^(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?$/);
  if (koreanMatch) {
    return formatQuickAwayTime(Number(koreanMatch[1]), Number(koreanMatch[2] || 0));
  }

  const colonMatch = trimmed.match(/^(\d{1,2})[:：](\d{1,2})$/);
  if (colonMatch) {
    return formatQuickAwayTime(Number(colonMatch[1]), Number(colonMatch[2]));
  }

  if (/^\d{3,4}$/.test(trimmed)) {
    const hour = trimmed.length === 3 ? Number(trimmed.slice(0, 1)) : Number(trimmed.slice(0, 2));
    const minute = Number(trimmed.slice(-2));
    return formatQuickAwayTime(hour, minute);
  }

  if (/^\d{1,2}$/.test(trimmed)) {
    return formatQuickAwayTime(Number(trimmed), 0);
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (numeric > 0 && numeric < 24 && trimmed.includes('.')) {
      const hour = Math.floor(numeric);
      const minute = Math.round((numeric - hour) * 60);
      return formatQuickAwayTime(hour, minute);
    }
    const fraction = numeric - Math.floor(numeric);
    if (fraction > 0) {
      const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
      return formatQuickAwayTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
    }
  }

  return '';
}

function splitQuickAwayLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(',')) return line.split(',');
  return line.trim().split(/\s+/);
}

function parseQuickAwayInput(text: string): { entries: QuickAwayEntry[]; invalidCount: number } {
  const entries: QuickAwayEntry[] = [];
  let invalidCount = 0;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const columns = splitQuickAwayLine(rawLine);
    const rawName = (columns[0] ?? '').trim();
    const rawAwayTime = (columns[1] ?? '').trim();
    const rawReturnTime = (columns[2] ?? '').trim();

    if (rawName.includes('이름') && (rawAwayTime.includes('나가') || rawAwayTime.includes('외출'))) return;
    if (!rawName || !rawAwayTime) {
      invalidCount += 1;
      return;
    }

    const awayTime = normalizeQuickAwayTime(rawAwayTime);
    if (!awayTime) {
      invalidCount += 1;
      return;
    }

    const returnTime = rawReturnTime ? normalizeQuickAwayTime(rawReturnTime) : '';
    if (rawReturnTime && !returnTime && !isCheckoutReturnValue(rawReturnTime)) {
      invalidCount += 1;
      return;
    }

    const name = normalizeQuickAwayName(rawName);
    entries.push({
      lineNo: index + 1,
      name,
      nameKey: name,
      awayTime,
      returnTime: returnTime || undefined,
    });
  });

  return { entries, invalidCount };
}

function isSameAwaySchedule(a: AwaySchedule, b: AwaySchedule): boolean {
  return a.awayTime === b.awayTime
    && (a.returnTime || '') === (b.returnTime || '')
    && JSON.stringify(a.days || []) === JSON.stringify(b.days || [])
    && (a.until || 'forever') === (b.until || 'forever');
}

export function StudentDetailSheet({ student, isOpen, onClose, onUpdate, onDelete, students = [], defaultTab }: StudentDetailSheetProps) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isApplyingQuickPlan, setIsApplyingQuickPlan] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isLearningInputOpen, setIsLearningInputOpen] = useState(false);
  const [learningInputMode, setLearningInputMode] = useState<'quick' | 'material' | null>(null);
  const [activeTab, setActiveTab] = useState('progress');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab || 'progress');
    }
  }, [isOpen, defaultTab, student?.id]);
  const [resolvedReqIds, setResolvedReqIds] = useState<string[]>([]);
  const [resolvingReqId, setResolvingReqId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sentReplies, setSentReplies] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
  // 출결/순공 통계 + 휴가 신청 관련 상태
  const [studyStats, setStudyStats] = useState<any>(null);
  const [todayAttendanceStatus, setTodayAttendanceStatus] = useState<TodayAttendanceStatus | null>(null);
  const [leaveRequestsLocal, setLeaveRequestsLocal] = useState<LeaveRequest[]>([]);
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAlertDismissed(false);
    }
  }, [isOpen, student?.id]);

  // ── 미승인 조기 하원 여부 실시간 계산 ───────────────────────────────
  const unauthorizedCheckoutText = useMemo(() => {
    if (!student || !todayAttendanceStatus || todayAttendanceStatus.status !== 'left') return null;
    const today = todayAttendanceStatus.today || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const checkOutTimeStr = todayAttendanceStatus.checkOutAt; // "HH:MM"
    if (!checkOutTimeStr) return null;
    
    const checkOutMin = timeStringToMin(checkOutTimeStr);
    
    // 현재 KST 시각
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
    const nowDateStr = kstDate.toISOString().split('T')[0];
    const nowMin = kstDate.getHours() * 60 + kstDate.getMinutes();

    const todayDow = new Date(today + 'T00:00:00').getDay();
    const awayIntervals = getApplicableAwayIntervals(student, today, todayDow);

    const isUnauth = checkUnauthorizedCheckout(
      student,
      true,
      checkOutMin,
      today,
      nowDateStr,
      nowMin,
      awayIntervals
    );

    if (isUnauth) {
      return `오늘(${today}) ${checkOutTimeStr}에 조기 하원 처리되었으나 승인된 휴가, 반차 또는 정기외출 기록이 없습니다. (미승인 조기 하원)`;
    }
    return null;
  }, [student, todayAttendanceStatus]);
  const [leaveCouponsLocal, setLeaveCouponsLocal] = useState(0);
  const [leaveActionBusy, setLeaveActionBusy] = useState<Record<string, boolean>>({});
  const [leaveReplyDrafts, setLeaveReplyDrafts] = useState<Record<string, string>>({});

  // 기본 정보 상태
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [campus, setCampus] = useState('');
  const [manager, setManager] = useState('');
  const [contact, setContact] = useState('');
  const [lifeComment, setLifeComment] = useState('');
  const [studentLifeComment, setStudentLifeComment] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [nextConsultationDate, setNextConsultationDate] = useState('');
  const [enrollmentEndDate, setEnrollmentEndDate] = useState('');
  const [weeklyGradeCheck, setWeeklyGradeCheck] = useState(false);
  const [seatNumber, setSeatNumber] = useState('');
  const [awaySchedules, setAwaySchedules] = useState<AwaySchedule[]>([]);
  const [studentDdays, setStudentDdays] = useState<Array<{id: string; title: string; date: string; createdAt: string}>>([]);
  const [ddayAdminTitle, setDdayAdminTitle] = useState('');
  const [ddayAdminDate, setDdayAdminDate] = useState('');
  const [ddayAdminAdding, setDdayAdminAdding] = useState(false);
  const [shareToken, setShareToken] = useState<string | undefined>(undefined);
  const [shareTokenExpiresAt, setShareTokenExpiresAt] = useState<string | undefined>(undefined);
  const [sharePassword, setSharePassword] = useState<string | undefined>(undefined);

  const [parentPhone, setParentPhone] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [smsTargets, setSmsTargets] = useState<Array<'parent' | 'student'>>(['parent']);

  // 등록된 기존 원생들의 목표시험 목록 중복제거 추출
  const uniqueExams = Array.from(
    new Set(
      students
        .map(s => s.contact)
        .filter((exam): exam is string => typeof exam === 'string' && exam.trim() !== '')
    )
  );

  // 신규 과목 관련 상태
  const [subjectsState, setSubjectsState] = useState<SubjectProgress[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [editingGoals, setEditingGoals] = useState<Record<string, string>>({});

  // 교재/인강 추가용 임시 상태 (과목별로 관리하기 위해 Record 객체 활용)
  const [newBookTitle, setNewBookTitle] = useState<Record<string, string>>({});
  const [newBookTotal, setNewBookTotal] = useState<Record<string, number>>({});
  const [newBookPublisher, setNewBookPublisher] = useState<Record<string, string>>({});
  const [newBookAuthor, setNewBookAuthor] = useState<Record<string, string>>({});
  const [newLectureName, setNewLectureName] = useState<Record<string, string>>({});
  const [newLectureTotal, setNewLectureTotal] = useState<Record<string, number>>({});
  const [newLectureAuthor, setNewLectureAuthor] = useState<Record<string, string>>({});

  // 목표 완료 날짜 관리 상태 (교재/강의 ID별)
  const [materialTargetDates, setMaterialTargetDates] = useState<Record<string, string>>({});
  // 주간 계획 수동 수정을 위한 텍스트 관리 상태
  const [weeklyPlanRanges, setWeeklyPlanRanges] = useState<Record<string, string>>({});
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});

  // 디바운스 자동저장 타이머 & 최신 상태 Ref 관리
  const debounceTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const studentRef = useRef<Student | null>(null);
  const subjectsStateRef = useRef<SubjectProgress[]>([]);

  // 실시간 타이핑 시 서버 호출로 인한 버벅임을 막기 위한 Ref 들
  const nameRef = useRef(name);
  const campusRef = useRef(campus);
  const managerRef = useRef(manager);
  const contactRef = useRef(contact);
  const lifeCommentRef = useRef(lifeComment);
  const studentLifeCommentRef = useRef(studentLifeComment);
  const specialNoteRef = useRef(specialNote);
  const nextConsultationDateRef = useRef(nextConsultationDate);

  // 드롭다운 클릭 아웃사이드 관리를 위한 Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const integratedSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { campusRef.current = campus; }, [campus]);
  useEffect(() => { managerRef.current = manager; }, [manager]);
  useEffect(() => { contactRef.current = contact; }, [contact]);
  useEffect(() => { lifeCommentRef.current = lifeComment; }, [lifeComment]);
  useEffect(() => { studentLifeCommentRef.current = studentLifeComment; }, [studentLifeComment]);
  useEffect(() => { specialNoteRef.current = specialNote; }, [specialNote]);
  useEffect(() => { nextConsultationDateRef.current = nextConsultationDate; }, [nextConsultationDate]);

  useEffect(() => {
    studentRef.current = student;
  }, [student]);

  useEffect(() => {
    subjectsStateRef.current = subjectsState;
  }, [subjectsState]);

  // 공유 DB 자동완성 클릭 아웃사이드 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowIntegratedSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (integratedSearchTimerRef.current) {
        clearTimeout(integratedSearchTimerRef.current);
      }
      Object.values(debounceTimersRef.current).forEach(clearTimeout);
      debounceTimersRef.current = {};
    };
  }, []);



  // 교재/인강 인라인 편집 상태
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingMaterialTitle, setEditingMaterialTitle] = useState('');
  const [editingMaterialTotal, setEditingMaterialTotal] = useState(0);

  // 공유 DB 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SharedMaterial[]>([]);
  const [searchingSubjectId, setSearchingSubjectId] = useState<string | null>(null);
  const [searchingType, setSearchingType] = useState<'book' | 'lecture' | null>(null);
  const [isSearchingShared, setIsSearchingShared] = useState(false);
  const [hasSearchedShared, setHasSearchedShared] = useState(false);

  // 상담 작성 상태
  const [cslDate, setCslDate] = useState('');
  const [cslManager, setCslManager] = useState('');
  const [cslContent, setCslContent] = useState('');
  const [cslNextDate, setCslNextDate] = useState('');
  const [consultationPlanModes, setConsultationPlanModes] = useState<Record<string, 'keepTargetDate' | 'keepPace'>>({});
  const [isConsultationPlanDirty, setIsConsultationPlanDirty] = useState(false);
  const [selectedConsultationPlanItems, setSelectedConsultationPlanItems] = useState<Record<string, boolean>>({});
  const [lastSavedConsultationContent, setLastSavedConsultationContent] = useState('');
  const [quickPlanText, setQuickPlanText] = useState('');
  const [debouncedQuickPlanText, setDebouncedQuickPlanText] = useState('');
  const initializedConsultationStudentIdRef = useRef<string | null>(null);
  const cslContentRef = useRef('');
  const afterCloseActionRef = useRef<(() => void) | null>(null);
  // 자동 저장(프로필/과목 구조) 타이머 & 중복 실행 방지 플래그
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const [isConsultationDraftDirty, setIsConsultationDraftDirty] = useState(false);

  // 과목 카드 아코디언 상태
  const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});
  
  // 통합 등록 폼 및 동적 카테고리 상태
  const [newMaterialType, setNewMaterialType] = useState<'book' | 'lecture'>('book');
  const [newMaterialSubject, setNewMaterialSubject] = useState('');
  const [newMaterialTitle, setNewMaterialTitle] = useState('');
  const [newMaterialTotal, setNewMaterialTotal] = useState<number | ''>('');
  const [newMaterialPublisher, setNewMaterialPublisher] = useState('');
  const [newMaterialAuthor, setNewMaterialAuthor] = useState('');
  const [newMaterialCategory, setNewMaterialCategory] = useState('기본');
  const [newMaterialUnit, setNewMaterialUnit] = useState<string>('p');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>(['기본', '문제풀이', '요약강의']);
  const [showGuideDetail, setShowGuideDetail] = useState(false);
  const [newMaterialEstimatedMinutes, setNewMaterialEstimatedMinutes] = useState<number | ''>('');
  const [editingMaterialEstimatedMinutes, setEditingMaterialEstimatedMinutes] = useState<number | ''>('');
  const [newMaterialSpeedMultiplier, setNewMaterialSpeedMultiplier] = useState<number>(1.0);
  const [editingMaterialSpeedMultiplier, setEditingMaterialSpeedMultiplier] = useState<number>(1.0);
  // 통합 폼 전용 자동완성 검색 상태
  const [integratedSearchResults, setIntegratedSearchResults] = useState<SharedMaterial[]>([]);
  const [isSearchingIntegrated, setIsSearchingIntegrated] = useState(false);
  const [hasSearchedIntegrated, setHasSearchedIntegrated] = useState(false);
  const [showIntegratedSuggestions, setShowIntegratedSuggestions] = useState(false);

  // 교재/인강 등록용 선택된 카테고리 상태 (기본값 '기본')
  const [selectedAddCategoryBook, setSelectedAddCategoryBook] = useState<Record<string, string>>({});
  const [selectedAddCategoryLecture, setSelectedAddCategoryLecture] = useState<Record<string, string>>({});

  // 과목별 학습 자료 카테고리 필터 상태 (기본값 '전체')
  const [categoryFilter, setCategoryFilter] = useState<Record<string, string>>({});

  // 과목별 학습 자료 정렬 기준 상태 (기본값 'latest' - 최신 수정순)
  const [sortOrder, setSortOrder] = useState<Record<string, string>>({});

  // 성적 등록 상태
  const [gradeTestName, setGradeTestName] = useState('');
  const [gradeSubject, setGradeSubject] = useState('국어');
  const [gradeScore, setGradeScore] = useState(80);
  const [gradeDate, setGradeDate] = useState('');
  const [gradeFilter, setGradeFilter] = useState('전체');

  // 학생 데이터 로드 시 필드 매핑.
  // student.id 가 바뀔 때만 로컬 상태를 재초기화한다 → 같은 학생의 외부 갱신(onUpdate)으로
  // 편집 중 내용이 덮어써지거나 자동저장이 무한 루프에 빠지는 것을 방지.
  useEffect(() => {
    if (student) {
      if (initializedConsultationStudentIdRef.current === student.id) return;
      initializedConsultationStudentIdRef.current = student.id;
      const shouldResetConsultationDraft = true;

      setName(student.name || '');
      setLoginId(student.loginId || '');
      setCampus(student.campus || 'wonju');
      setManager(student.manager || '');
      setContact(student.contact || '');
      setLifeComment(student.lifeComment || '');
      setStudentLifeComment(student.studentLifeComment || '');
      setSpecialNote(extractAdminNote(student.specialNote));
      setNextConsultationDate(student.nextConsultationDate || '');
      setEnrollmentEndDate(student.enrollmentEndDate || '');
      setWeeklyGradeCheck(Boolean(student.weeklyGradeCheck));
      setSeatNumber(student.seatNumber != null ? String(student.seatNumber) : '');
      setAwaySchedules(student.awaySchedules || []);
      setStudentDdays(student.ddays || []);
      setShareToken(student.shareToken);
      setShareTokenExpiresAt(student.shareTokenExpiresAt);
      setSharePassword(undefined); // PIN은 생성 직후 API 응답에서만 일회성 표시
      setSubjectsState(student.subjects || []);
      setParentPhone(student.parentPhone || '');
      setStudentPhone(student.studentPhone || '');
      setSmsTargets(normalizeSmsTargetsForState(student.smsTargets));
      setCollapsedSubjects(Object.fromEntries((student.subjects || []).map((sub) => [sub.id, true])));
      if (student.customCategories && student.customCategories.length > 0) {
        setCustomCategories(student.customCategories);
      } else {
        setCustomCategories(['기본', '문제풀이', '요약강의']);
      }
      
      // 각 과목의 학습 목표 및 교재/강의 목표일 초기 세팅
      const goals: Record<string, string> = {};
      const dates: Record<string, string> = {};
      const planRanges: Record<string, string> = {};

      (student.subjects || []).forEach(sub => {
        goals[sub.id] = sub.learningGoal || '';
        sub.books.forEach(b => {
          if (b.targetDate) dates[b.id] = b.targetDate;
          (b.detailedPlans || []).forEach(p => {
            planRanges[`${b.id}_${p.weekNumber}`] = p.rangeText || '';
          });
        });
        sub.lectures.forEach(l => {
          if (l.targetDate) dates[l.id] = l.targetDate;
          (l.detailedPlans || []).forEach(p => {
            planRanges[`${l.id}_${p.weekNumber}`] = p.rangeText || '';
          });
        });
      });
      setEditingGoals(goals);
      setMaterialTargetDates(dates);
      setWeeklyPlanRanges(planRanges);
      setProgressDrafts({});
      
      // 상담 디폴트 값 세팅
      const today = new Date().toISOString().split('T')[0];
      if (shouldResetConsultationDraft) {
        setCslDate(today);
        setCslManager(student.manager || '');
        setCslContent('');
        cslContentRef.current = '';
        setCslNextDate(student.nextConsultationDate || '');
        setLastSavedConsultationContent('');
        setIsConsultationDraftDirty(false);
        setIsConsultationPlanDirty(false);
      }
      setQuickPlanText('');
      setDebouncedQuickPlanText('');
      setDebouncedQuickPlanText('');



      // 성적 디폴트 값
      setGradeDate(today);
      setGradeTestName('');
      setGradeScore(80);
      setIsLearningInputOpen(false);

      // 휴가 신청 상태 초기화
      setLeaveRequestsLocal(student.leaveRequests || []);
      setLeaveCouponsLocal(student.leaveCoupons ?? 0);
      setLeaveActionBusy({});
      setLeaveReplyDrafts({});
      setStudyStats(null);
      // 출결/순공 통계 fetch (실패해도 무시)
      fetch(`/api/report/${student.id}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(json => { if (json?.studyStats) setStudyStats(json.studyStats); })
        .catch(() => {});
    }
  }, [student]);

  // 자동 저장: 프로필 + 과목 구조(교재/강의/계획/목표/요일 등) 변경을 디바운스로 자동 반영.
  // 로컬 편집 스냅샷을 진실 소스인 student prop 과 비교해 "다를 때만" 저장하므로,
  // 저장 후 onUpdate 로 student 가 갱신되면 자동으로 동일해져 무한 루프가 생기지 않는다.
  // 상담/생활 코멘트는 로그 누적 부작용이 있어 의도적으로 자동 저장 대상에서 제외(명시적 저장 유지).
  useEffect(() => {
    if (!student) return;
    if (loading || autoSaveInFlightRef.current) return;

    const snap = (
      name: string, campus: string, manager: string, contact: string,
      speed: number, note: string, nextDate: string, subjects: SubjectProgress[],
      enrollEnd: string, weeklyGrade: boolean, aways: AwaySchedule[],
      parentPhone: string, studentPhone: string, smsTargets: string[]
    ) => JSON.stringify({ name, campus, manager, contact, speed, note, nextDate, subjects, enrollEnd, weeklyGrade, aways, parentPhone, studentPhone, smsTargets });

    const localSnap = snap(
      name, campus, manager, contact, 1.0, specialNote,
      nextConsultationDate || '', subjectsState, enrollmentEndDate || '', weeklyGradeCheck, awaySchedules,
      parentPhone, studentPhone, smsTargets
    );
    const sourceSnap = snap(
      student.name || '', student.campus || 'wonju', student.manager || '', student.contact || '',
      1.0, extractAdminNote(student.specialNote),
      student.nextConsultationDate || '', student.subjects || [], student.enrollmentEndDate || '', Boolean(student.weeklyGradeCheck), student.awaySchedules || [],
      student.parentPhone || '', student.studentPhone || '', normalizeSmsTargetsForState(student.smsTargets)
    );

    if (localSnap === sourceSnap) return; // 변경 없음 → 저장 불필요

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveInFlightRef.current = true;
      setIsAutoSaving(true);
      try {
        // 누적성 컬럼(쿠폰/벌점/리워드/참여미션/좌석알림/studentState 등)은 의도적으로
        // 보내지 않는다 — 서버 화이트리스트가 fresh 값을 보존한다(stale 덮어쓰기 방지).
        const updated: Student = {
          id: student.id,
          name,
          campus,
          manager,
          contact,
          specialNote: mergeAdminNote(student.specialNote, specialNote),
          nextConsultationDate: nextConsultationDate || undefined,
          enrollmentEndDate: enrollmentEndDate || undefined,
          weeklyGradeCheck,
          subjects: subjectsState,
          awaySchedules,
          parentPhone,
          studentPhone,
          smsTargets,
          updatedAt: new Date().toISOString(),
        } as Student;
        const res = await fetch(`/api/admin/students/${student.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          onUpdate(data.data);
        } else {
          toast.error('자동 저장에 실패했습니다. 저장 버튼으로 다시 시도해 주세요.');
        }
      } catch {
        toast.error('자동 저장 중 네트워크 오류가 발생했습니다.');
      } finally {
        autoSaveInFlightRef.current = false;
        setIsAutoSaving(false);
      }
    }, 10000); // 자동 저장 디바운스를 10초로 변경

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [student, name, campus, manager, contact, specialNote, nextConsultationDate, enrollmentEndDate, weeklyGradeCheck, subjectsState, loading, onUpdate, awaySchedules, parentPhone, studentPhone, smsTargets]);

  useEffect(() => {
    cslContentRef.current = cslContent;
  }, [cslContent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuickPlanText(quickPlanText);
    }, 350);

    return () => clearTimeout(timer);
  }, [quickPlanText]);

  useEffect(() => {
    const keys = subjectsState.flatMap((subject) => [
      ...(subject.books || []).map((book) => `book:${book.id}`),
      ...(subject.lectures || []).map((lecture) => `lecture:${lecture.id}`),
    ]);

    setSelectedConsultationPlanItems((prev) => {
      const next: Record<string, boolean> = {};
      keys.forEach((key) => {
        next[key] = prev[key] !== false;
      });
      return next;
    });
    setConsultationPlanModes((prev) => {
      const next: Record<string, 'keepTargetDate' | 'keepPace'> = {};
      keys.forEach((key) => {
        next[key] = prev[key] || 'keepTargetDate';
      });
      return next;
    });
  }, [subjectsState]);

  // 미저장 변경이 있을 때 브라우저 새로고침/탭닫기/이탈을 경고 (앱 내부 닫기는 requestClose가 가드)
  useEffect(() => {
    const hasProgressDrafts = subjectsState.some((subject) =>
      (subject.books || []).some((book) => progressDrafts[book.id] !== undefined && progressDrafts[book.id] !== book.currentPage) ||
      (subject.lectures || []).some((lecture) => progressDrafts[lecture.id] !== undefined && progressDrafts[lecture.id] !== lecture.completedLectures)
    );
    const dirty = isAutoSaving || isConsultationDraftDirty || isConsultationPlanDirty || hasProgressDrafts;
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [subjectsState, progressDrafts, isAutoSaving, isConsultationDraftDirty, isConsultationPlanDirty]);

  useEffect(() => {
    if (!student?.id || !isOpen) return;

    let active = true;
    const loadTodayAttendance = async () => {
      try {
        const res = await fetch('/api/admin/attendance/today', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;

        if (!res.ok || !json.success) {
          setTodayAttendanceStatus({ configured: false, status: 'unknown' });
          return;
        }
        if (json.configured === false) {
          setTodayAttendanceStatus({ configured: false, status: 'unconfigured', today: json.today });
          return;
        }

        const present = (json.present || []).find((row: any) => row.id === student.id);
        if (present) {
          setTodayAttendanceStatus({
            configured: true,
            status: 'present',
            today: json.today,
            checkInAt: present.checkInAt,
            minutes: present.todayMinutes ?? present.minutesSoFar ?? 0,
            minutesSoFar: present.minutesSoFar ?? 0,
          });
          return;
        }

        const left = (json.leftToday || []).find((row: any) => row.id === student.id);
        if (left) {
          setTodayAttendanceStatus({
            configured: true,
            status: 'left',
            today: json.today,
            checkInAt: left.checkInAt,
            checkOutAt: left.checkOutAt,
            minutes: left.minutes ?? null,
            autoClosed: Boolean(left.autoClosed),
          });
          return;
        }

        setTodayAttendanceStatus({ configured: true, status: 'absent', today: json.today, minutes: 0 });
      } catch {
        if (active) setTodayAttendanceStatus({ configured: false, status: 'unknown' });
      }
    };

    setTodayAttendanceStatus(null);
    loadTodayAttendance();
    const timer = setInterval(loadTodayAttendance, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [student?.id, isOpen]);

  if (!student) return null;

  const todayActivityKey = getSeoulDateKey();
  const todayPomodoroStats = getPomodoroStats(student.specialNote, todayActivityKey);
  const todayChecklist = getDailyChecklist(student.specialNote, todayActivityKey);
  const learningLogs = student.consultationLogs.filter(log => !log.type || log.type === 'learning');
  const lifeLogs = student.consultationLogs.filter(log => log.type === 'life');
  // 학생 변경 신청(대기중) — consultation_logs 중 type==='request'
  const pendingRequests = getPendingChangeRequests(student).filter(
    log => !resolvedReqIds.includes(log.id)
  );
  const pendingSuggestions = getPendingSuggestions(student).filter(
    log => !resolvedReqIds.includes(log.id)
  );
  const QUICK_REPLIES = ['상담 신청 바랍니다', '확인했어요, 반영할게요', '조금만 더 분발해요', '계획대로 잘하고 있어요'];
  const actOnRequest = async (reqId: string, opts: { status?: 'resolved'; reply?: string }) => {
    setResolvingReqId(reqId);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/requests`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: reqId, ...opts }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const nowIso = new Date().toISOString();
        if (json.student) {
          onUpdate(json.student);
          if (json.student.subjects) {
            setSubjectsState(json.student.subjects);
          }
        } else {
          const updatedStudent: Student = {
            ...student,
            consultationLogs: (student.consultationLogs || []).map((log) => {
              if (log.id !== reqId) return log;
              return {
                ...log,
                ...(typeof opts.reply === 'string' ? { adminReply: opts.reply, repliedAt: nowIso } : {}),
                ...(opts.status === 'resolved' ? { status: 'resolved' as const, resolvedAt: nowIso } : {}),
              };
            }),
            updatedAt: nowIso,
          };
          onUpdate(updatedStudent);
        }

        if (typeof opts.reply === 'string') {
          setSentReplies(prev => ({ ...prev, [reqId]: opts.reply as string }));
          setReplyDrafts(d => ({ ...d, [reqId]: '' }));
        }
        if (opts.status === 'resolved') {
          setResolvedReqIds(prev => [...prev, reqId]);
          toast.success('변경 신청이 승인 및 계획에 즉시 반영되었습니다.');
        } else if (typeof opts.reply === 'string') {
          toast.success('답변을 보냈습니다.');
        }
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setResolvingReqId('');
    }
  };
  const actOnSuggestion = async (suggestionId: string, opts: { status?: 'resolved'; reply?: string }) => {
    setResolvingReqId(suggestionId);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/suggestions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, ...opts }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const nowIso = new Date().toISOString();
        const updatedStudent: Student = {
          ...student,
          consultationLogs: (student.consultationLogs || []).map((log) => {
            if (log.id !== suggestionId) return log;
            return {
              ...log,
              ...(typeof opts.reply === 'string' ? { adminReply: opts.reply, repliedAt: nowIso } : {}),
              ...(opts.status === 'resolved' ? { status: 'resolved' as const, resolvedAt: nowIso } : {}),
            };
          }),
          updatedAt: nowIso,
        };
        onUpdate(updatedStudent);

        if (typeof opts.reply === 'string') {
          setSentReplies(prev => ({ ...prev, [suggestionId]: opts.reply as string }));
          setReplyDrafts(d => ({ ...d, [suggestionId]: '' }));
        }
        if (opts.status === 'resolved') {
          setResolvedReqIds(prev => [...prev, suggestionId]);
          toast.success('건의사항을 처리완료로 표시했습니다.');
        } else if (typeof opts.reply === 'string') {
          toast.success('답변을 보냈습니다.');
        }
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setResolvingReqId('');
    }
  };

  // detail-sheet 가 실제로 편집하는 필드만 추려 PUT 페이로드를 만든다.
  // (서버 scope 미지정 PUT 화이트리스트와 짝이 맞음.) base 로 student 전체를 스프레드하면
  // 시트 로드 시점의 stale 누적성 컬럼(leaveCoupons/penalties/rewardRedemptions/
  // eventParticipations/seatAlerts/studentState 등)을 함께 보내, 그 사이 다른 경로로 적립된
  // 최신값을 덮어쓸 위험이 있다. 여기서는 편집 대상만 전송해 서버가 fresh 값을 보존하게 한다.
  //
  // grades / consultationLogs 도 같은 이유로 base 에서 제외한다. 이 둘은 다른 경로
  // (학생 성적 등록 /api/student/grades, 상담로그 /api/admin/students/[id]/consultation)로도
  // 갱신되므로, 시트가 열린 채 무관한 저장(프로필·외출 등)을 하면 stale 스냅샷이 최신값을
  // 덮어쓴다(서버가 fresh 를 재조회해도 화이트리스트가 payload 값으로 덮어씀 → optimistic
  // lock 도 못 잡음). 성적/상담로그를 실제로 편집하는 호출부만 overrides 로 넘겨(예:
  // buildSavePayload({ grades }), { consultationLogs }) 그때만 서버에 반영되게 한다.
  // 저장 후 로컬 상태는 onUpdate(data.data) 즉 서버 응답으로 갱신되므로, payload 에서 빠져도
  // 화면 값은 서버 fresh 로 정확히 유지된다.
  const buildSavePayload = (overrides: Partial<Student>): Student => ({
    id: student.id,
    name,
    loginId,
    campus,
    manager,
    contact,
    seatNumber: seatNumber !== '' ? Number(seatNumber) : undefined,
    parentPhone,
    studentPhone,
    smsTargets,
    lifeComment,
    studentLifeComment,
    specialNote: mergeAdminNote(student.specialNote, specialNote),
    nextConsultationDate: nextConsultationDate || undefined,
    enrollmentEndDate: enrollmentEndDate || undefined,
    weeklyGradeCheck,
    subjects: subjectsState,
    awaySchedules,
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Student);

  // 0. 학생 데이터 서버 저장 공통 헬퍼
  const saveStudentData = async (updatedStudent: Student): Promise<boolean> => {
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onUpdate(data.data);
        return true;
      } else {
        toast.error(data.message || '데이터 업데이트 실패');
        return false;
      }
    } catch (err) {
      toast.error('네트워크 에러가 발생했습니다.');
      return false;
    }
  };

  const handleManualSave = async (): Promise<boolean> => {
    setLoading(true);
    
    // Merge any pending progressDrafts
    const nowStr = new Date().toISOString();
    const currentConsultationText = cslContentRef.current.trim();
    const latestDrafts = parseProgressFromConsultationContent(cslContentRef.current, subjectsState, progressDrafts);
    const shouldSaveLearningConsultation = currentConsultationText.length > 0 && hasPendingConsultationChanges;
    const shouldApplySelectedPlanChanges = hasPendingConsultationChanges && selectedPlanCount > 0;
    const latestSubjects = shouldSaveLearningConsultation
      ? getMergedSubjects(latestDrafts, true)
      : getMergedSubjects(latestDrafts, shouldApplySelectedPlanChanges);

    if (Object.keys(latestDrafts).length > 0) {
      // Clear debounce timer
      if (debounceTimersRef.current[student?.id || '']) {
        clearTimeout(debounceTimersRef.current[student?.id || '']);
      }
      setSubjectsState(latestSubjects);
      setProgressDrafts({});
    }

    // 생활 코멘트 변경사항 감지하여 상담이력 로그 누적
    const isLifeCommentChanged = lifeComment.trim() !== (student.lifeComment || '').trim();
    const isStudentCommentChanged = studentLifeComment.trim() !== (student.studentLifeComment || '').trim();

    let updatedLogs = [...(student.consultationLogs || [])];

    if (shouldSaveLearningConsultation) {
      const newLearningLog: ConsultationLog = {
        id: `csl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: cslDate,
        manager: cslManager || student.manager || '담당 매니저',
        content: currentConsultationText,
        type: 'learning'
      };

      updatedLogs = [newLearningLog, ...updatedLogs];
    }
    
    if ((isLifeCommentChanged && lifeComment.trim()) || (isStudentCommentChanged && studentLifeComment.trim())) {
      const today = new Date().toISOString().split('T')[0];
      let logContent = '';
      if (lifeComment.trim()) {
        logContent += `[학부모 공유]\n${lifeComment.trim()}`;
      }
      if (studentLifeComment.trim()) {
        if (logContent) logContent += '\n\n';
        logContent += `[학생 공유]\n${studentLifeComment.trim()}`;
      }

      const newLog: ConsultationLog = {
        id: `csl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: today,
        manager: student.manager || '담당 매니저',
        content: logContent,
        type: 'life'
      };
      
      updatedLogs = [newLog, ...updatedLogs];
    }

    const updatedStudent: Student = buildSavePayload({
      nextConsultationDate: cslNextDate || nextConsultationDate || undefined,
      subjects: latestSubjects,
      consultationLogs: updatedLogs,
      updatedAt: nowStr,
    });

    const success = await saveStudentData(updatedStudent);
    if (success) {
      setIsAutoSaving(false);
      setProgressDrafts({});
      if (shouldSaveLearningConsultation) {
        setCslContent(currentConsultationText);
        setLastSavedConsultationContent(currentConsultationText);
        setIsConsultationDraftDirty(false);
        setIsConsultationPlanDirty(false);
        if (cslNextDate) setNextConsultationDate(cslNextDate);
      } else if (shouldApplySelectedPlanChanges) {
        setIsConsultationPlanDirty(false);
      }

      if (shouldApplySelectedPlanChanges) {
        const preview = getConsultationPlanPreview(latestDrafts).filter((item) => selectedConsultationPlanItems[item.selectionKey] !== false);
        const nextRanges = { ...weeklyPlanRanges };
        preview.forEach((item) => {
          item.plans.forEach((plan) => {
            nextRanges[`${item.materialId}_${plan.weekNumber}`] = plan.rangeText || '';
          });
        });
        setWeeklyPlanRanges(nextRanges);
      }
      toast.success('원생의 모든 변경 사항이 성공적으로 저장되었습니다.');
    }
    setLoading(false);
    return success;
  };

  const handleSaveLifeComment = async () => {
    if (!lifeComment.trim() && !studentLifeComment.trim()) {
      toast.error('저장할 코멘트 내용을 입력해주세요.');
      return;
    }

    setLoading(true);

    const isLifeCommentChanged = lifeComment.trim() !== (student.lifeComment || '').trim();
    const isStudentCommentChanged = studentLifeComment.trim() !== (student.studentLifeComment || '').trim();

    let updatedLogs = [...(student.consultationLogs || [])];
    
    if ((isLifeCommentChanged && lifeComment.trim()) || (isStudentCommentChanged && studentLifeComment.trim())) {
      const today = new Date().toISOString().split('T')[0];
      let logContent = '';
      if (lifeComment.trim()) {
        logContent += `[학부모 공유]\n${lifeComment.trim()}`;
      }
      if (studentLifeComment.trim()) {
        if (logContent) logContent += '\n\n';
        logContent += `[학생 공유]\n${studentLifeComment.trim()}`;
      }

      const newLog: ConsultationLog = {
        id: `csl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: today,
        manager: student.manager || '담당 매니저',
        content: logContent,
        type: 'life'
      };
      
      updatedLogs = [newLog, ...updatedLogs];
    }

    const updatedStudent: Student = buildSavePayload({
      consultationLogs: updatedLogs,
    });

    const success = await saveStudentData(updatedStudent);
    if (success) {
      toast.success('생활 코멘트 저장 및 면담 기록이 누적되었습니다.');
      setTimeout(() => {
        const targetEl = document.getElementById('life-consultation-logs');
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
    setLoading(false);
  };

  // 1. 학생 기본 정보 업데이트
  const handleUpdateInfo = async () => {
    if (seatConflictNames.length > 0) {
      const ok = await confirm({
        title: `${seatNumber}번 좌석이 이미 사용 중이에요`,
        description: `대상: ${seatConflictNames.join(', ')} · 그래도 같은 좌석으로 저장할까요?`,
        confirmText: '저장',
      });
      if (!ok) return;
    }
    setLoading(true);
    const updatedStudent: Student = buildSavePayload({});

    const success = await saveStudentData(updatedStudent);
    if (success) {
      toast.success('원생 기본 정보가 수정되었습니다.');
    }
    setLoading(false);
  };

  const handleUpdateAwaySchedules = (nextSchedules: AwaySchedule[]) => {
    setAwaySchedules(nextSchedules);
  };

  const handleApplyQuickAwaySchedules = async (text: string): Promise<QuickAwayApplyResult> => {
    const parsed = parseQuickAwayInput(text);
    const result: QuickAwayApplyResult = {
      applied: 0,
      skippedNoMatch: 0,
      skippedDuplicateName: 0,
      skippedInvalid: parsed.invalidCount,
      skippedDuplicateSchedule: 0,
      failed: 0,
    };

    if (parsed.entries.length === 0) {
      toast.error('적용할 빠른 입력 항목이 없습니다.');
      return result;
    }

    const currentStudentSnapshot: Student = {
      ...student,
      name: name || student.name,
      loginId,
      campus,
      manager,
      contact,
      lifeComment,
      studentLifeComment,
      specialNote: mergeAdminNote(student.specialNote, specialNote),
      nextConsultationDate: nextConsultationDate || undefined,
      enrollmentEndDate: enrollmentEndDate || undefined,
      weeklyGradeCheck,
      seatNumber: seatNumber !== '' ? Number(seatNumber) : undefined,
      subjects: subjectsState,
      awaySchedules,
      parentPhone,
      studentPhone,
      smsTargets,
    };

    const roster = [
      ...students.filter((item) => item.id !== student.id),
      currentStudentSnapshot,
    ];

    const byName = new Map<string, Student[]>();
    roster.forEach((item) => {
      const key = normalizeQuickAwayName(item.name || '');
      if (!key) return;
      byName.set(key, [...(byName.get(key) || []), item]);
    });

    const grouped = new Map<string, { target: Student; entries: QuickAwayEntry[] }>();
    parsed.entries.forEach((entry) => {
      const matches = byName.get(entry.nameKey) || [];
      if (matches.length === 0) {
        result.skippedNoMatch += 1;
        return;
      }
      if (matches.length > 1) {
        result.skippedDuplicateName += 1;
        return;
      }
      const target = matches[0];
      const existing = grouped.get(target.id);
      if (existing) {
        existing.entries.push(entry);
      } else {
        grouped.set(target.id, { target, entries: [entry] });
      }
    });

    for (const { target, entries } of grouped.values()) {
      const nextSchedules = [...(target.id === student.id ? awaySchedules : (target.awaySchedules || []))];
      let addedCount = 0;

      entries.forEach((entry) => {
        const nextSchedule: AwaySchedule = {
          awayTime: entry.awayTime,
          returnTime: entry.returnTime,
          days: [],
          dayMode: 'sun0',
          until: 'forever',
        };
        if (nextSchedules.some((schedule) => isSameAwaySchedule(schedule, nextSchedule))) {
          result.skippedDuplicateSchedule += 1;
          return;
        }
        nextSchedules.push(nextSchedule);
        addedCount += 1;
      });

      if (addedCount === 0) continue;

      const nowIso = new Date().toISOString();
      // 본인은 화이트리스트 페이로드로, 다른 원생(target)은 외출 일정만 갱신해 보낸다.
      // 어느 쪽이든 서버 화이트리스트가 누적성 컬럼을 stale 값으로 덮지 않도록 보존한다.
      const updatedStudent: Student = target.id === student.id
        ? buildSavePayload({ awaySchedules: nextSchedules, updatedAt: nowIso })
        : { ...target, awaySchedules: nextSchedules, updatedAt: nowIso };

      try {
        const res = await fetch(`/api/admin/students/${target.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStudent),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          result.applied += addedCount;
          if (target.id === student.id) {
            setAwaySchedules(nextSchedules);
            onUpdate(data.data);
          }
        } else {
          result.failed += addedCount;
        }
      } catch {
        result.failed += addedCount;
      }
    }

    if (result.applied > 0) {
      toast.success(`${result.applied}건의 정기 외출 시간이 적용되었습니다.`);
    } else {
      toast.error('적용된 정기 외출 시간이 없습니다.');
    }

    return result;
  };

  const handleGenerateShareToken = async () => {
    const res = await fetch(`/api/admin/students/${student.id}/share-token`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      setShareToken(json.token);
      setShareTokenExpiresAt(json.expiresAt);
      setSharePassword(json.password);
      toast.success('학부모 공유 링크가 생성되었습니다.');
    } else {
      toast.error('링크 생성에 실패했습니다.');
    }
  };

  const handleRevokeShareToken = async () => {
    const res = await fetch(`/api/admin/students/${student.id}/share-token`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setShareToken(undefined);
      setShareTokenExpiresAt(undefined);
      setSharePassword(undefined);
      toast.success('공유 링크가 폐기되었습니다.');
    } else {
      toast.error('링크 폐기에 실패했습니다.');
    }
  };

  // 2. 과목 추가
  const handleAddSubject = () => {
    if (!newSubjectName.trim()) {
      toast.error('과목명을 입력해주세요.');
      return;
    }

    const newSub: SubjectProgress = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: newSubjectName.trim(),
      learningGoal: '',
      studyTime: '',
      books: [],
      lectures: [],
      updatedAt: new Date().toISOString()
    };

    const updatedSubjects = [...subjectsState, newSub];
    setSubjectsState(updatedSubjects);
    setNewSubjectName('');
    setEditingGoals(prev => ({ ...prev, [newSub.id]: '' }));
    setCollapsedSubjects(prev => ({ ...prev, [newSub.id]: false }));
    setIsAutoSaving(true);
    toast.success(`'${newSub.name}' 과목이 추가되었습니다. (자동 저장됨)`);
  };

  const handleUpdateSubjectStudyTime = (subId: string, studyTime: 'morning' | 'afternoon' | 'night' | '') => {
    const updatedSubjects = subjectsState.map(s =>
      s.id === subId ? { ...s, studyTime, updatedAt: new Date().toISOString() } : s
    );

    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);
    toast.success('과목별 학습 시간이 설정되었습니다. (자동 저장됨)');
  };

  const handleToggleSubjectStudyDay = (subId: string, day: NonNullable<SubjectProgress['studyDays']>[number]) => {
    const updatedSubjects = subjectsState.map(s => {
      if (s.id !== subId) return s;
      const currentDays = s.studyDays || [];
      const studyDays = currentDays.includes(day)
        ? currentDays.filter(item => item !== day)
        : [...currentDays, day];
      return { ...s, studyDays, updatedAt: new Date().toISOString() };
    });

    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);
    toast.success('요일별 학습 시간표가 변경되었습니다. (자동 저장됨)');
  };

  // 3. 과목 삭제
  const handleDeleteSubject = async (subId: string, subName: string) => {
    if (!(await confirm({
      title: `'${subName}' 과목을 삭제할까요?`,
      description: '소속된 모든 학습 진도·주간 계획 데이터가 함께 삭제됩니다.',
      tone: 'danger',
      confirmText: '삭제',
    }))) {
      return;
    }

    const updatedSubjects = subjectsState.filter(s => s.id !== subId);
    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);
    toast.success(`'${subName}' 과목이 삭제되었습니다. (자동 저장됨)`);
  };

  // 4. 과목 학습 목표 저장
  const handleSaveLearningGoal = (subId: string) => {
    const goalText = editingGoals[subId] || '';
    const updatedSubjects = subjectsState.map(s => 
      s.id === subId ? { ...s, learningGoal: goalText, updatedAt: new Date().toISOString() } : s
    );

    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);
    toast.success('학습 목표가 업데이트되었습니다. (자동 저장됨)');
  };

  // 5. 공유 DB 검색 헬퍼
  const searchMaterials = async (query: string, type: 'book' | 'lecture', subject: string) => {
    setIsSearchingShared(true);
    setHasSearchedShared(false);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/admin/shared-materials?q=${encodeURIComponent(query)}&type=${type}&subject=${encodeURIComponent(subject)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSearchResults(json.data || []);
          setHasSearchedShared(true);
        }
      }
    } catch (e) {
      console.error('Failed to search shared materials', e);
      setSearchResults([]);
      setHasSearchedShared(true);
    } finally {
      setIsSearchingShared(false);
    }
  };

  const getActiveStudyDays = (studyDays?: SubjectProgress['studyDays']) => {
    return studyDays && studyDays.length > 0 ? studyDays : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  };

  const getActiveStudyDayCount = (studyDays?: SubjectProgress['studyDays']) => {
    return getActiveStudyDays(studyDays).length;
  };

  const isStudyDay = (date: Date, studyDays?: SubjectProgress['studyDays']) => {
    const dayMap: Record<number, NonNullable<SubjectProgress['studyDays']>[number]> = {
      0: 'sun',
      1: 'mon',
      2: 'tue',
      3: 'wed',
      4: 'thu',
      5: 'fri',
      6: 'sat',
    };
    return getActiveStudyDays(studyDays).includes(dayMap[date.getDay()]);
  };

  // 6. 과목별 학습 요일을 반영한 학습 계획표 생성 헬퍼 함수
  const generateDetailedPlans = (
    materialId: string,
    totalAmount: number,
    type: 'book' | 'lecture',
    goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks',
    goalValue: number,
    currentAmount = 0,
    customUnit?: string,
    reviewPasses: ReviewPassSetting[] = [],
    overrideSpeedMultiplier?: number,
    overrideEstimatedMinutes?: number | null,
    overrideCategory?: string,
    // 새로 만드는 교재/강의는 아직 subjectsState에 없어 부모 과목 조회가 실패한다.
    // 이때 호출부가 부모 과목을 직접 넘겨 studyDays/studyTime이 누락되지 않게 한다.
    parentSubjectHint?: SubjectProgress | null
  ): { plans: DetailedPlan[], calculatedTargetDate: string } => {
    const parentSubject = subjectsState.find((s) => {
      const hasBook = s.books?.some((b) => b.id === materialId);
      const hasLecture = s.lectures?.some((l) => l.id === materialId);
      return hasBook || hasLecture;
    }) ?? parentSubjectHint ?? undefined;
    const studyDays = parentSubject?.studyDays;
    let speedMultiplier = overrideSpeedMultiplier ?? 1.0;
    if (overrideSpeedMultiplier === undefined && type === 'lecture' && parentSubject) {
      const lec = parentSubject.lectures.find(l => l.id === materialId);
      if (lec && lec.speedMultiplier !== undefined) {
        speedMultiplier = Number(lec.speedMultiplier);
      }
    }
    let estimatedMinutes: number | undefined;
    if (overrideEstimatedMinutes !== undefined && overrideEstimatedMinutes !== null) {
      estimatedMinutes = overrideEstimatedMinutes;
    } else if (overrideEstimatedMinutes === undefined && parentSubject) {
      const mat = type === 'book'
        ? parentSubject.books.find(b => b.id === materialId)
        : parentSubject.lectures.find(l => l.id === materialId);
      if (mat?.estimatedMinutesPerUnit !== undefined) estimatedMinutes = mat.estimatedMinutesPerUnit;
    }
    let category = overrideCategory;
    if (category === undefined && parentSubject) {
      const mat = type === 'book'
        ? parentSubject.books.find(b => b.id === materialId)
        : parentSubject.lectures.find(l => l.id === materialId);
      category = mat?.category;
    }

    return generateDetailedPlansLib(
      materialId,
      totalAmount,
      type,
      goalType,
      goalValue,
      currentAmount,
      customUnit,
      reviewPasses,
      studyDays,
      speedMultiplier,
      estimatedMinutes,
      parentSubject?.studyTime,
      category
    );
  };

  // 과목 내 교재 목표 설정 변경 필드 핸들러
  const updateBookGoalField = (subId: string, bookId: string, field: string, value: any) => {
    setSubjectsState(prev => prev.map(sub => {
      if (sub.id !== subId) return sub;
      return {
        ...sub,
        books: sub.books.map(b => {
          if (b.id !== bookId) return b;
          const updatedBook = { ...b, [field]: value };
          // 목표 방식 미선택 상태에서는 계획을 생성하지 않는다(숨은 'weeks' 폴백 금지)
          const goalType = updatedBook.goalType;
          const goalValue = updatedBook.goalValue || 0;
          if (goalType && goalValue > 0 && (field === 'goalType' || field === 'goalValue')) {
            const { plans, calculatedTargetDate } = generateDetailedPlansLib(
              bookId,
              updatedBook.totalPages,
              'book',
              goalType,
              goalValue,
              updatedBook.currentPage,
              updatedBook.unit,
              updatedBook.reviewPasses || [],
              sub.studyDays,
              1.0,
              updatedBook.estimatedMinutesPerUnit,
              sub.studyTime,
              updatedBook.category
            );
            updatedBook.detailedPlans = plans;
            updatedBook.targetDate = calculatedTargetDate;
          }
          return updatedBook;
        })
      };
    }));
    setIsAutoSaving(true);
  };

  // 과목 내 인강 목표 설정 변경 필드 핸들러
  const updateLectureGoalField = (subId: string, lectureId: string, field: string, value: any) => {
    setSubjectsState(prev => prev.map(sub => {
      if (sub.id !== subId) return sub;
      return {
        ...sub,
        lectures: sub.lectures.map(l => {
          if (l.id !== lectureId) return l;
          const updatedLec = { ...l, [field]: value };
          // 목표 방식 미선택 상태에서는 계획을 생성하지 않는다(숨은 'weeks' 폴백 금지)
          const goalType = updatedLec.goalType;
          const goalValue = updatedLec.goalValue || 0;
          if (goalType && goalValue > 0 && (field === 'goalType' || field === 'goalValue' || field === 'speedMultiplier' || field === 'estimatedMinutesPerUnit')) {
            const { plans, calculatedTargetDate } = generateDetailedPlansLib(
              lectureId,
              updatedLec.totalLectures,
              'lecture',
              goalType,
              goalValue,
              updatedLec.completedLectures,
              undefined,
              updatedLec.reviewPasses || [],
              sub.studyDays,
              Number(updatedLec.speedMultiplier || 1.0),
              updatedLec.estimatedMinutesPerUnit,
              sub.studyTime,
              updatedLec.category
            );
            updatedLec.detailedPlans = plans;
            updatedLec.targetDate = calculatedTargetDate;
          }
          return updatedLec;
        })
      };
    }));
    setIsAutoSaving(true);
  };

  const updateReviewPassSetting = (
    subId: string,
    materialId: string,
    type: 'book' | 'lecture',
    passNumber: 2 | 3,
    enabled: boolean,
    days?: number
  ) => {
    const normalizePasses = (passes: ReviewPassSetting[] | undefined) => {
      const next = [...(passes || [])].filter((pass) => pass.passNumber !== passNumber);
      if (enabled) {
        next.push({
          passNumber,
          days: Math.max(1, Math.round(days || passes?.find((pass) => pass.passNumber === passNumber)?.days || 7)),
        });
      }
      return next.sort((a, b) => a.passNumber - b.passNumber);
    };

    setSubjectsState(prev => prev.map(sub => {
      if (sub.id !== subId) return sub;
      if (type === 'book') {
        return {
          ...sub,
          books: sub.books.map(b => {
            if (b.id !== materialId) return b;
            const newPasses = normalizePasses(b.reviewPasses);
            const goalType = b.goalType;
            const goalValue = b.goalValue || 0;
            let newPlans = b.detailedPlans || [];
            let newTargetDate = b.targetDate;
            if (goalType && goalValue > 0) {
              const { plans, calculatedTargetDate } = generateDetailedPlansLib(
                materialId,
                b.totalPages,
                'book',
                goalType,
                goalValue,
                b.currentPage,
                b.unit,
                newPasses,
                sub.studyDays,
                1.0,
                b.estimatedMinutesPerUnit,
                sub.studyTime,
                b.category
              );
              newPlans = plans;
              newTargetDate = calculatedTargetDate;
            }
            return { ...b, reviewPasses: newPasses, detailedPlans: newPlans, targetDate: newTargetDate };
          })
        };
      }
      return {
        ...sub,
        lectures: sub.lectures.map(l => {
          if (l.id !== materialId) return l;
          const newPasses = normalizePasses(l.reviewPasses);
          const goalType = l.goalType;
          const goalValue = l.goalValue || 0;
          let newPlans = l.detailedPlans || [];
          let newTargetDate = l.targetDate;
          if (goalType && goalValue > 0) {
            const { plans, calculatedTargetDate } = generateDetailedPlansLib(
              materialId,
              l.totalLectures,
              'lecture',
              goalType,
              goalValue,
              l.completedLectures,
              undefined,
              newPasses,
              sub.studyDays,
              Number(l.speedMultiplier || 1.0),
              l.estimatedMinutesPerUnit,
              sub.studyTime,
              l.category
            );
            newPlans = plans;
            newTargetDate = calculatedTargetDate;
          }
          return { ...l, reviewPasses: newPasses, detailedPlans: newPlans, targetDate: newTargetDate };
        })
      };
    }));
    setIsAutoSaving(true);
  };

  // 학습 목표를 세이브하고 계획을 자동 생성하는 공통 핸들러
  const generateAndSavePlans = async (subId: string, materialId: string, type: 'book' | 'lecture') => {
    // 디바운스 타이머 취소하여 경합 차단
    if (debounceTimersRef.current[student?.id || '']) {
      clearTimeout(debounceTimersRef.current[student?.id || '']);
    }

    const sub = subjectsState.find(s => s.id === subId);
    if (!sub) return;

    let targetMaterial: BookProgress | LectureProgress | undefined;
    if (type === 'book') {
      targetMaterial = sub.books.find(b => b.id === materialId);
    } else {
      targetMaterial = sub.lectures.find(l => l.id === materialId);
    }

    if (!targetMaterial) return;

    const goalType = targetMaterial.goalType;
    if (!goalType) {
      toast.error('목표 방식을 먼저 선택해 주세요.');
      return;
    }
    const goalValue = targetMaterial.goalValue || 0;
    const goalDescription = targetMaterial.goalDescription || '';
    const reviewPasses = (targetMaterial.reviewPasses || []).filter((pass) => pass.days > 0);
    const totalAmount = type === 'book' 
      ? (targetMaterial as BookProgress).totalPages 
      : (targetMaterial as LectureProgress).totalLectures;
    const currentAmount = type === 'book'
      ? clampProgressValue(progressDrafts[materialId] ?? (targetMaterial as BookProgress).currentPage, totalAmount)
      : clampProgressValue(progressDrafts[materialId] ?? (targetMaterial as LectureProgress).completedLectures, totalAmount);

    if (goalValue <= 0 && currentAmount < totalAmount) {
      toast.error('올바른 목표 값을 입력해주세요.');
      return;
    }

    // 계획 생성
    if (currentAmount >= totalAmount && reviewPasses.length === 0) {
      toast.error('이미 완료된 자료입니다. 2회독 또는 3회독을 선택하면 추가 계획을 생성할 수 있습니다.');
      return;
    }

    const customUnit = type === 'book' ? (targetMaterial as BookProgress).unit : undefined;

    // 하루당 평균 소화해야 할 학습량 추정 및 완료일 조정 가이드 팝업
    const daysCount = getActiveStudyDayCount(sub.studyDays);

    let estimatedDailyAmount = 0;
    const remainingAmount = totalAmount - currentAmount;
    const speed = type === 'lecture' ? Number((targetMaterial as LectureProgress).speedMultiplier || 1.0) : 1.0;
    const adjustedSpeedGoalValue = goalValue / speed;

    if (goalType === 'dailyAmount') {
      estimatedDailyAmount = goalValue;
    } else if (goalType === 'weeklyAmount') {
      estimatedDailyAmount = goalValue / daysCount;
    } else if (goalType === 'weeks') {
      const totalDays = adjustedSpeedGoalValue * daysCount;
      estimatedDailyAmount = totalDays > 0 ? remainingAmount / totalDays : 0;
    } else if (goalType === 'deadlineWeeks') {
      // 기간 목표: 남은 분량을 N주 학습일에 균등 분배한 하루 근사치("이 속도면 하루 약 X").
      const totalDays = Math.max(1, Math.round(goalValue)) * daysCount;
      estimatedDailyAmount = totalDays > 0 ? remainingAmount / totalDays : 0;
    }

    const isDailyGoalOverload = (type === 'book' && estimatedDailyAmount > 30) || (type === 'lecture' && estimatedDailyAmount > 3);

    if (isDailyGoalOverload) {
      const confirmed = await confirm({
        title: '무리한 계획을 생성할까요?',
        description: `현재 목표 조건이면 하루 평균 ${Math.round(estimatedDailyAmount)}${type === 'book' ? 'p' : '강'} 이상 학습해야 해요. (권장 한계: 하루 30p / 3강 이하) 이대로 생성하면 부담이 클 수 있어요.`,
        confirmText: '이대로 생성',
      });
      if (!confirmed) {
        return;
      }
    }

    const { plans, calculatedTargetDate } = generateDetailedPlans(
      materialId,
      totalAmount,
      type,
      goalType,
      goalValue,
      currentAmount,
      customUnit,
      reviewPasses
    );

    // subjectsState 업데이트
    const nowStr = new Date().toISOString();
    const updatedSubjects = subjectsState.map(s => {
      if (s.id !== subId) return s;

      if (type === 'book') {
        return {
          ...s,
          books: s.books.map(b => b.id === materialId ? {
            ...b,
            currentPage: currentAmount,
            goalType,
            goalValue,
            goalDescription,
            reviewPasses,
            targetDate: calculatedTargetDate,
            detailedPlans: plans,
            updatedAt: nowStr
          } : b),
          updatedAt: nowStr
        };
      } else {
        return {
          ...s,
          lectures: s.lectures.map(l => l.id === materialId ? {
            ...l,
            completedLectures: currentAmount,
            goalType,
            goalValue,
            goalDescription,
            reviewPasses,
            targetDate: calculatedTargetDate,
            detailedPlans: plans,
            updatedAt: nowStr
          } : l),
          updatedAt: nowStr
        };
      }
    });

    setSubjectsState(updatedSubjects);
    setMaterialTargetDates(prev => ({ ...prev, [materialId]: calculatedTargetDate }));
    clearProgressDraft(materialId);
    
    const planRanges: Record<string, string> = { ...weeklyPlanRanges };
    plans.forEach(p => {
      planRanges[`${materialId}_${p.weekNumber}`] = p.rangeText || '';
    });
    setWeeklyPlanRanges(planRanges);

    setIsAutoSaving(true);
    toast.success('학습 목표가 설정되고 주간 계획표가 자동 생성되었습니다. (자동 저장됨)');
  };

  // 통합 등록 폼용 자동완성 검색
  const searchIntegratedMaterials = async (query: string, type: 'book' | 'lecture', subject: string) => {
    setIsSearchingIntegrated(true);
    setHasSearchedIntegrated(false);
    setIntegratedSearchResults([]);
    try {
      const res = await fetch(`/api/admin/shared-materials?q=${encodeURIComponent(query)}&type=${type}&subject=${encodeURIComponent(subject)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setIntegratedSearchResults(json.data || []);
          setHasSearchedIntegrated(true);
        }
      }
    } catch (e) {
      console.error('Failed to search shared materials', e);
      setIntegratedSearchResults([]);
      setHasSearchedIntegrated(true);
    } finally {
      setIsSearchingIntegrated(false);
    }
  };

  // 통합 등록 폼 저장 로직
  const queueIntegratedMaterialSearch = (query: string) => {
    if (integratedSearchTimerRef.current) {
      clearTimeout(integratedSearchTimerRef.current);
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setIsSearchingIntegrated(false);
      setHasSearchedIntegrated(false);
      setIntegratedSearchResults([]);
      setShowIntegratedSuggestions(false);
      return;
    }

    setShowIntegratedSuggestions(true);
    integratedSearchTimerRef.current = setTimeout(() => {
      searchIntegratedMaterials(trimmedQuery, newMaterialType, newMaterialSubject);
    }, 300);
  };

  const handleSaveMaterial = async () => {
    const subjectName = newMaterialSubject.trim();
    const title = newMaterialTitle.trim();
    const total = Number(newMaterialTotal);

    if (!subjectName) return toast.error('과목명을 입력하거나 선택해주세요.');
    if (!title) return toast.error(newMaterialType === 'book' ? '교재명을 입력해주세요.' : '인강 강좌명을 입력해주세요.');
    if (!total || total <= 0) return toast.error(newMaterialType === 'book' ? '올바른 총 페이지를 지정해주세요.' : '올바른 총 강의 수를 지정해주세요.');

    // 공유 DB 등록 API
    await fetch('/api/admin/shared-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: newMaterialType,
        name: title,
        subject: subjectName,
        publisher: newMaterialType === 'book' ? newMaterialPublisher.trim() : '',
        author: newMaterialAuthor.trim(),
        totalPagesOrLectures: total,
        unit: newMaterialType === 'book' ? newMaterialUnit : '강'
      })
    });

    const nowStr = new Date().toISOString();
    
    // 1. 해당 과목이 존재하는지 확인하고 없으면 새로 만듦
    let targetSubject = subjectsState.find(s => s.name === subjectName);
    let updatedSubjects = [...subjectsState];

    if (!targetSubject) {
      targetSubject = {
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: subjectName,
        books: [],
        lectures: [],
        updatedAt: nowStr
      };
      updatedSubjects.push(targetSubject);
    }

    // 2. 해당 과목에 교재/인강 추가
    updatedSubjects = updatedSubjects.map(sub => {
      if (sub.id !== targetSubject!.id) return sub;

      if (newMaterialType === 'book') {
        // 등록=자료만. 목표/계획은 등록 후 자료별 학습 목표 설정에서 지정한다(자동 4주 계획 생성 금지).
        const tempBookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newBook: BookProgress = {
          id: tempBookId,
          title: title,
          totalPages: total,
          currentPage: 0,
          updatedAt: nowStr,
          category: newMaterialCategory,
          unit: newMaterialUnit,
          estimatedMinutesPerUnit: newMaterialEstimatedMinutes !== '' ? Number(newMaterialEstimatedMinutes) : undefined,
        };
        return {
          ...sub,
          books: [...sub.books, newBook],
          updatedAt: nowStr
        };
      } else {
        const tempLecId = `lec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newLecture: LectureProgress = {
          id: tempLecId,
          name: title,
          totalLectures: total,
          completedLectures: 0,
          updatedAt: nowStr,
          category: newMaterialCategory,
          estimatedMinutesPerUnit: newMaterialEstimatedMinutes !== '' ? Number(newMaterialEstimatedMinutes) : undefined,
          speedMultiplier: newMaterialSpeedMultiplier,
        };
        return {
          ...sub,
          lectures: [...sub.lectures, newLecture],
          updatedAt: nowStr
        };
      }
    });

    // 3. 학생 데이터와 customCategories 포함하여 로컬 상태 반영
    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);
    toast.success('학습 자료가 로컬에 등록되었습니다. (자동 저장됨)');

    // 폼 입력 리셋 (과목명은 유지하여 연속 등록 편의성 제공)
    setNewMaterialTitle('');
    setNewMaterialTotal('');
    setNewMaterialPublisher('');
    setNewMaterialAuthor('');
    setNewMaterialEstimatedMinutes('');
    setNewMaterialSpeedMultiplier(1.0);
    setShowIntegratedSuggestions(false);
    setIntegratedSearchResults([]);
  };

  // 커스텀 카테고리 추가 로직
  const handleCreateCustomCategory = async () => {
    const categoryName = await prompt({
      title: '새 학습 자료 그룹',
      description: '카테고리 이름을 입력하세요.',
      placeholder: '예: 심화 문제집',
      confirmText: '추가',
    });
    if (!categoryName) return;
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    if (customCategories.includes(trimmed)) {
      return toast.error('이미 존재하는 그룹 이름입니다.');
    }

    const updatedCategories = [...customCategories, trimmed];
    setCustomCategories(updatedCategories);
    setIsAutoSaving(true);
    toast.success(`'${trimmed}' 그룹이 추가되었습니다. (자동 저장됨)`);
  };

  // 교재 추가 공통 로직
  const handleAddBook = async (subjectId: string, subjectName: string) => {
    const title = newBookTitle[subjectId];
    const total = newBookTotal[subjectId];
    if (!title || !title.trim()) return toast.error('교재명을 입력해주세요.');
    if (!total || total <= 0) return toast.error('올바른 총 페이지를 지정해주세요.');

    const category = selectedAddCategoryBook[subjectId] || '기본';

    await fetch('/api/admin/shared-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'book',
        name: title,
        subject: subjectName,
        publisher: newBookPublisher[subjectId] || '',
        author: newBookAuthor[subjectId] || '',
        totalPagesOrLectures: total
      })
    });

    updateProgress(subjectId, 'book', '', 'add', { title, total, category });
    setNewBookPublisher(prev => ({ ...prev, [subjectId]: '' }));
    setNewBookAuthor(prev => ({ ...prev, [subjectId]: '' }));
  };

  // 인강 추가 공통 로직
  const handleAddLecture = async (subjectId: string, subjectName: string) => {
    const title = newLectureName[subjectId];
    const total = newLectureTotal[subjectId];
    if (!title || !title.trim()) return toast.error('인강 강좌명을 입력해주세요.');
    if (!total || total <= 0) return toast.error('올바른 총 강의 수를 지정해주세요.');

    const category = selectedAddCategoryLecture[subjectId] || '기본';

    await fetch('/api/admin/shared-materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lecture',
        name: title,
        subject: subjectName,
        author: newLectureAuthor[subjectId] || '',
        totalPagesOrLectures: total
      })
    });

    updateProgress(subjectId, 'lecture', '', 'add', { title, total, category });
    setNewLectureAuthor(prev => ({ ...prev, [subjectId]: '' }));
  };


  // 7. 교재/인강 추가/수정/삭제 진도 관리
  const updateProgress = async (
    subId: string,
    type: 'book' | 'lecture',
    materialId: string,
    action: 'inc' | 'dec' | 'setCurrent' | 'delete' | 'add' | 'updatePlan' | 'targetDate' | 'edit',
    payload?: any
  ) => {
    // 교재/인강 삭제는 진도·상세계획·회독설정이 함께 사라지므로 확인 후 진행(오클릭 방지)
    if (action === 'delete') {
      const ok = await confirm({
        title: '이 학습자료를 삭제할까요?',
        description: '진도·상세계획·회독설정이 함께 삭제됩니다.',
        tone: 'danger',
        confirmText: '삭제',
      });
      if (!ok) return;
    }
    const nowStr = new Date().toISOString();
    const updatedSubjects = subjectsState.map(sub => {
      if (sub.id !== subId) return sub;

      let updatedBooks = [...sub.books];
      let updatedLectures = [...sub.lectures];

      if (type === 'book') {
        if (action === 'inc') {
          updatedBooks = updatedBooks.map(b => b.id === materialId ? { ...b, currentPage: Math.min(b.totalPages, b.currentPage + 1), updatedAt: nowStr } : b);
        } else if (action === 'dec') {
          updatedBooks = updatedBooks.map(b => b.id === materialId ? { ...b, currentPage: Math.max(0, b.currentPage - 1), updatedAt: nowStr } : b);
        } else if (action === 'setCurrent') {
          updatedBooks = updatedBooks.map(b => b.id === materialId ? { ...b, currentPage: Math.min(b.totalPages, Math.max(0, Number(payload.current) || 0)), updatedAt: nowStr } : b);
        } else if (action === 'delete') {
          updatedBooks = updatedBooks.filter(b => b.id !== materialId);
        } else if (action === 'targetDate') {
          updatedBooks = updatedBooks.map(b => {
            if (b.id === materialId) {
              const prevDate = b.targetDate;
              let newPlans = b.detailedPlans || [];
              if (prevDate !== payload.targetDate && payload.targetDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const targetDate = new Date(payload.targetDate);
                targetDate.setHours(0, 0, 0, 0);
                const diffTime = targetDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const weeks = Math.max(1, Math.ceil(diffDays / 7));

                const { plans } = generateDetailedPlans(materialId, b.totalPages, 'book', 'weeks', weeks, b.currentPage, b.unit, b.reviewPasses || []);
                newPlans = plans;
              }
              return { ...b, targetDate: payload.targetDate || undefined, detailedPlans: newPlans, updatedAt: nowStr };
            }
            return b;
          });
        } else if (action === 'add') {
          const newBook: BookProgress = {
            id: `book_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: payload.title,
            totalPages: payload.total,
            currentPage: 0,
            targetDate: payload.targetDate || undefined,
            updatedAt: nowStr,
            category: payload.category || '기본',
            unit: payload.unit || 'p',
            goalType: 'weeks',
            goalValue: 4,
            goalDescription: '',
            estimatedMinutesPerUnit: payload.estimatedMinutesPerUnit,
            detailedPlans: []
          };
          if (payload.targetDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(payload.targetDate);
            targetDate.setHours(0, 0, 0, 0);
            const diffTime = targetDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const weeks = Math.max(1, Math.ceil(diffDays / 7));
            const { plans } = generateDetailedPlans(newBook.id, newBook.totalPages, 'book', 'weeks', weeks, 0, newBook.unit, [], undefined, undefined, undefined, sub);
            newBook.detailedPlans = plans;
            newBook.goalValue = weeks;
          }
          updatedBooks.push(newBook);
        } else if (action === 'edit') {
          updatedBooks = updatedBooks.map(b => {
            if (b.id === materialId) {
              const prevTotal = b.totalPages;
              const newTotal = payload.total;
              let newPlans = b.detailedPlans || [];

              if (prevTotal !== newTotal && b.targetDate) {
                const { plans } = generateDetailedPlans(
                  materialId,
                  newTotal,
                  'book',
                  b.goalType || 'weeks',
                  b.goalValue || 4,
                  Math.min(b.currentPage, newTotal),
                  b.unit,
                  b.reviewPasses || []
                );
                newPlans = plans;
              }
              return { 
                ...b, 
                title: payload.title, 
                totalPages: newTotal, 
                currentPage: Math.min(b.currentPage, newTotal), 
                estimatedMinutesPerUnit: payload.estimatedMinutesPerUnit !== undefined ? (payload.estimatedMinutesPerUnit === null ? undefined : payload.estimatedMinutesPerUnit) : b.estimatedMinutesPerUnit,
                detailedPlans: newPlans, 
                updatedAt: nowStr 
              };
            }
            return b;
          });
        }
      } else {
        if (action === 'inc') {
          updatedLectures = updatedLectures.map(l => l.id === materialId ? { ...l, completedLectures: Math.min(l.totalLectures, l.completedLectures + 1), updatedAt: nowStr } : l);
        } else if (action === 'dec') {
          updatedLectures = updatedLectures.map(l => l.id === materialId ? { ...l, completedLectures: Math.max(0, l.completedLectures - 1), updatedAt: nowStr } : l);
        } else if (action === 'setCurrent') {
          updatedLectures = updatedLectures.map(l => l.id === materialId ? { ...l, completedLectures: Math.min(l.totalLectures, Math.max(0, Number(payload.current) || 0)), updatedAt: nowStr } : l);
        } else if (action === 'delete') {
          updatedLectures = updatedLectures.filter(l => l.id !== materialId);
        } else if (action === 'targetDate') {
          updatedLectures = updatedLectures.map(l => {
            if (l.id === materialId) {
              const prevDate = l.targetDate;
              let newPlans = l.detailedPlans || [];
              if (prevDate !== payload.targetDate && payload.targetDate) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const targetDate = new Date(payload.targetDate);
                targetDate.setHours(0, 0, 0, 0);
                const diffTime = targetDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const weeks = Math.max(1, Math.ceil(diffDays / 7));

                const { plans } = generateDetailedPlans(materialId, l.totalLectures, 'lecture', 'weeks', weeks, l.completedLectures, undefined, l.reviewPasses || []);
                newPlans = plans;
              }
              return { ...l, targetDate: payload.targetDate || undefined, detailedPlans: newPlans, updatedAt: nowStr };
            }
            return l;
          });
        } else if (action === 'add') {
          const newLecture: LectureProgress = {
            id: `lec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: payload.title,
            totalLectures: payload.total,
            completedLectures: 0,
            targetDate: payload.targetDate || undefined,
            updatedAt: nowStr,
            category: payload.category || '기본',
            goalType: 'weeks',
            goalValue: 4,
            goalDescription: '',
            estimatedMinutesPerUnit: payload.estimatedMinutesPerUnit,
            detailedPlans: []
          };
          if (payload.targetDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(payload.targetDate);
            targetDate.setHours(0, 0, 0, 0);
            const diffTime = targetDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const weeks = Math.max(1, Math.ceil(diffDays / 7));
            const { plans } = generateDetailedPlans(newLecture.id, newLecture.totalLectures, 'lecture', 'weeks', weeks, 0, undefined, [], undefined, undefined, undefined, sub);
            newLecture.detailedPlans = plans;
            newLecture.goalValue = weeks;
          }
          updatedLectures.push(newLecture);
        } else if (action === 'edit') {
          updatedLectures = updatedLectures.map(l => {
            if (l.id === materialId) {
              const prevTotal = l.totalLectures;
              const newTotal = payload.total;
              const newSpeed = payload.speedMultiplier || 1.0;
              const speedChanged = l.speedMultiplier !== newSpeed;
              const totalChanged = prevTotal !== newTotal;
              let newPlans = l.detailedPlans || [];

              if ((totalChanged || speedChanged) && l.targetDate) {
                const { plans } = generateDetailedPlans(
                  materialId,
                  newTotal,
                  'lecture',
                  l.goalType || 'weeks',
                  l.goalValue || 4,
                  Math.min(l.completedLectures, newTotal),
                  undefined,
                  l.reviewPasses || [],
                  newSpeed,
                  payload.estimatedMinutesPerUnit !== undefined ? (payload.estimatedMinutesPerUnit === null ? undefined : payload.estimatedMinutesPerUnit) : l.estimatedMinutesPerUnit,
                  l.category
                );
                newPlans = plans;
              }
              return { 
                ...l, 
                name: payload.title, 
                totalLectures: newTotal, 
                completedLectures: Math.min(l.completedLectures, newTotal), 
                estimatedMinutesPerUnit: payload.estimatedMinutesPerUnit !== undefined ? (payload.estimatedMinutesPerUnit === null ? undefined : payload.estimatedMinutesPerUnit) : l.estimatedMinutesPerUnit,
                speedMultiplier: newSpeed,
                detailedPlans: newPlans, 
                updatedAt: nowStr 
              };
            }
            return l;
          });
        }
      }

      // 주간 계획 토글/수정 처리
      if (action === 'updatePlan') {
        if (type === 'book') {
          updatedBooks = updatedBooks.map(b => {
            if (b.id !== materialId) return b;
            return {
              ...b,
              detailedPlans: (b.detailedPlans || []).map(p => {
                if (p.weekNumber === payload.weekNumber) {
                  return {
                    ...p,
                    isCompleted: payload.isCompleted !== undefined ? payload.isCompleted : p.isCompleted,
                    rangeText: payload.rangeText !== undefined ? payload.rangeText : p.rangeText
                  };
                }
                return p;
              })
            };
          });
        } else {
          updatedLectures = updatedLectures.map(l => {
            if (l.id !== materialId) return l;
            return {
              ...l,
              detailedPlans: (l.detailedPlans || []).map(p => {
                if (p.weekNumber === payload.weekNumber) {
                  return {
                    ...p,
                    isCompleted: payload.isCompleted !== undefined ? payload.isCompleted : p.isCompleted,
                    rangeText: payload.rangeText !== undefined ? payload.rangeText : p.rangeText
                  };
                }
                return p;
              })
            };
          });
        }
      }

      return {
        ...sub,
        books: updatedBooks,
        lectures: updatedLectures,
        updatedAt: nowStr
      };
    });

    if (debounceTimersRef.current[student?.id || '']) {
      clearTimeout(debounceTimersRef.current[student?.id || '']);
    }

    setSubjectsState(updatedSubjects);
    setIsAutoSaving(true);

    if (action === 'add') {
      toast.success('학습 자료가 과목에 등록되었습니다. (자동 저장됨)');
      setNewBookTitle(prev => ({ ...prev, [subId]: '' }));
      setNewLectureName(prev => ({ ...prev, [subId]: '' }));
    } else if (action === 'targetDate') {
      toast.success('학습 목표일이 수정되고 주간 계획표가 생성/조정되었습니다. (자동 저장됨)');
    } else if (action === 'updatePlan') {
      toast.success('주간 계획이 업데이트되었습니다. (자동 저장됨)');
    } else if (action === 'delete') {
      toast.success('학습 자료가 삭제되었습니다. (자동 저장됨)');
    } else if (action === 'edit') {
      toast.success('학습 자료 정보가 수정되었습니다. (자동 저장됨)');
    }
  };

  // 3. 상담 추가 등록
  const clampProgressValue = (value: number, max: number) => {
    const safeMax = Math.max(0, max);
    if (!Number.isFinite(value)) return 0;
    return Math.min(safeMax, Math.max(0, Math.round(value)));
  };

  const setProgressDraft = (materialId: string, value: number, max: number) => {
    setProgressDrafts(prev => ({
      ...prev,
      [materialId]: clampProgressValue(value, max)
    }));
  };

  const clearProgressDraft = (materialId: string) => {
    setProgressDrafts(prev => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const updateConsultationDraft = (value: string, dirty = true) => {
    cslContentRef.current = value;
    setCslContent(value);
    const parsedDrafts = parseProgressFromConsultationContent(value, subjectsState, progressDrafts);
    setProgressDrafts(parsedDrafts);
    if (dirty) {
      setIsConsultationDraftDirty(true);
    }
  };

  const syncConsultationContent = (value: string) => {
    updateConsultationDraft(value, false);
  };

  const handleConsultationContentChange = (value: string) => {
    updateConsultationDraft(value, value !== cslContent);
  };

  const commitProgressValue = async (
    subId: string,
    type: 'book' | 'lecture',
    materialId: string,
    current: number,
    max: number
  ) => {
    if (loading) return; // 계획 생성 등의 로딩 중일 때는 진도 커밋 경합 차단
    const clamped = clampProgressValue(current, max);
    setProgressDraft(materialId, clamped, max);
    await updateProgress(subId, type, materialId, 'setCurrent', { current: clamped });
    clearProgressDraft(materialId);
  };

  const getMergedSubjects = (
    overrideDrafts?: Record<string, number>,
    applyPlanChanges: boolean = false
  ) => {
    const activeDrafts = overrideDrafts || progressDrafts;
    const nowStr = new Date().toISOString();

    const tempSubjects = subjectsState.map((subject) => {
      const preview = getConsultationPlanPreview(activeDrafts);
      const subjectChanges = preview.filter((item) => item.subjectId === subject.id && selectedConsultationPlanItems[item.selectionKey] !== false);

      return {
        ...subject,
        books: subject.books.map((book) => {
          const change = applyPlanChanges ? subjectChanges.find((item) => item.type === 'book' && item.materialId === book.id) : null;
          const draftProgress = activeDrafts[book.id];
          const newCurrentPage = draftProgress !== undefined ? draftProgress : book.currentPage;
          return change ? {
            ...book,
            currentPage: newCurrentPage,
            goalType: change.goalType,
            goalValue: change.goalValue,
            reviewPasses: change.reviewPasses,
            targetDate: change.targetDate === '미지정' ? undefined : change.targetDate,
            detailedPlans: change.plans,
            updatedAt: nowStr,
          } : (draftProgress !== undefined ? { ...book, currentPage: draftProgress, updatedAt: nowStr } : book);
        }),
        lectures: subject.lectures.map((lecture) => {
          const change = applyPlanChanges ? subjectChanges.find((item) => item.type === 'lecture' && item.materialId === lecture.id) : null;
          const draftProgress = activeDrafts[lecture.id];
          const newCompletedLectures = draftProgress !== undefined ? draftProgress : lecture.completedLectures;
          return change ? {
            ...lecture,
            completedLectures: newCompletedLectures,
            goalType: change.goalType,
            goalValue: change.goalValue,
            reviewPasses: change.reviewPasses,
            targetDate: change.targetDate === '미지정' ? undefined : change.targetDate,
            detailedPlans: change.plans,
            updatedAt: nowStr,
          } : (draftProgress !== undefined ? { ...lecture, completedLectures: draftProgress, updatedAt: nowStr } : lecture);
        }),
        updatedAt: nowStr,
      };
    });

    const currentText = cslContentRef.current;
    const { updatedSubjects: finalSubjects } = applyStudyScheduleFromConsultation(currentText, tempSubjects);

    return finalSubjects;
  };

  const handleAddConsultation = async (
    e?: React.FormEvent,
    overrideDrafts?: Record<string, number>,
    applyPlanChanges: boolean = false
  ): Promise<boolean> => {
    e?.preventDefault();
    const currentCslContent = cslContentRef.current;
    if (!currentCslContent.trim()) {
      toast.error('상담 내용을 입력해 주세요.');
      return false;
    }

    // 1. 메모리 상의 최종 subjects 머지 구성
    const mergedSubjects = getMergedSubjects(overrideDrafts, applyPlanChanges);

    if (debounceTimersRef.current[student?.id || '']) {
      clearTimeout(debounceTimersRef.current[student?.id || '']);
    }

    // 2. [Optimistic Update] UI 상태 즉시 변경
    setSubjectsState(mergedSubjects);
    setProgressDrafts({});

    if (applyPlanChanges) {
      const preview = getConsultationPlanPreview(overrideDrafts || progressDrafts).filter((item) => selectedConsultationPlanItems[item.selectionKey] !== false);
      const nextRanges = { ...weeklyPlanRanges };
      preview.forEach((item) => {
        item.plans.forEach((plan) => {
          nextRanges[`${item.materialId}_${plan.weekNumber}`] = plan.rangeText || '';
        });
      });
      setWeeklyPlanRanges(nextRanges);
    }

    setCslContent(currentCslContent);
    setLastSavedConsultationContent(currentCslContent);
    setIsConsultationDraftDirty(false);
    if (cslNextDate) setNextConsultationDate(cslNextDate);

    setLoading(true);
    setIsAutoSaving(true);
    const toastId = applyPlanChanges ? 'consultation-plan-save' : 'consultation-log-save';
    toast.loading(applyPlanChanges ? '상담 기록과 학습계획을 저장 중입니다.' : '상담 기록을 저장 중입니다.', { id: toastId });

    try {
      const res = await fetch(`/api/admin/students/${student.id}/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: cslDate,
          manager: cslManager,
          content: currentCslContent,
          nextConsultationDate: cslNextDate || undefined,
          type: 'learning',
          subjects: mergedSubjects
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAutoSaving(false);
        onUpdate(data.data);
        toast.success(applyPlanChanges ? '상담 기록과 학습계획이 저장되었습니다.' : '상담 기록이 저장되었습니다.', { id: toastId });
        return true;
      } else {
        setIsAutoSaving(true);
        toast.error(data.message || '상담 저장에 실패했습니다.', { id: toastId });
        return false;
      }
    } catch (err) {
      console.error('Consultation save error:', err);
      setIsAutoSaving(true);
      toast.error('네트워크 오류로 상담 저장에 실패했습니다. 다시 시도해 주세요.', { id: toastId });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const scrollToSubjectCard = (subjectName: string) => {
    setActiveTab('progress');
    const targetSubject = subjectsState.find((s) => s.name === subjectName);
    if (targetSubject) {
      setCollapsedSubjects((prev) => ({ ...prev, [targetSubject.id]: false }));
    }
    setTimeout(() => {
      const el = document.getElementById(`subject-card-${subjectName}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-[#0071E3]', 'ring-offset-2', 'transition-all', 'duration-300');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[#0071E3]', 'ring-offset-2');
        }, 1500);
      }
    }, 100);
  };

  const scrollToMaterial = (materialId: string, materialType: 'book' | 'lecture') => {
    setActiveTab('progress');
    let targetSubjectName = '';
    
    for (const subject of subjectsState) {
      if (materialType === 'book') {
        if (subject.books?.some((b) => b.id === materialId)) {
          targetSubjectName = subject.name;
          break;
        }
      } else {
        if (subject.lectures?.some((l) => l.id === materialId)) {
          targetSubjectName = subject.name;
          break;
        }
      }
    }

    if (targetSubjectName) {
      const targetSubject = subjectsState.find((s) => s.name === targetSubjectName);
      if (targetSubject) {
        setCollapsedSubjects((prev) => ({ ...prev, [targetSubject.id]: false }));
      }
    }

    setTimeout(() => {
      const el = document.getElementById(`material-card-${materialId}`) ||
                 (targetSubjectName ? document.getElementById(`subject-card-${targetSubjectName}`) : null);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-[#0071E3]', 'ring-offset-2', 'transition-all', 'duration-300');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-[#0071E3]', 'ring-offset-2');
        }, 1500);
      }
    }, 150);
  };



  // 상담 노션 양식 템플릿 불러오기
  const loadNotionTemplate = () => {
    const template = `# 목표 (인강 완강 및 교재 완독 계획)\n\n1. 국어 (과목 및 계획)\n- \n\n2. 영어 (과목 및 계획)\n- \n\n3. 한국사 (과목 및 계획)\n- \n\n4. 생활 관리 피드백\n- `;
    updateConsultationDraft(template);
    toast.info('상담 템플릿을 불러왔습니다.');
  };

  const loadEtcStudyTemplate = () => {
    const template = `# 기타 학습상담내역\n\n1. 파이널/단기 학습 목적\n- \n\n2. 오늘 확인한 약점 또는 막힌 지점\n- \n\n3. 짧은 공부 시간 활용 계획\n- \n\n4. 다음 확인 사항\n- `;
    updateConsultationDraft(template);
    toast.info('기타 학습상담 템플릿을 불러왔습니다.');
  };

  const getMaterialSummary = (subject: SubjectProgress) => {
    const bookSummaries = (subject.books || []).map((book) => {
      const total = Number(book.totalPages) || 0;
      const current = Number(book.currentPage) || 0;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      return `${book.title} ${current}/${total}${book.unit || 'p'} (${percent}%)`;
    });

    const lectureSummaries = (subject.lectures || []).map((lecture) => {
      const total = Number(lecture.totalLectures) || 0;
      const current = Number(lecture.completedLectures) || 0;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      return `${lecture.name} ${current}/${total}강 (${percent}%)`;
    });

    return [...bookSummaries, ...lectureSummaries];
  };

  const loadCurrentStudySummaryTemplate = async () => {
    const timeLabels: Record<string, string> = {
      morning: getStudyTimeSlot('morning')?.displayLabel || '오전',
      afternoon: getStudyTimeSlot('afternoon')?.displayLabel || '오후',
      night: getStudyTimeSlot('night')?.displayLabel || '야간',
      '': '시간대 미지정',
    };
    const dayLabels: Record<string, string> = {
      mon: '월',
      tue: '화',
      wed: '수',
      thu: '목',
      fri: '금',
      sat: '토',
      sun: '일',
    };

    const subjectLines = subjectsState.length > 0
      ? subjectsState.map((subject) => {
          const materials = getMaterialSummary(subject);
          return `- ${subject.name}: ${materials.length > 0 ? materials.join(' / ') : '등록된 교재·강의 없음'}`;
        }).join('\n')
      : '- 등록된 과목이 없습니다.';

    const scheduleLines = subjectsState.length > 0
      ? subjectsState.map((subject) => {
          const days = (subject.studyDays || []).map((day) => dayLabels[day] || day).join(', ') || '요일 미지정';
          const slot = getStudyTimeSlot(subject.studyTime || '');
          const timeText = slot
            ? `${slot.displayLabel} ${slot.timeRange} (${slot.periodLabel})`
            : timeLabels[subject.studyTime || ''] || '시간대 미지정';
          return `- ${subject.name}: ${timeText} / ${days}`;
        }).join('\n')
      : '- 등록된 시간표가 없습니다.';

    const nextDate = cslNextDate || nextConsultationDate || '미지정';

    // 실제 출결/순공 통계 주입 (리포트 API 재사용 — 실패해도 요약은 정상 생성)
    let attendanceBlock = '';
    try {
      const res = await fetch(`/api/report/${student.id}`, { cache: 'no-store' });
      const json = await res.json();
      const st = json?.studyStats;
      if (st) {
        const fmtStudyMin = (m: number) => {
          const total = Math.max(0, Math.round(m || 0));
          const h = Math.floor(total / 60);
          const mm = total % 60;
          return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`;
        };
        const attendText = `이번 주 출석: ${st.weekAttendedDays ?? 0}/${st.weekExpectedDays ?? 0}일`
          + ((st.weekAbsentDays ?? 0) > 0 ? ` (결석 ${st.weekAbsentDays}일)` : ' (개근)');
        const rankText = st.weekPercent != null ? `\n- 이번 주 순공 상위: 상위 ${st.weekPercent}%` : '';
        attendanceBlock = `\n\n[출결·순공 현황]\n- 이번 주 순공: ${fmtStudyMin(st.weekTotalMin)} / 이번 달: ${fmtStudyMin(st.monthTotalMin)}\n- ${attendText}${rankText}`;
      }
    } catch {
      // 출결 데이터 없이 진행
    }

    const template = `[현재 학습상황 요약]\n${subjectLines}\n\n[시간표 및 상담 일정]\n${scheduleLines}\n- 다음 상담 예정일: ${nextDate}${attendanceBlock}\n\n[진도 판단]\n- \n\n[이번 주 조치]\n- \n\n[다음 상담 확인 사항]\n- `;

    updateConsultationDraft(template);
    toast.info('현재 학습상황 요약을 상담 기록에 불러왔습니다.');
  };

  const handleLeaveAction = async (
    requestId: string,
    payload: { status?: 'approved' | 'rejected' | 'pending'; reply?: string }
  ) => {
    setLeaveActionBusy(prev => ({ ...prev, [requestId]: true }));
    try {
      const res = await fetch(`/api/admin/students/${student!.id}/leave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, ...payload }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const updated = leaveRequestsLocal.map(r =>
          r.id === requestId
            ? {
                ...r,
                ...(payload.status ? { status: payload.status as LeaveRequest['status'], reviewedAt: new Date().toISOString() } : {}),
                ...(payload.reply !== undefined ? { adminReply: payload.reply || undefined } : {}),
              }
            : r
        );
        setLeaveRequestsLocal(updated);
        onUpdate({ ...student!, leaveRequests: updated });
        if (payload.reply !== undefined) {
          setLeaveReplyDrafts(d => ({ ...d, [requestId]: '' }));
        }
        if (payload.status === 'approved') toast.success('승인했습니다.');
        else if (payload.status === 'rejected') toast.success('반려했습니다.');
        else if (payload.status === 'pending') toast.success('대기중으로 되돌렸습니다.');
        else if (payload.reply !== undefined) toast.success('답변을 보냈습니다.');
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setLeaveActionBusy(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleCouponAdjust = async (delta: number) => {
    try {
      const res = await fetch(`/api/admin/students/${student!.id}/leave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponDelta: delta }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setLeaveCouponsLocal(json.leaveCoupons);
        onUpdate({ ...student!, leaveCoupons: json.leaveCoupons });
        toast.success(`쿠폰 ${delta > 0 ? '+' : ''}${delta}개 처리됐습니다.`);
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    }
  };

  const findSubjectByMaterialId = (materialId: string) => {
    return subjectsState.find((subject) => {
      const hasBook = subject.books?.some((book) => book.id === materialId);
      const hasLecture = subject.lectures?.some((lecture) => lecture.id === materialId);
      return hasBook || hasLecture;
    });
  };

  const getLearningDaysUntil = (targetDate?: string, studyDays?: SubjectProgress['studyDays']) => {
    if (!targetDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    if (Number.isNaN(target.getTime()) || target < today) return 0;

    let days = 0;
    const cursor = new Date(today);
    while (cursor <= target) {
      if (isStudyDay(cursor, studyDays)) days += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  };

  const getExpectedAmountFromPlans = (plans?: DetailedPlan[]) => {
    if (!plans || plans.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const currentPlan = plans.find((plan) => plan.startDate <= today && today <= plan.endDate);
    const plan = currentPlan || plans.find((item) => item.endDate >= today) || plans[plans.length - 1];
    if (!plan?.rangeText) return null;
    const values = plan.rangeText.match(/\d+/g)?.map(Number) || [];
    return values.length > 0 ? values[values.length - 1] : null;
  };

  const getPlanStatus = (current: number, expected: number | null) => {
    if (expected === null) return '기준 계획 없음';
    if (current === expected) return '계획대로 진행';
    if (current > expected) return '계획보다 빠름';
    return current === 0 ? '진도 정체' : '계획보다 느림';
  };

  const buildAdjustedPlan = (
    material: BookProgress | LectureProgress,
    type: 'book' | 'lecture',
    mode: 'keepTargetDate' | 'keepPace'
  ) => {
    const totalAmount = type === 'book'
      ? (material as BookProgress).totalPages
      : (material as LectureProgress).totalLectures;
    const currentAmount = type === 'book'
      ? (material as BookProgress).currentPage
      : (material as LectureProgress).completedLectures;
    const remainingAmount = Math.max(0, totalAmount - currentAmount);
    const fallbackGoalType = material.goalType || 'weeks';
    const fallbackGoalValue = Number(material.goalValue) || 0;
    const reviewPasses = (material.reviewPasses || []).filter((pass) => pass.days > 0);

    if (remainingAmount <= 0 && reviewPasses.length === 0) {
      return {
        goalType: fallbackGoalType,
        goalValue: fallbackGoalValue,
        targetDate: material.targetDate || '',
        plans: [],
      };
    }

    let goalType: 'weeks' | 'weeklyAmount' | 'dailyAmount' | 'deadlineWeeks' = fallbackGoalType;
    let goalValue = fallbackGoalValue;
    const parentSubject = findSubjectByMaterialId(material.id);

    if (mode === 'keepTargetDate' && material.targetDate) {
      const learningDays = getLearningDaysUntil(material.targetDate, parentSubject?.studyDays);
      if (learningDays > 0) {
        const speed = (material as LectureProgress).speedMultiplier || 1.0;
        goalType = 'dailyAmount';
        goalValue = Math.max(1, Math.ceil((remainingAmount / learningDays) / speed));
      }
    }

    if (goalValue <= 0) {
      goalType = 'weeks';
      goalValue = 1;
    }

    const { plans, calculatedTargetDate } = generateDetailedPlans(
      material.id,
      totalAmount,
      type,
      goalType,
      goalValue,
      currentAmount,
      type === 'book' ? (material as BookProgress).unit : undefined,
      reviewPasses
    );

    return {
      goalType,
      goalValue,
      targetDate: mode === 'keepTargetDate' && material.targetDate ? material.targetDate : calculatedTargetDate,
      plans,
      reviewPasses,
    };
  };

  const getConsultationPlanPreview = (overrideDrafts?: Record<string, number>) => {
    const activeDrafts = overrideDrafts || progressDrafts;
    return subjectsState.flatMap((subject) => {
      const daysCount = getActiveStudyDayCount(subject.studyDays);

      const bookItems = (subject.books || []).map((book) => {
        const draftProgress = activeDrafts[book.id];
        const currentBook = draftProgress !== undefined ? { ...book, currentPage: draftProgress } : book;
        const selectionKey = `book:${book.id}`;
        const itemPlanMode = consultationPlanModes[selectionKey] || 'keepTargetDate';
        const adjusted = buildAdjustedPlan(currentBook, 'book', itemPlanMode);
        const current = currentBook.currentPage;
        const expected = getExpectedAmountFromPlans(currentBook.detailedPlans);

        let estimatedDailyAmount = 0;
        const remainingAmount = book.totalPages - current;
        if (adjusted.goalType === 'dailyAmount') {
          estimatedDailyAmount = adjusted.goalValue;
        } else if (adjusted.goalType === 'weeklyAmount') {
          estimatedDailyAmount = adjusted.goalValue / daysCount;
        } else if (adjusted.goalType === 'weeks') {
          const totalDays = (adjusted.goalValue || 1) * daysCount;
          estimatedDailyAmount = totalDays > 0 ? remainingAmount / totalDays : 0;
        }

        const isOverloaded = estimatedDailyAmount > 30;
        const warningMessage = isOverloaded
          ? `완료를 위해 시간이 더 필요합니다. (하루에 약 ${Math.round(estimatedDailyAmount)}p 학습 필요)`
          : null;

        return {
          selectionKey,
          planMode: itemPlanMode,
          subjectId: subject.id,
          subjectName: subject.name,
          materialId: book.id,
          type: 'book' as const,
          title: book.title,
          current,
          total: book.totalPages,
          unit: book.unit || 'p',
          status: getPlanStatus(current, expected),
          oldTargetDate: book.targetDate || '미지정',
          newTargetDate: adjusted.targetDate || '미지정',
          oldGoalLabel: book.goalType === 'dailyAmount' ? `하루 ${book.goalValue || 0}${book.unit || 'p'}`
            : book.goalType === 'weeklyAmount' ? `주당 ${book.goalValue || 0}${book.unit || 'p'}`
              : `${book.goalValue || 0}주 완성`,
          newGoalLabel: adjusted.goalType === 'dailyAmount' ? `하루 ${adjusted.goalValue}${book.unit || 'p'}`
            : adjusted.goalType === 'weeklyAmount' ? `주당 ${adjusted.goalValue}${book.unit || 'p'}`
              : `${adjusted.goalValue}주 완성`,
          firstPlanText: adjusted.plans[0]?.rangeText || '완료 또는 계획 없음',
          plans: adjusted.plans,
          reviewPasses: adjusted.reviewPasses || book.reviewPasses || [],
          goalType: adjusted.goalType,
          goalValue: adjusted.goalValue,
          targetDate: adjusted.targetDate,
          warningMessage,
        };
      });

      const lectureItems = (subject.lectures || []).map((lecture) => {
        const draftProgress = activeDrafts[lecture.id];
        const currentLecture = draftProgress !== undefined ? { ...lecture, completedLectures: draftProgress } : lecture;
        const selectionKey = `lecture:${lecture.id}`;
        const itemPlanMode = consultationPlanModes[selectionKey] || 'keepTargetDate';
        const adjusted = buildAdjustedPlan(currentLecture, 'lecture', itemPlanMode);
        const current = currentLecture.completedLectures;
        const expected = getExpectedAmountFromPlans(currentLecture.detailedPlans);

        let estimatedDailyAmount = 0;
        const remainingAmount = lecture.totalLectures - current;
        if (adjusted.goalType === 'dailyAmount') {
          estimatedDailyAmount = adjusted.goalValue;
        } else if (adjusted.goalType === 'weeklyAmount') {
          estimatedDailyAmount = adjusted.goalValue / daysCount;
        } else if (adjusted.goalType === 'weeks') {
          const totalDays = (adjusted.goalValue || 1) * daysCount;
          estimatedDailyAmount = totalDays > 0 ? remainingAmount / totalDays : 0;
        }

        const isOverloaded = estimatedDailyAmount > 3;
        const warningMessage = isOverloaded
          ? `완료를 위해 시간이 더 필요합니다. (하루에 약 ${Math.round(estimatedDailyAmount)}강 수강 필요)`
          : null;

        return {
          selectionKey,
          planMode: itemPlanMode,
          subjectId: subject.id,
          subjectName: subject.name,
          materialId: lecture.id,
          type: 'lecture' as const,
          title: lecture.name,
          current,
          total: lecture.totalLectures,
          unit: '강',
          status: getPlanStatus(current, expected),
          oldTargetDate: lecture.targetDate || '미지정',
          newTargetDate: adjusted.targetDate || '미지정',
          oldGoalLabel: lecture.goalType === 'dailyAmount' ? `하루 ${lecture.goalValue || 0}강`
            : lecture.goalType === 'weeklyAmount' ? `주당 ${lecture.goalValue || 0}강`
              : `${lecture.goalValue || 0}주 완성`,
          newGoalLabel: adjusted.goalType === 'dailyAmount' ? `하루 ${adjusted.goalValue}강`
            : adjusted.goalType === 'weeklyAmount' ? `주당 ${adjusted.goalValue}강`
              : `${adjusted.goalValue}주 완성`,
          firstPlanText: adjusted.plans[0]?.rangeText || '완료 또는 계획 없음',
          plans: adjusted.plans,
          reviewPasses: adjusted.reviewPasses || lecture.reviewPasses || [],
          goalType: adjusted.goalType,
          goalValue: adjusted.goalValue,
          targetDate: adjusted.targetDate,
          warningMessage,
        };
      });

      return [...bookItems, ...lectureItems];
    });
  };

  const applyConsultationPlanChanges = async (overrideDrafts?: Record<string, number>) => {
    if (!student) return false;
    const activeDrafts = overrideDrafts || progressDrafts;
    const preview = getConsultationPlanPreview(activeDrafts).filter((item) => selectedConsultationPlanItems[item.selectionKey] !== false);
    if (preview.length === 0) {
      toast.error('반영할 학습계획을 선택해 주세요.');
      return false;
    }
    const nowStr = new Date().toISOString();

    const updatedSubjects = subjectsState.map((subject) => {
      const subjectChanges = preview.filter((item) => item.subjectId === subject.id);

      return {
        ...subject,
        books: subject.books.map((book) => {
          const change = subjectChanges.find((item) => item.type === 'book' && item.materialId === book.id);
          const draftProgress = activeDrafts[book.id];
          const newCurrentPage = draftProgress !== undefined ? draftProgress : book.currentPage;
          return change ? {
            ...book,
            currentPage: newCurrentPage,
            goalType: change.goalType,
            goalValue: change.goalValue,
            targetDate: change.targetDate === '미지정' ? undefined : change.targetDate,
            detailedPlans: change.plans,
            updatedAt: nowStr,
          } : (draftProgress !== undefined ? { ...book, currentPage: draftProgress, updatedAt: nowStr } : book);
        }),
        lectures: subject.lectures.map((lecture) => {
          const change = subjectChanges.find((item) => item.type === 'lecture' && item.materialId === lecture.id);
          const draftProgress = activeDrafts[lecture.id];
          const newCompletedLectures = draftProgress !== undefined ? draftProgress : lecture.completedLectures;
          return change ? {
            ...lecture,
            completedLectures: newCompletedLectures,
            goalType: change.goalType,
            goalValue: change.goalValue,
            targetDate: change.targetDate === '미지정' ? undefined : change.targetDate,
            detailedPlans: change.plans,
            updatedAt: nowStr,
          } : (draftProgress !== undefined ? { ...lecture, completedLectures: draftProgress, updatedAt: nowStr } : lecture);
        }),
        updatedAt: nowStr,
      };
    });

    const updatedStudent: Student = buildSavePayload({
      subjects: updatedSubjects,
      updatedAt: nowStr,
    });

    const success = await saveStudentData(updatedStudent);
    if (success) {
      setSubjectsState(updatedSubjects);
      setProgressDrafts({});
      const nextRanges = { ...weeklyPlanRanges };
      preview.forEach((item) => {
        item.plans.forEach((plan) => {
          nextRanges[`${item.materialId}_${plan.weekNumber}`] = plan.rangeText || '';
        });
      });
      setWeeklyPlanRanges(nextRanges);
      toast.success('현재 진도 기준으로 학습 계획이 재조정되었습니다.');
    }
    return success;
  };

  const handleAddConsultationWithPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentText = cslContentRef.current;
    
    const latestDrafts = parseProgressFromConsultationContent(currentText, subjectsState, progressDrafts);
    syncConsultationContent(currentText);

    if (!currentText.trim()) {
      toast.error('상담 내용을 입력해 주세요.');
      return;
    }

    const preview = getConsultationPlanPreview(latestDrafts).filter((item) => selectedConsultationPlanItems[item.selectionKey] !== false);
    if (preview.length === 0) {
      toast.error('반영할 학습계획을 선택해 주세요.');
      return;
    }

    await handleAddConsultation(e, latestDrafts, true);
  };

  const handleAddConsultationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentText = cslContentRef.current;
    const latestDrafts = parseProgressFromConsultationContent(currentText, subjectsState, progressDrafts);
    syncConsultationContent(currentText);
    await handleAddConsultation(e, latestDrafts, false);
  };

  const dayLabelToKey = (label: string): NonNullable<SubjectProgress['studyDays']>[number] | null => {
    const map: Record<string, NonNullable<SubjectProgress['studyDays']>[number]> = {
      월: 'mon',
      화: 'tue',
      수: 'wed',
      목: 'thu',
      금: 'fri',
      토: 'sat',
      일: 'sun',
    };
    return map[label] || null;
  };

  const applyStudyScheduleFromConsultation = (content: string, baseSubjects: SubjectProgress[]) => {
    const subjectAliases: Record<string, string> = {
      행법: '행정법',
      행학: '행정학',
    };
    const knownSubjects = ['국어', '영어', '한국사', '행정법', '행정학', ...baseSubjects.map(subject => subject.name)];
    const uniqueSubjects = Array.from(new Set(knownSubjects));
    const updatedSubjects = baseSubjects.map(subject => ({
      ...subject,
      studyDays: [...(subject.studyDays || [])],
    }));
    let changed = false;

    const ensureSubject = (name: string) => {
      const normalizedName = subjectAliases[name] || name;
      let subject = updatedSubjects.find(item => item.name === normalizedName);
      if (!subject) {
        subject = {
          id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: normalizedName,
          learningGoal: '',
          studyTime: '',
          studyDays: [],
          books: [],
          lectures: [],
          updatedAt: new Date().toISOString(),
        };
        updatedSubjects.push(subject);
        changed = true;
      }
      return subject;
    };

    const lines = content.split('\n');

    // 1) 신규 형식 파싱: "- 과목명: 시간대 / 요일, 요일"
    lines.forEach(rawLine => {
      const line = rawLine.trim().replace(/\s+/g, ' ');
      if (!line) return;
      
      const match = line.match(/^-\s*([^:]+):\s*([^/]+?)\s*[\/\uFF0F]\s*(.+)$/);
      if (!match) return;

      const subjectNameRaw = match[1].trim();
      const timeStr = match[2].trim();
      const daysStr = match[3].trim();

      if (subjectNameRaw.includes('상담') || subjectNameRaw.includes('기존') || subjectNameRaw.includes('변경')) {
        return;
      }

      const normalizedName = subjectAliases[subjectNameRaw] || subjectNameRaw;
      const subject = ensureSubject(normalizedName);
      
      const dayKeys: SubjectProgress['studyDays'] = [];
      const rawDays = daysStr.split(/[\s,]+/);
      rawDays.forEach(d => {
        const cleanD = d.replace(/요일/g, '').trim();
        const key = dayLabelToKey(cleanD);
        if (key && !dayKeys.includes(key)) {
          dayKeys.push(key);
        }
      });

      const cleanOldDays = [...(subject.studyDays || [])].sort().join(',');
      const cleanNewDays = [...dayKeys].sort().join(',');

      let timeKey: SubjectProgress['studyTime'] = '';
      if (timeStr.includes('오전')) timeKey = 'morning';
      else if (timeStr.includes('오후')) timeKey = 'afternoon';
      else if (timeStr.includes('야간') || timeStr.includes('저녁')) timeKey = 'night';

      if (cleanOldDays !== cleanNewDays || subject.studyTime !== timeKey) {
        subject.studyDays = dayKeys;
        subject.studyTime = timeKey;
        subject.updatedAt = new Date().toISOString();
        changed = true;
      }
    });

    // 2) 구형 형식 파싱 (하위 호환성 유지)
    lines.forEach(rawLine => {
      const line = rawLine.trim().replace(/\s+/g, ' ');
      if (!line) return;
      const dayMatch = line.match(/^([월화수목금토일])(?:요일)?\s*(?:[-:]\s*|\s+)(.+)$/);
      if (!dayMatch) return;

      const dayKey = dayLabelToKey(dayMatch[1]);
      if (!dayKey) return;
      const body = dayMatch[2];
      const detectedSubjects = body.includes('전과목')
        ? uniqueSubjects.filter(name => name !== '기타')
        : uniqueSubjects.filter(name => body.includes(name) || Object.entries(subjectAliases).some(([alias, full]) => body.includes(alias) && full === name));

      detectedSubjects.forEach(name => {
        const subject = ensureSubject(name);
        if (!subject.studyDays?.includes(dayKey)) {
          subject.studyDays = [...(subject.studyDays || []), dayKey];
          subject.updatedAt = new Date().toISOString();
          changed = true;
        }
        if (body.includes('오전') && !subject.studyTime) {
          subject.studyTime = 'morning';
          changed = true;
        }
        if (body.includes('오후') && !subject.studyTime) {
          subject.studyTime = 'afternoon';
          changed = true;
        }
        if ((body.includes('야간') || body.includes('저녁')) && !subject.studyTime) {
          subject.studyTime = 'night';
          changed = true;
        }
      });
    });

    return { updatedSubjects, changed };
  };

  const parseQuickPlanLines = (text: string) => {
    return text
      .split('\n')
      .map(line => line.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map(rawLine => {
        // 숫자가 처음 나오기 이전 영역만 추출하여 요일/주기 기호 정제 (예: 월, 수, 금 -> 월수금)
        const firstDigitIndex = rawLine.search(/\d/);
        let beforeDigits = firstDigitIndex !== -1 ? rawLine.slice(0, firstDigitIndex) : rawLine;
        const afterDigits = firstDigitIndex !== -1 ? rawLine.slice(firstDigitIndex) : '';
        beforeDigits = beforeDigits.replace(/([월화수목금토일])\s*[\s,\/]\s*(?=[월화수목금토일])/g, '$1');
        const line = beforeDigits + afterDigits;

        // 1. [현재위치]/[총분량][단위] 패턴 매칭 — "행정법 기본강의 4강/64강" = 총 64강 중 4강까지 수강함
        //    (장, 문제, 세트, 과, 단원, ch, chpater, Ch, Chapter, 일차 등 커스텀 단위 포함)
        let totalAmount = 0;
        let currentAmount = 0;
        let unitText = '';
        let matchedIndex = -1;

        const slashMatch = line.match(/(\d+)\s*(?:강의|강|페이지|쪽|p|P|회|장|문제|세트|과|단원|ch|Ch|chapter|Chapter|일차)?\s*[\/\uFF0F]\s*(\d+)\s*(강의|강|페이지|쪽|p|P|회|장|문제|세트|과|단원|ch|Ch|chapter|Chapter|일차)$/i);
        if (slashMatch && slashMatch.index !== undefined) {
          currentAmount = Number(slashMatch[1]);
          totalAmount = Number(slashMatch[2]);
          unitText = slashMatch[3];
          matchedIndex = slashMatch.index;
        } else {
          // 2. 단일 [총분량][단위] 패턴 — 슬래시가 없으면 "현재 0, 총량 그 숫자"로 해석 (예: 64강 = 0/64강)
          const amountMatch = line.match(/(\d+)\s*(강의|강|페이지|쪽|p|P|회|장|문제|세트|과|단원|ch|Ch|chapter|Chapter|일차)$/i);
          if (!amountMatch || amountMatch.index === undefined) return null;
          totalAmount = Number(amountMatch[1]);
          currentAmount = 0;
          unitText = amountMatch[2];
          matchedIndex = amountMatch.index;
        }

        // 현재 위치가 총량보다 크면 오타(순서 뒤집힘) 가능성이 높으므로 조용히 캡하지 않고 오류로 표시
        const invalidReason = currentAmount > totalAmount
          ? `현재 위치(${currentAmount})가 총량(${totalAmount})보다 큽니다 — [현재/총량] 순서를 확인해 주세요`
          : '';
        currentAmount = Math.max(0, currentAmount);

        const lowerUnitText = unitText.toLowerCase();
        const type: 'book' | 'lecture' = lowerUnitText.includes('강') ? 'lecture' : 'book';

        // 단위 정규화 헬퍼
        const getCleanUnit = (rawUnit: string, materialType: 'book' | 'lecture'): string => {
          const lower = rawUnit.toLowerCase();
          if (lower.includes('강')) return '강';
          if (lower.includes('페이지') || lower === '쪽' || lower === 'p') return 'p';
          return rawUnit; // '회', '장', '문제', '세트', '과', '단원', '일차' 등은 그대로 반환
        };
        const unit = getCleanUnit(unitText, type);

        const beforeAmount = line.slice(0, matchedIndex).trim();
        const tokens = beforeAmount.split(' ').filter(Boolean);

        let cursor = 0;
        let cadence = '';
        let timeLabel = '';

        // 요일/주기 토큰 판별 함수
        const isDayToken = (token: string): boolean => {
          if (token === '매일') return true;
          const cleaned = token.replace(/^(매)/, '').replace(/(요일)/g, '').replace(/[\s,\/]+/g, '');
          if (!cleaned) return false;
          return /^[월화수목금토일]+$/.test(cleaned);
        };

        // 앞부분에서 요일/주기 관련 토큰들을 수집
        const cadenceTokens: string[] = [];
        while (cursor < tokens.length) {
          const token = tokens[cursor];
          if (token === '매') {
            cadenceTokens.push(token);
            cursor += 1;
            // '매' 다음 토큰이 요일 토큰이면 그것도 포함
            if (cursor < tokens.length && isDayToken(tokens[cursor])) {
              cadenceTokens.push(tokens[cursor]);
              cursor += 1;
            }
          } else if (isDayToken(token)) {
            cadenceTokens.push(token);
            cursor += 1;
          } else {
            break;
          }
        }

        if (cadenceTokens.length > 0) {
          cadence = cadenceTokens.join(' ');
        }

        if (cursor < tokens.length && ['오전', '오후', '야간', '저녁', '아침', '밤'].includes(tokens[cursor])) {
          timeLabel = tokens[cursor];
          cursor += 1;
        }

        const materialTokens = tokens.slice(cursor);
        if (materialTokens.length === 0 || totalAmount <= 0) return null;

        const subjectName = materialTokens[0];
        const title = materialTokens.join(' ');

        // 요일 다중 파싱 (매일 이면 월~일 전체, 월수금 등은 해당 요일들 추출)
        let studyDays: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = [];
        if (cadence.includes('매일')) {
          studyDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        } else {
          const dayMatches = cadence.match(/[월화수목금토일]/g);
          if (dayMatches) {
            studyDays = dayMatches
              .map(day => dayLabelToKey(day))
              .filter(Boolean) as Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
          }
        }

        return {
          original: line,
          subjectName,
          title,
          type,
          currentAmount,
          totalAmount,
          unit,
          cadence: cadence || '',
          timeLabel,
          studyTime: timeLabel === '오전' || timeLabel === '아침' ? 'morning' as const : timeLabel === '오후' ? 'afternoon' as const : timeLabel ? 'night' as const : '' as const,
          studyDays,
          invalidReason,
        };
      })
      .filter(Boolean) as QuickPlanPreviewItem[];
  };

  const quickPlanPreview = parseQuickPlanLines(debouncedQuickPlanText);

  const normalizeQuickPlanKeyPart = (value: string) => {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\-_()[\]{}.,:;|/\\]+/g, '');
  };

  const getQuickPlanMaterialKey = (plan: {
    subjectName: string;
    title: string;
    type: 'book' | 'lecture';
  }) => {
    return [
      normalizeQuickPlanKeyPart(plan.subjectName),
      plan.type,
      normalizeQuickPlanKeyPart(plan.title),
    ].join('|');
  };

  const handleApplyQuickPlan = async () => {
    if (isApplyingQuickPlan) return;

    const allParsedPlans = parseQuickPlanLines(quickPlanText);
    if (allParsedPlans.length === 0) {
      toast.error('예: 행정법 기본강의 4강/64강 형식으로 입력해 주세요. (총 64강 중 4강까지 들음)');
      return;
    }

    const invalidPlans = allParsedPlans.filter((plan) => plan.invalidReason);
    if (invalidPlans.length > 0) {
      toast.error(`입력 오류: ${invalidPlans[0].subjectName} - ${invalidPlans[0].title} — ${invalidPlans[0].invalidReason}${invalidPlans.length > 1 ? ` 외 ${invalidPlans.length - 1}건` : ''}`);
      return;
    }
    const parsedPlans = allParsedPlans;

    const existingPlanKeys = new Set<string>();
    subjectsState.forEach((subject) => {
      (subject.books || []).forEach((book) => {
        existingPlanKeys.add(getQuickPlanMaterialKey({
          subjectName: subject.name,
          title: book.title,
          type: 'book',
        }));
      });
      (subject.lectures || []).forEach((lecture) => {
        existingPlanKeys.add(getQuickPlanMaterialKey({
          subjectName: subject.name,
          title: lecture.name,
          type: 'lecture',
        }));
      });
    });

    const seenPlanKeys = new Set<string>();
    const duplicatePlanLabels: string[] = [];
    const uniquePlans = parsedPlans.filter((plan) => {
      const key = getQuickPlanMaterialKey(plan);
      if (existingPlanKeys.has(key)) {
        duplicatePlanLabels.push(`${plan.subjectName} - ${plan.title}`);
        return false;
      }
      if (seenPlanKeys.has(key)) {
        duplicatePlanLabels.push(`${plan.subjectName} - ${plan.title}`);
        return false;
      }
      seenPlanKeys.add(key);
      return true;
    });
    const skippedDuplicateCount = parsedPlans.length - uniquePlans.length;

    if (uniquePlans.length === 0) {
      const duplicateSummary = Array.from(new Set(duplicatePlanLabels)).slice(0, 3).join(', ');
      const hiddenDuplicateCount = Math.max(0, new Set(duplicatePlanLabels).size - 3);
      toast.info(`모두 중복이라 반영할 새 항목이 없습니다: ${duplicateSummary}${hiddenDuplicateCount > 0 ? ` 외 ${hiddenDuplicateCount}건` : ''}`);
      return;
    }

    const now = new Date().toISOString();
    const updatedSubjects: SubjectProgress[] = subjectsState.map(sub => ({
      ...sub,
      books: [...sub.books],
      lectures: [...sub.lectures],
    }));

    let skippedExistingPlanCount = 0;
    let appliedPlanCount = 0;

    uniquePlans.forEach(plan => {
      const normalizedSubjectName = normalizeQuickPlanKeyPart(plan.subjectName);
      const normalizedTitle = normalizeQuickPlanKeyPart(plan.title);
      let subject = updatedSubjects.find(sub => normalizeQuickPlanKeyPart(sub.name) === normalizedSubjectName);
      if (!subject) {
        subject = {
          id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: plan.subjectName,
          learningGoal: '',
          books: [],
          lectures: [],
          studyTime: plan.studyTime,
          studyDays: plan.studyDays || [],
          updatedAt: now,
        };
        updatedSubjects.push(subject);
      } else {
        if (plan.studyTime && !subject.studyTime) {
          subject.studyTime = plan.studyTime;
        }

        // 기존 요일에 중복되지 않게 여러 요일 추가
        if (plan.studyDays && plan.studyDays.length > 0) {
          const currentDays = subject.studyDays || [];
          const newDaysToAdd = plan.studyDays.filter(day => !currentDays.includes(day));
          if (newDaysToAdd.length > 0) {
            subject.studyDays = [...currentDays, ...newDaysToAdd];
          }
        }
      }

      // 빠른 입력은 "자료 + 현재 진도 위치" 등록만 담당한다.
      // 목표(기간/일일)와 상세 계획(detailedPlans)은 등록 후 자료별 '학습 목표 설정'에서 지정 —
      // 여기서 계획을 자동 생성하지 않는다(목표 관련 필드는 비워둠).
      if (plan.type === 'lecture') {
        const existing = subject.lectures.find(lecture => normalizeQuickPlanKeyPart(lecture.name) === normalizedTitle);
        if (existing) {
          skippedExistingPlanCount += 1;
          duplicatePlanLabels.push(`${plan.subjectName} - ${plan.title}`);
          return;
        } else {
          subject.lectures.push({
            id: `lec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: plan.title,
            totalLectures: plan.totalAmount,
            completedLectures: Math.min(plan.currentAmount, plan.totalAmount),
            updatedAt: now,
          });
          appliedPlanCount += 1;
        }
      } else {
        const existing = subject.books.find(book => normalizeQuickPlanKeyPart(book.title) === normalizedTitle);
        if (existing) {
          skippedExistingPlanCount += 1;
          duplicatePlanLabels.push(`${plan.subjectName} - ${plan.title}`);
          return;
        } else {
          subject.books.push({
            id: `book_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: plan.title,
            totalPages: plan.totalAmount,
            currentPage: Math.min(plan.currentAmount, plan.totalAmount),
            unit: plan.unit,
            updatedAt: now,
          });
          appliedPlanCount += 1;
        }
      }

      subject.updatedAt = now;
    });

    const totalDuplicateCount = skippedDuplicateCount + skippedExistingPlanCount;
    const duplicateSummary = Array.from(new Set(duplicatePlanLabels)).slice(0, 3).join(', ');
    const hiddenDuplicateCount = Math.max(0, new Set(duplicatePlanLabels).size - 3);

    if (appliedPlanCount === 0) {
      toast.info(`모두 중복이라 반영할 새 항목이 없습니다: ${duplicateSummary}${hiddenDuplicateCount > 0 ? ` 외 ${hiddenDuplicateCount}건` : ''}`);
      return;
    }

    const updatedStudent: Student = buildSavePayload({
      subjects: updatedSubjects,
      updatedAt: now,
    });

    setIsApplyingQuickPlan(true);
    try {
      const success = await saveStudentData(updatedStudent);
      if (success) {
        await Promise.all(uniquePlans.map(plan => fetch('/api/admin/shared-materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: plan.type,
            name: plan.title,
            subject: plan.subjectName,
            totalPagesOrLectures: plan.totalAmount,
          }),
        }).catch(() => null)));
        setSubjectsState(updatedSubjects);
        setQuickPlanText('');
        toast.success(totalDuplicateCount > 0
          ? `자료와 현재 진도가 등록되었습니다. 중복 제외: ${duplicateSummary}${hiddenDuplicateCount > 0 ? ` 외 ${hiddenDuplicateCount}건` : ''}`
          : '자료와 현재 진도가 등록되었습니다. 목표는 자료별 학습 목표 설정에서 지정해 주세요.');
      }
    } finally {
      setIsApplyingQuickPlan(false);
    }
  };

  // 4. 성적 추가 등록
  const handleAddGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeTestName.trim()) {
      toast.error('시험명을 입력해 주세요.');
      return;
    }

    const scoreVal = Number(gradeScore) || 0;

    // 시험 유형 및 과목별 적정 만점(최대 한계값) 동적 판별
    let maxAllowedScore = 100;
    const testNameLower = gradeTestName.toLowerCase();
    const subjectTrimmed = gradeSubject.trim();

    if (testNameLower.includes('모의고사') || testNameLower.includes('모평') || testNameLower.includes('학평') || testNameLower.includes('수능')) {
      if (testNameLower.includes('표점') || testNameLower.includes('표준점수')) {
        maxAllowedScore = 200;
      } else if (subjectTrimmed.includes('사탐') || subjectTrimmed.includes('과탐') || subjectTrimmed.includes('탐구') || subjectTrimmed === '한국사') {
        maxAllowedScore = 50;
      } else {
        maxAllowedScore = 100;
      }
    } else if (testNameLower.includes('주간테스트') || testNameLower.includes('단원평가') || testNameLower.includes('일일테스트') || testNameLower.includes('테스트')) {
      maxAllowedScore = 100;
    } else {
      maxAllowedScore = 200;
    }

    if (!Number.isFinite(scoreVal) || scoreVal < 0 || scoreVal > maxAllowedScore) {
      toast.error(`점수를 0~${maxAllowedScore} 사이로 입력해 주세요. (판별된 시험/과목 만점: ${maxAllowedScore}점)`);
      return;
    }

    const newGrade: GradeItem = {
      id: `grade_${Date.now()}`,
      testName: gradeTestName,
      subject: gradeSubject,
      score: scoreVal,
      date: gradeDate
    };

    const updatedStudent: Student = buildSavePayload({
      grades: [...student.grades, newGrade],
    });

    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('성적이 추가되었습니다.');
        onUpdate(data.data);
        setGradeTestName('');
      } else {
        toast.error(data.message || '성적 등록 실패');
      }
    } catch (err) {
      toast.error('네트워크 에러');
    }
  };

  // 성적 삭제
  const handleDeleteGrade = async (gradeId: string) => {
    if (!(await confirm({ title: '이 성적 기록을 삭제할까요?', description: '추세 그래프에서도 함께 제거됩니다.', tone: 'danger', confirmText: '삭제' }))) return;
    const updatedStudent: Student = buildSavePayload({
      grades: student.grades.filter(g => g.id !== gradeId),
    });

    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('성적 항목이 삭제되었습니다.');
        onUpdate(data.data);
      } else {
        toast.error(data.message || '성적 삭제 실패');
      }
    } catch (err) {
      toast.error('네트워크 에러');
    }
  };

  // 5. 학생 삭제
  const handleSetPassword = async () => {
    const pw = await prompt({
      title: `${name} 학생 포털 비밀번호`,
      description: '4자 이상으로 입력하세요.',
      placeholder: '새 비밀번호',
    });
    if (pw === null) return;
    if (pw.trim().length < 4) {
      toast.error('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/students/${student.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('포털 비밀번호가 설정되었습니다.');
      } else {
        toast.error(data.message || '비밀번호 설정에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 비밀번호 설정에 실패했습니다.');
    }
  };

  const handleSaveNotify = async (info: { parentPhone: string; studentPhone: string; smsTargets: Array<'parent' | 'student'> }) => {
    try {
      const res = await fetch(`/api/admin/students/${student.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('출결 알림 설정이 저장되었습니다.');
        onUpdate({ ...student, parentPhone: info.parentPhone, studentPhone: info.studentPhone, smsTargets: info.smsTargets });
      } else {
        toast.error(data.message || '알림 설정 저장에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 알림 설정 저장에 실패했습니다.');
    }
  };

  const handleDeleteStudent = async () => {
    if (!(await confirm({
      title: `${name} 원생을 정말 삭제할까요?`,
      description: '모든 시트에서 관련 데이터가 복구 불가능하게 지워집니다.',
      tone: 'danger',
      confirmText: '삭제',
    }))) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('원생이 안전하게 삭제되었습니다.');
        onDelete(student.id);
        onClose();
      } else {
        toast.error('원생 삭제에 실패했습니다.');
      }
    } catch (err) {
      toast.error('네트워크 에러');
    } finally {
      setLoading(false);
    }
  };

  // 성적 차트용 데이터 조립 (최신순 -> 과거순 정렬되어 있으므로 그래프를 위해 날짜순 정렬 필요)
  const chartData = getGradeChartData(student.grades);
  const gradeSubjects = getGradeSubjects(student.grades);
  const materialBenchmarks = buildMaterialBenchmarks(students);

  // 좌석 충돌 — 같은 센터에 동일 좌석번호를 쓰는 다른 원생(본인·0번·미지정 제외)
  const seatConflictNames = (() => {
    const parsed = seatNumber !== '' ? Number(seatNumber) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) return [];
    return students
      .filter((s) => s.id !== student.id && s.campus === campus && s.seatNumber === parsed)
      .map((s) => s.name);
  })();

  const subjects = Array.from(new Set([
    '국어', '영어', '수학', '한국사', '기타',
    ...subjectsState.map(s => s.name)
  ]));

  const consultationPlanPreview = getConsultationPlanPreview();
  const selectedPlanCount = consultationPlanPreview.filter((item) => selectedConsultationPlanItems[item.selectionKey] !== false).length;
  const hasProgressDraftChanges = subjectsState.some((subject) => {
    const hasBookDraft = (subject.books || []).some((book) => {
      const draftProgress = progressDrafts[book.id];
      return draftProgress !== undefined && draftProgress !== book.currentPage;
    });
    const hasLectureDraft = (subject.lectures || []).some((lecture) => {
      const draftProgress = progressDrafts[lecture.id];
      return draftProgress !== undefined && draftProgress !== lecture.completedLectures;
    });
    return hasBookDraft || hasLectureDraft;
  });
  const hasPendingConsultationChanges = isConsultationDraftDirty || hasProgressDraftChanges || isConsultationPlanDirty;
  const hasPendingSaveChanges = isAutoSaving || hasPendingConsultationChanges;

  const resetLocalDrafts = () => {
    if (!student) return;
    setName(student.name || '');
    setLoginId(student.loginId || '');
    setCampus(student.campus || 'wonju');
    setManager(student.manager || '');
    setContact(student.contact || '');
    setLifeComment(student.lifeComment || '');
    setStudentLifeComment(student.studentLifeComment || '');
    setSpecialNote(student.specialNote || '');
    setNextConsultationDate(student.nextConsultationDate || '');
    setEnrollmentEndDate(student.enrollmentEndDate || '');
    setWeeklyGradeCheck(Boolean(student.weeklyGradeCheck));
    setSeatNumber(student.seatNumber != null ? String(student.seatNumber) : '');
    setSubjectsState(student.subjects || []);
    setProgressDrafts({});
    setCslContent('');
    cslContentRef.current = '';
    setLastSavedConsultationContent('');
    setIsConsultationDraftDirty(false);
    setIsConsultationPlanDirty(false);
    setConsultationPlanModes({});
    setIsAutoSaving(false);
  };

  const requestClose = (afterClose?: () => void) => {
    if (loading) return;
    afterCloseActionRef.current = afterClose || null;
    if (hasPendingSaveChanges) {
      setIsCloseConfirmOpen(true);
      return;
    }
    const closeAction = afterCloseActionRef.current;
    afterCloseActionRef.current = null;
    onClose();
    closeAction?.();
  };

  const handleDiscardAndClose = () => {
    const afterClose = afterCloseActionRef.current;
    afterCloseActionRef.current = null;
    resetLocalDrafts();
    setIsCloseConfirmOpen(false);
    onClose();
    afterClose?.();
  };

  const handleSaveAndClose = async () => {
    const saved = await handleManualSave();
    if (saved) {
      const afterClose = afterCloseActionRef.current;
      afterCloseActionRef.current = null;
      setIsCloseConfirmOpen(false);
      onClose();
      afterClose?.();
    }
  };



  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => {
      if (!open) requestClose();
    }}>
      <SheetContent className="w-full sm:max-w-2xl bg-white border-l border-black/[0.05] p-0 font-sans text-slate-900">
        
        {/* 상시 플로팅 마스터 저장 버튼 & 동기화 뱃지 (X 버튼 바로 왼쪽 옆에 배치) */}
        <div className="absolute top-3 right-12 z-50 flex items-center gap-2">
          {loading || isAutoSaving ? (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold bg-[#FF9500]/15 border border-[#FF9500]/30 text-[#FF9500] px-2 py-0.5 rounded-full shadow-sm transition-all duration-300">
              <span className="w-3 h-3 rounded-full border border-[#FF9500]/50 border-t-[#FF9500] animate-spin shrink-0" />
              저장 중...
            </span>
          ) : hasPendingConsultationChanges ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-[#FF9500]/10 border border-[#FF9500]/25 text-[#D27C00] px-2 py-0.5 rounded-full shadow-sm transition-all duration-300">
              <span className="w-1 h-1 rounded-full bg-[#FF9500]"></span>
              저장 필요
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-[#34C759]/15 border border-[#34C759]/30 text-[#34C759] px-2 py-0.5 rounded-full shadow-sm transition-all duration-300">
              <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              동기화 완료
            </span>
          )}
          
          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={loading}
            className="bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-lg text-xs h-7.5 px-3 font-bold flex items-center justify-center gap-1 shadow-[0_4px_12px_rgba(0,113,227,0.2)] transition-all hover:scale-102 active:scale-98"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            <span>저장</span>
          </Button>
        </div>

        <div className="admin-fluid-ui w-full h-full overflow-y-auto flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>원생 상세 정보</SheetTitle>
            <SheetDescription>원생 상세 프로필 및 학습 진도를 관리하는 화면입니다.</SheetDescription>
          </SheetHeader>
        
        {/* Header (Notion Page Title Banner) */}
        <div className="bg-slate-900 text-white p-6 md:p-8 relative flex flex-col gap-5">
          {/* Top Row: Title, Metadata, Status */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
            <div className="min-w-0 w-full">
              {unauthorizedCheckoutText && !isAlertDismissed && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 pr-36 md:pr-40 text-xs font-semibold text-red-400 mb-4 relative transition-all duration-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{unauthorizedCheckoutText}</span>
                  <button
                    type="button"
                    onClick={() => setIsAlertDismissed(true)}
                    className="absolute right-3.5 bottom-3 text-red-400 hover:text-red-300 hover:bg-red-500/20 p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                    title="알림 닫기"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[9px] font-bold tracking-[0.2em] text-slate-500 uppercase block">
                  Student Profile Detail
                </span>
              </div>
              <h2 className="text-[17px] font-semibold tracking-tight">{student.name}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {student.campus === 'wonju' ? '원주 캠퍼스' : student.campus === 'chuncheon' ? '춘천 캠퍼스' : student.campus === 'chungju' ? '충주 캠퍼스' : '기타/퇴원'} · {student.manager || '담당 관리자'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {(() => {
                  const todayTotalStudyMin = getStudentTodayTotalStudyTimeMin(student);
                  const studyHours = Math.floor(todayTotalStudyMin / 60);
                  const studyMins = Math.round(todayTotalStudyMin % 60);
                  return (
                    <span className="inline-flex items-center text-[10px] font-semibold bg-[#0071E3]/20 border border-[#0071E3]/40 text-[#3894FF] px-2 py-0.5 rounded shadow-sm">
                      오늘 예상 공부: {studyHours > 0 ? `${studyHours}시간 ` : ''}{studyMins}분
                    </span>
                  );
                })()}
                {(() => {
                  const { distractions } = getPomodoroStatsFromStudent(student);
                  if (!distractions) return null;
                  return (
                    <span className="inline-flex items-center text-[10px] font-semibold bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2 py-0.5 rounded shadow-sm" title="뽀모도로 집중 중 창 전환·알트탭 횟수">
                      오늘 집중이탈: {distractions}회
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Bottom Row: Actions Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/10 w-full justify-start">
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestClose()}
              className="bg-transparent border-white/20 hover:bg-white/10 text-white rounded-lg text-xs h-8.5 px-3 shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              목록
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestClose(() => router.push('/admin/dashboard'))}
              className="bg-transparent border-white/20 hover:bg-white/10 text-white rounded-lg text-xs h-8.5 px-3 shrink-0"
            >
              <Home className="w-3.5 h-3.5 mr-1" />
              홈
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/report/${student.id}?audience=student`, '_blank')}
              className="bg-transparent border-white/20 hover:bg-white/10 text-white rounded-lg text-xs h-8.5 px-3 shrink-0"
            >
              <User className="w-3.5 h-3.5 mr-1" />
              <span>학생페이지 보기</span>
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/report/${student.id}?audience=parent`, '_blank')}
              className="bg-transparent border-white/20 hover:bg-white/10 text-white rounded-lg text-xs h-8.5 px-3 shrink-0"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              <span>학부모용 출력</span>
            </Button>

          </div>
        </div>

        <div className="p-6">
          {pendingRequests.length > 0 && (
            <div className="mb-6 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{pendingRequests.length}</span>
                <h4 className="text-xs font-semibold text-amber-800">학생 변경 신청 (대기중)</h4>
              </div>
              <div className="space-y-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="space-y-2.5 rounded-xl border border-amber-100 bg-white p-3">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">{getRequestTypeLabel(req.requestType)}</span>
                      <span className="font-semibold text-slate-400">{req.date}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs font-semibold text-slate-700">{req.content}</p>

                    {req.proposedGoal && (
                      <div 
                        onClick={() => scrollToMaterial(req.proposedGoal?.materialId ?? '', req.proposedGoal?.materialType ?? 'book')}
                        className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 text-[10px] space-y-1 my-1.5 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-[0.99] group"
                        title="클릭하여 학습 현황 확인 및 스크롤"
                      >
                        <p className="font-semibold text-[#0071E3] flex items-center gap-1">제안된 학습 계획 변경 사항</p>
                        <p className="font-bold text-slate-600">
                          • 대상: {req.proposedGoal.materialType === 'book' ? '교재' : '인강'}
                        </p>
                        {req.proposedGoal.proposedWeekNumber && req.proposedGoal.proposedRangeText && (
                          <p className="font-bold text-slate-600">
                            • {req.proposedGoal.proposedWeekNumber}주차 범위: <span className="text-[#0071E3] font-semibold">{req.proposedGoal.proposedRangeText}</span>
                          </p>
                        )}
                        {req.proposedGoal.goalValue > 0 && (
                          <p className="font-bold text-slate-600">
                            • 기준 값: {req.proposedGoal.goalType === 'weeks' ? '총 주 수' : req.proposedGoal.goalType === 'weeklyAmount' ? '주당 목표' : '하루 목표'} ({req.proposedGoal.goalValue})
                          </p>
                        )}
                        {req.proposedGoal.targetDate && (
                          <p className="font-bold text-slate-600">
                            • 완독 목표일: {req.proposedGoal.targetDate}
                          </p>
                        )}
                      </div>
                    )}

                    {(sentReplies[req.id] ?? req.adminReply) && (
                      <div className="rounded-lg border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-[#0071E3]">
                        내 답변: {sentReplies[req.id] ?? req.adminReply}
                      </div>
                    )}

                    {/* 빠른 답변(원탭) */}
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REPLIES.map((qr) => (
                        <button
                          key={qr}
                          type="button"
                          disabled={resolvingReqId === req.id}
                          onClick={() => setReplyDrafts((d) => ({ ...d, [req.id]: (d[req.id]?.trim() ? d[req.id].trim() + ' ' : '') + qr }))}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] disabled:opacity-50"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>

                    {/* 직접 답변 + 처리 */}
                    <div className="flex items-center gap-1.5">
                      <input
                        value={replyDrafts[req.id] ?? ''}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [req.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (replyDrafts[req.id] || '').trim()) {
                            e.preventDefault();
                            actOnRequest(req.id, { reply: (replyDrafts[req.id] || '').trim() });
                          }
                        }}
                        placeholder="답변 직접 입력..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingReqId === req.id || !(replyDrafts[req.id] || '').trim()}
                        onClick={() => actOnRequest(req.id, { reply: (replyDrafts[req.id] || '').trim() })}
                        className="h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-bold"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="sr-only">답변 전송</span>
                      </Button>
                      
                      {req.proposedGoal ? (
                        <Button
                          size="sm"
                          disabled={resolvingReqId === req.id}
                          onClick={() => actOnRequest(req.id, { status: 'resolved', reply: (replyDrafts[req.id] || '').trim() || '신청이 승인되어 학습 계획에 즉시 반영되었습니다.' })}
                          className="h-8 shrink-0 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] px-2.5 text-[11px] font-bold text-white approve-plan-btn"
                        >
                          {resolvingReqId === req.id ? '승인 중' : '승인 및 계획 반영'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={resolvingReqId === req.id}
                          onClick={() => actOnRequest(req.id, { status: 'resolved', reply: (replyDrafts[req.id] || '').trim() || undefined })}
                          className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          {resolvingReqId === req.id ? '처리 중' : '처리완료'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingSuggestions.length > 0 && (
            <div className="mb-6 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">{pendingSuggestions.length}</span>
                <h4 className="text-xs font-semibold text-amber-800">건의사항 (대기중)</h4>
              </div>
              <div className="space-y-2">
                {pendingSuggestions.map(req => (
                  <div key={req.id} className="space-y-2.5 rounded-xl border border-amber-100 bg-white p-3">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">건의사항</span>
                      <span className="font-semibold text-slate-400">{req.date}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs font-semibold text-slate-700">{req.content}</p>

                    {(sentReplies[req.id] ?? req.adminReply) && (
                      <div className="rounded-lg border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-[#0071E3]">
                        내 답변: {sentReplies[req.id] ?? req.adminReply}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REPLIES.map((qr) => (
                        <button
                          key={qr}
                          type="button"
                          disabled={resolvingReqId === req.id}
                          onClick={() => setReplyDrafts((d) => ({ ...d, [req.id]: (d[req.id]?.trim() ? d[req.id].trim() + ' ' : '') + qr }))}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] disabled:opacity-50"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        value={replyDrafts[req.id] ?? ''}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [req.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (replyDrafts[req.id] || '').trim()) {
                            e.preventDefault();
                            actOnSuggestion(req.id, { reply: (replyDrafts[req.id] || '').trim() });
                          }
                        }}
                        placeholder="답변 직접 입력..."
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolvingReqId === req.id || !(replyDrafts[req.id] || '').trim()}
                        onClick={() => actOnSuggestion(req.id, { reply: (replyDrafts[req.id] || '').trim() })}
                        className="h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-bold"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span className="sr-only">답변 전송</span>
                      </Button>
                      <Button
                        size="sm"
                        disabled={resolvingReqId === req.id}
                        onClick={() => actOnSuggestion(req.id, { status: 'resolved', reply: (replyDrafts[req.id] || '').trim() || undefined })}
                        className="h-8 shrink-0 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                      >
                        {resolvingReqId === req.id ? '처리 중' : '처리완료'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 지난 요청/처리 내역 보기 */}
          {(() => {
            const resolvedRequests = (student.consultationLogs || [])
              .filter(log => log.type === 'request' && log.status === 'resolved');
            const resolvedSuggestions = (student.consultationLogs || [])
              .filter(log => log.type === 'suggestion' && log.status === 'resolved');
            const completedLeaves = (leaveRequestsLocal || [])
              .filter(req => req.status !== 'pending');

            const totalHistoryCount = resolvedRequests.length + resolvedSuggestions.length + completedLeaves.length;

            if (totalHistoryCount === 0) return null;

            return (
              <div className="mb-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:border-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" />
                    <span>지난 요청/처리 내역 <span className="font-normal text-slate-400">({totalHistoryCount}건)</span></span>
                  </div>
                  {showHistory
                    ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {showHistory && (
                  <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 max-h-96 overflow-y-auto">
                    {[
                      ...resolvedRequests.map(r => ({ ...r, category: 'request' as const })),
                      ...resolvedSuggestions.map(r => ({ ...r, category: 'suggestion' as const })),
                      ...completedLeaves.map(r => ({
                        id: r.id,
                        date: r.date,
                        createdAt: r.createdAt,
                        manager: '학생 신청',
                        content: r.reason || '(사유 없음)',
                        type: 'leave' as const,
                        category: 'leave' as const,
                        leaveType: r.type,
                        status: r.status,
                        adminReply: r.adminReply,
                        resolvedAt: r.reviewedAt,
                      }))
                    ]
                      .sort((a, b) => {
                        const timeA = a.createdAt || a.date || '';
                        const timeB = b.createdAt || b.date || '';
                        return timeB.localeCompare(timeA);
                      })
                      .map(item => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              {item.category === 'request' && (
                                <>
                                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    <MessageSquare className="w-2.5 h-2.5" />{getRequestTypeLabel(item.requestType)}
                                  </span>
                                  <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    처리완료
                                  </span>
                                </>
                              )}
                              {item.category === 'suggestion' && (
                                <>
                                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    <MessageSquare className="w-2.5 h-2.5" />건의사항
                                  </span>
                                  <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    처리완료
                                  </span>
                                </>
                              )}
                              {item.category === 'leave' && (
                                <>
                                  <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    <Calendar className="w-2.5 h-2.5" />{LEAVE_TYPES[item.leaveType!]?.icon} {getLeaveTypeLabel(item.leaveType!)}
                                  </span>
                                  {item.status === 'approved' ? (
                                    <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                      승인
                                    </span>
                                  ) : (
                                    <span className="shrink-0 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                      반려
                                    </span>
                                  )}
                                </>
                              )}
                              <span className="shrink-0 text-[10px] font-semibold text-slate-400">{item.date}</span>
                            </span>
                            {item.resolvedAt && (
                              <span className="shrink-0 text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                                {new Date(item.resolvedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 처리
                              </span>
                            )}
                          </div>
                          {item.content && item.content !== '(사유 없음)' && (
                            <p className="whitespace-pre-wrap break-words text-slate-600">{item.content}</p>
                          )}
                          {!item.content || item.content === '(사유 없음)' ? (
                            <p className="text-slate-400 italic">(내용 없음)</p>
                          ) : null}
                          {item.adminReply && (
                            <div className="flex items-start gap-1.5 rounded-lg border border-[#0071E3]/15 bg-[#0071E3]/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-[#0071E3]">
                              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>{item.adminReply}</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })()}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-6 bg-[#F5F5F7] p-1 rounded-xl mb-6 min-w-0 overflow-hidden">
              <TabsTrigger id="admin-tab-progress" value="progress" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">학습 관리</span>
                <span className="sm:hidden">학습</span>
              </TabsTrigger>
              <TabsTrigger id="admin-tab-consult" value="consult" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">생활 관리</span>
                <span className="sm:hidden">생활</span>
              </TabsTrigger>
              <TabsTrigger id="admin-tab-grades" value="grades" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <Award className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">성적 관리</span>
                <span className="sm:hidden">성적</span>
              </TabsTrigger>
              <TabsTrigger id="admin-tab-penalty" value="penalty" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">벌점 관리</span>
                <span className="sm:hidden">벌점</span>
              </TabsTrigger>
              <TabsTrigger id="admin-tab-info" value="info" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">학생 정보</span>
                <span className="sm:hidden">정보</span>
              </TabsTrigger>
              <TabsTrigger id="admin-tab-ddays" value="ddays" className="admin-detail-tab text-xs font-semibold rounded-lg py-2.5 px-1">
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">D-Day</span>
                <span className="sm:hidden">D-Day</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: 과목 설정 및 학습 진도 DB */}
            <TabsContent value="progress" className="space-y-6 outline-none">
              <DetailSheetProvider value={{
                studentId: student.id,
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
                handleToggleSubjectStudyDay,
                handleUpdateSubjectStudyTime,
                hasSearchedIntegrated,
                integratedSearchResults,
                integratedSearchTimerRef,
                isAutoSaving,
                isApplyingQuickPlan,
                isCustomUnit,
                isLearningInputOpen,
                isSearchingIntegrated,
                consultationPlanPreview,
                cslContentRef,
                getMaterialSummary,
                isConsultationDraftDirty,
                lastSavedConsultationContent,
                learningInputMode,
                learningLogs,
                loadCurrentStudySummaryTemplate,
                loadEtcStudyTemplate,
                loadNotionTemplate,
                scrollToSubjectCard,
                selectedConsultationPlanItems,
                selectedPlanCount,
                setCslContent,
                setConsultationPlanModes,
                setIsConsultationDraftDirty,
                setIsConsultationPlanDirty,
                setLastSavedConsultationContent,
                setSelectedConsultationPlanItems,
                syncConsultationContent,
                loading,
                lifeComment,
                setLifeComment,
                studentLifeComment,
                setStudentLifeComment,
                handleSaveLifeComment,
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
                subjectsState,
                updateBookGoalField,
                updateLectureGoalField,
                updateProgress,
                updateReviewPassSetting,
                wasOpenRef,
                weeklyPlanRanges,
              }}>
                <ProgressTab />
              </DetailSheetProvider>
            </TabsContent>

            {/* TAB 2: 생활 관리 */}
            <TabsContent value="consult" className="space-y-6 outline-none">
              <ConsultTab
                lifeComment={lifeComment}
                setLifeComment={setLifeComment}
                studentLifeComment={studentLifeComment}
                setStudentLifeComment={setStudentLifeComment}
                lifeLogs={lifeLogs}
                studyStats={studyStats}
                todayAttendanceStatus={todayAttendanceStatus}
                todayActivityKey={todayActivityKey}
                todayPomodoroStats={todayPomodoroStats}
                todayChecklist={todayChecklist}
                leaveRequests={leaveRequestsLocal}
                leaveCoupons={leaveCouponsLocal}
                leaveActionBusy={leaveActionBusy}
                leaveReplyDrafts={leaveReplyDrafts}
                setLeaveReplyDrafts={setLeaveReplyDrafts}
                onLeaveAction={handleLeaveAction}
                onCouponAdjust={handleCouponAdjust}
              />
            </TabsContent>

            {/* TAB 3: 성적 관리 */}
            <TabsContent value="grades" className="space-y-6 outline-none">
              <GradesTab
                student={student}
                gradeFilter={gradeFilter}
                setGradeFilter={setGradeFilter}
                gradeTestName={gradeTestName}
                setGradeTestName={setGradeTestName}
                gradeSubject={gradeSubject}
                setGradeSubject={setGradeSubject}
                gradeScore={gradeScore}
                setGradeScore={setGradeScore}
                gradeDate={gradeDate}
                setGradeDate={setGradeDate}
                chartData={chartData}
                gradeSubjects={gradeSubjects}
                subjects={subjects}
                onAddGrade={handleAddGrade}
                onDeleteGrade={handleDeleteGrade}
              />
            </TabsContent>

            {/* TAB 4: 벌점 · 상점 관리 */}
            <TabsContent value="penalty" className="space-y-5 outline-none">
              <PenaltyTab
                student={student}
                onUpdate={(updated) => {
                  if (onUpdate) onUpdate(updated);
                }}
              />
            </TabsContent>

            {/* TAB D-Day: 학생 D-Day 관리 */}
            <TabsContent value="ddays" className="space-y-5 outline-none">
              <div className="rounded-2xl border border-black/[0.06] bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-black/[0.04] flex items-center gap-2 bg-[#FAFAFA]">
                  <CalendarDays className="w-4 h-4 text-[#0071E3]" />
                  <h3 className="text-xs font-semibold text-slate-900">D-Day 목록</h3>
                </div>

                {/* 현황 */}
                <div className="px-5 py-3 space-y-2 max-h-60 overflow-y-auto">
                  {studentDdays.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 font-bold py-6">등록된 D-Day가 없습니다.</p>
                  ) : (
                    [...studentDdays]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((d) => {
                        const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
                        const target = new Date(d.date);
                        const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
                        const label = diff === 0 ? 'D-Day' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
                        const isPast = diff < 0;
                        return (
                          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 hover:bg-slate-50/50 transition-colors">
                            <span className={`shrink-0 text-xs font-semibold min-w-[3.5rem] text-center ${
                              diff === 0 ? 'text-emerald-600' : isPast ? 'text-slate-400' : 'text-[#0071E3]'
                            }`}>{label}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{d.title}</p>
                              <p className="text-[10px] font-semibold text-slate-400">{d.date}</p>
                            </div>
                            <button
                              onClick={async () => {
                                const res = await fetch(`/api/admin/students/${student.id}/ddays?id=${d.id}`, { method: 'DELETE' });
                                const json = await res.json();
                                if (json.success) {
                                  const updated = { ...student, ddays: studentDdays.filter((x) => x.id !== d.id) };
                                  setStudentDdays(updated.ddays!);
                                  if (onUpdate) onUpdate(updated as Student);
                                }
                              }}
                              className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>

                {/* 추가 */}
                <div className="px-5 py-4 border-t border-black/[0.04] bg-[#FAFAFA] space-y-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">새 D-Day 추가 (관리자)</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ddayAdminTitle}
                      onChange={(e) => setDdayAdminTitle(e.target.value)}
                      placeholder="이름 (예: 수능, 기말고사)"
                      className="flex-1 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                    />
                    <input
                      type="date"
                      value={ddayAdminDate}
                      onChange={(e) => setDdayAdminDate(e.target.value)}
                      className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                    />
                  </div>
                  <button
                    disabled={ddayAdminAdding || !ddayAdminTitle.trim() || !ddayAdminDate}
                    onClick={async () => {
                      if (!ddayAdminTitle.trim() || !ddayAdminDate) return;
                      setDdayAdminAdding(true);
                      try {
                        const res = await fetch(`/api/admin/students/${student.id}/ddays`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title: ddayAdminTitle.trim(), date: ddayAdminDate }),
                        });
                        const json = await res.json();
                        if (json.success) {
                          const newDdays = [...studentDdays, json.dday];
                          setStudentDdays(newDdays);
                          setDdayAdminTitle('');
                          setDdayAdminDate('');
                          if (onUpdate) onUpdate({ ...student, ddays: newDdays } as Student);
                        }
                      } finally {
                        setDdayAdminAdding(false);
                      }
                    }}
                    className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0071E3]/90 text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    {ddayAdminAdding ? (
                      <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    D-Day 추가
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* TAB 5: 학생 기본정보 관리 및 회원탈퇴 */}
            <TabsContent value="info" className="space-y-5 outline-none">
              <InfoTab
                name={name}
                setName={setName}
                loginId={loginId}
                setLoginId={setLoginId}
                campus={campus}
                setCampus={setCampus}
                manager={manager}
                setManager={setManager}
                contact={contact}
                setContact={setContact}
                nextConsultationDate={nextConsultationDate}
                setNextConsultationDate={setNextConsultationDate}
                enrollmentEndDate={enrollmentEndDate}
                setEnrollmentEndDate={setEnrollmentEndDate}
                weeklyGradeCheck={weeklyGradeCheck}
                setWeeklyGradeCheck={setWeeklyGradeCheck}
                specialNote={specialNote}
                setSpecialNote={setSpecialNote}
                seatNumber={seatNumber}
                setSeatNumber={setSeatNumber}
                seatConflictNames={seatConflictNames}
                uniqueExams={uniqueExams}
                loading={loading}
                onUpdateInfo={handleUpdateInfo}
                onDeleteStudent={handleDeleteStudent}
                onSetPassword={handleSetPassword}
                parentPhone={parentPhone}
                setParentPhone={setParentPhone}
                studentPhone={studentPhone}
                setStudentPhone={setStudentPhone}
                smsTargets={smsTargets}
                setSmsTargets={setSmsTargets}
                studentId={student.id}
                shareToken={shareToken}
                shareTokenExpiresAt={shareTokenExpiresAt}
                sharePassword={sharePassword}
                onGenerateShareToken={handleGenerateShareToken}
                onRevokeShareToken={handleRevokeShareToken}
                awaySchedules={awaySchedules}
                setAwaySchedules={handleUpdateAwaySchedules}
                onApplyQuickAwaySchedules={handleApplyQuickAwaySchedules}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </SheetContent>
    </Sheet>
    <AlertDialog
      open={isCloseConfirmOpen}
      onOpenChange={(open) => {
        setIsCloseConfirmOpen(open);
        if (!open) afterCloseActionRef.current = null;
      }}
    >
      <AlertDialogContent className="bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base text-slate-900">변경사항을 저장할까요?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-5 text-slate-600">
            저장하지 않고 닫으면 지금 입력한 상담 기록과 변경사항이 저장되지 않습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscardAndClose}
            disabled={loading}
            className="rounded-lg border-black/[0.08] bg-white text-xs font-bold text-slate-900"
          >
            끝내기
          </Button>
          <Button
            type="button"
            onClick={handleSaveAndClose}
            disabled={loading}
            className="rounded-lg bg-[#0071E3] text-xs font-bold text-white hover:bg-[#0077ED]"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장하기'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── 미승인 조기 하원 실시간 계산용 헬퍼 함수 ──────────────────────────
function timeStringToMin(timeStr?: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function normalizeAwayDays(days: unknown): Array<number | string> {
  return Array.isArray(days) ? days : [];
}

type StudentAwaySchedule = NonNullable<Student['awaySchedules']>[number];

function awayScheduleMatchesDow(schedule: StudentAwaySchedule, todayDow: number): boolean {
  const rawDays = normalizeAwayDays(schedule.days);
  if (rawDays.length === 0) return true;

  const todayLabels = [
    ['일', '일요일', 'sun', 'sunday'],
    ['월', '월요일', 'mon', 'monday'],
    ['화', '화요일', 'tue', 'tuesday'],
    ['수', '수요일', 'wed', 'wednesday'],
    ['목', '목요일', 'thu', 'thursday'],
    ['금', '금요일', 'fri', 'friday'],
    ['토', '토요일', 'sat', 'saturday'],
  ][todayDow];
  const todayMon0 = todayDow === 0 ? 6 : todayDow - 1;

  return rawDays.some((day) => {
    if (typeof day === 'number') {
      if (schedule.dayMode === 'mon0') return day === todayMon0;
      if (schedule.dayMode === 'sun0') return day === todayDow;
      return day === todayDow || day === todayMon0;
    }
    if (typeof day === 'string') {
      const normalized = day.trim().toLowerCase();
      return todayLabels.includes(normalized);
    }
    return false;
  });
}

function getApplicableAwayIntervals(student: Student | null, today: string, todayDow: number) {
  if (!student?.awaySchedules?.length) return [];

  return student.awaySchedules
    .filter((schedule) => {
      if (!awayScheduleMatchesDow(schedule, todayDow)) return false;
      if (schedule.until && schedule.until !== 'forever' && schedule.until < today) return false;
      return timeStringToMin(schedule.awayTime) >= 0;
    })
    .map((schedule) => {
      const startMin = timeStringToMin(schedule.awayTime);
      const returnMin = schedule.returnTime ? timeStringToMin(schedule.returnTime) : -1;
      let endMin = returnMin >= 0 ? returnMin : 24 * 60;
      if (endMin <= startMin) endMin += 24 * 60;
      return { startMin, endMin, startTime: schedule.awayTime };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

function isApprovedLeaveCheckout(student: Student | null, today: string, checkOutMin: number): boolean {
  if (!student) return false;

  return (student.leaveRequests || [])
    .filter((r) => r.date === today && r.status === 'approved')
    .some((leave) => {
      switch (leave.type) {
        case 'fullday':
        case 'sick':
          return true;
        case 'morning':
          return checkOutMin <= 12 * 60 + 30;
        case 'afternoon':
          return checkOutMin >= 12 * 60 + 30 && checkOutMin <= 17 * 60 + 40;
        case 'night':
          return checkOutMin >= 17 * 60 + 40;
        default:
          return false;
      }
    });
}

function isApprovedAwayCheckout(
  intervals: any[],
  checkOutMin: number,
  effectiveNow: number,
): boolean {
  return intervals.some((interval) => {
    if (checkOutMin < interval.startMin) return false;
    if (interval.endMin >= 24 * 60) return true;
    return checkOutMin < interval.endMin && effectiveNow <= interval.endMin;
  });
}

function checkUnauthorizedCheckout(
  student: Student | null,
  isLeftToday: boolean,
  checkOutMin: number,
  today: string,
  nowDateStr: string,
  nowMin: number,
  awayIntervals: any[],
): boolean {
  if (!student || !isLeftToday || checkOutMin < 0) return false;
  if (checkOutMin >= 22 * 60) return false;
  if (isApprovedLeaveCheckout(student, today, checkOutMin)) return false;

  const cmp = today.localeCompare(nowDateStr);
  const effectiveNow = cmp === 0 ? nowMin : cmp < 0 ? 24 * 60 : 0;
  return !isApprovedAwayCheckout(awayIntervals, checkOutMin, effectiveNow);
}
