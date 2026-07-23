'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Inbox, Calendar, MessageSquare, AlertCircle, CheckCircle2,
  Clock, ArrowLeft, RefreshCw, LogOut, Check, X, ShieldAlert, Loader2,
  Target, BookOpen, Tv, User, Search, Send, UserPlus, BookPlus, Trash2, AlertTriangle, SquarePen
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { Student, LeaveType, ProposedGoal, ProposedMaterial, ProposedMaterialEdit, ProposedMaterialDelete, ProposedProgressCorrection, ThreadMessage } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { getLeaveTypeLabel, getRewardLabel, formatLeaveLabel } from '@/lib/leave';
import { MEAL_DAY_LABELS, MEAL_KIND_LABELS, weekRangeLabel } from '@/lib/meal';
import { getRequestTypeLabel } from '@/lib/student-requests';
import { awaitingAdminReply, buildDisplayThread } from '@/lib/thread';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

type InboxCategory = 'all' | 'living' | 'counsel' | 'facility';
type TimelineTone = 'amber' | 'blue' | 'emerald';

interface InboxItem {
  id: string;
  studentId: string;
  studentName: string;
  campus: string;
  type: 'leave' | 'request' | 'suggestion' | 'ot_absence' | 'mock_absence' | 'reward' | 'meal_add' | 'signup';
  category: 'living' | 'counsel' | 'facility';
  title: string;
  content: string;
  date: string;
  status: string;
  statusText: '접수중' | '처리중' | '완료';
  needsAction: boolean;
  tone: TimelineTone;
  adminReply: string;
  createdAt: string;
  rawItem: any;
}

const CATEGORY_TABS: { value: InboxCategory; label: string }[] = [
  { value: 'all', label: '전체 요청' },
  { value: 'living', label: '생활환경 (휴가/반차)' },
  { value: 'counsel', label: '학습 변경 (과목/진도)' },
  { value: 'facility', label: '시설 수리 (건의사항)' },
];

const hasStudentReplyAfter = (thread: ThreadMessage[] | undefined, cutoff?: string) => {
  if (!cutoff || !awaitingAdminReply(thread)) return false;
  const last = thread?.[thread.length - 1];
  return Boolean(last?.at && last.at > cutoff);
};

const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

export default function AdminInboxPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<InboxCategory>('all');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxSortField, setInboxSortField] = useState<'status' | 'date' | 'name'>('status');
  const [inboxSortOrder, setInboxSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [replySending, setReplySending] = useState(false);
  // 다중 선택 일괄 승인
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // OT/모의고사 일정 이름 매핑 (불참 신청 표시용)
  const [eventNames, setEventNames] = useState<Record<string, { name: string; date: string }>>({});
  // 도시락 라운드 라벨 매핑 (추가신청 표시용)
  const [mealPlanLabels, setMealPlanLabels] = useState<Record<string, string>>({});
  // 가입신청 (학생 셀프 신청 → 관리자 승인 대기). 승인은 별도 페이지에서 상세정보 입력 후 처리.
  const [applications, setApplications] = useState<any[]>([]);
  const [planStartDateOverrides, setPlanStartDateOverrides] = useState<Record<string, string>>({});
  // 마감일형(deadlineWeeks) 승인 정책 — 기본 'keep-deadline'(학생이 고른 마감일 유지, 마지막 주 절단).
  const [deadlinePolicies, setDeadlinePolicies] = useState<Record<string, 'keep-deadline' | 'keep-duration'>>({});
  // 수정 승인 시 학습계획 재생성 여부 — 계획 보유 자료의 총량/요일 변경 요청에서 노출(기본 켬).
  const [regenerateChecks, setRegenerateChecks] = useState<Record<string, boolean>>({});

  // 1. 관리자 인증 확인
  useEffect(() => {
    let cancelled = false;
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        if (!cancelled) loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    }
    verifyAuth();
    return () => { cancelled = true; };
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. 학생 데이터 및 신청 내역 수집
  //    silent=true 면 로딩 스피너/전체 깜빡임 없이 백그라운드 동기화만 수행
  const loadStudents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [res, otRes, mockRes, mealRes, appRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store' }),
        fetch('/api/admin/ot-events', { cache: 'no-store' }).catch(() => null),
        fetch('/api/admin/mock-exams', { cache: 'no-store' }).catch(() => null),
        fetch('/api/admin/meal-plans', { cache: 'no-store' }).catch(() => null),
        fetch('/api/admin/applications', { cache: 'no-store' }).catch(() => null),
      ]);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStudents(json.data || []);
        }
      } else {
        toast.error('원생 정보를 불러오지 못했습니다.');
      }
      const names: Record<string, { name: string; date: string }> = {};
      if (otRes && otRes.ok) {
        const j = await otRes.json();
        for (const e of (j.events || [])) names[e.id] = { name: e.name, date: e.date };
      }
      if (mockRes && mockRes.ok) {
        const j = await mockRes.json();
        for (const e of (j.exams || [])) names[e.id] = { name: e.name, date: e.date };
      }
      setEventNames(names);
      if (mealRes && mealRes.ok) {
        const j = await mealRes.json();
        const labels: Record<string, string> = {};
        for (const p of (j.plans || [])) labels[p.id] = `${weekRangeLabel(p.weekStart)} 주`;
        setMealPlanLabels(labels);
      }
      if (appRes && appRes.ok) {
        const j = await appRes.json();
        if (j.success) setApplications(j.data || []);
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/admin/auth/logout', { method: 'POST' });
      if (res.ok) {
        toast.success('로그아웃 되었습니다.');
        router.replace('/admin');
      }
    } catch {
      toast.error('로그아웃 실패');
    }
  };

  // 캠퍼스 한글 라벨 헬퍼
  const getCampusLabel = (campus: string) => {
    const map: Record<string, string> = { wonju: '원주', chuncheon: '춘천', chungju: '충주' };
    return map[campus] || campus;
  };

  // 학생 id → 원생 상세 시트 열기(공용). 인박스 목록의 학생명·상세의 버튼 어디서든 재사용.
  const openStudentById = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      openStudent(student, {
        onUpdate: (updated) => setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s))),
        onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
        allStudents: students,
      });
    }
  };

  // proposedGoal에서 자료 제목 조회
  const getMaterialTitle = (studentId: string, proposedGoal: ProposedGoal): string => {
    const student = students.find(s => s.id === studentId);
    if (!student) return proposedGoal.materialId;
    const allBooks = [
      ...(student.books || []),
      ...(student.subjects || []).flatMap(s => s.books || []),
    ];
    const allLectures = [
      ...(student.lectures || []),
      ...(student.subjects || []).flatMap(s => s.lectures || []),
    ];
    if (proposedGoal.materialType === 'book') {
      return allBooks.find(b => b.id === proposedGoal.materialId)?.title || proposedGoal.materialId;
    }
    return allLectures.find(l => l.id === proposedGoal.materialId)?.name || proposedGoal.materialId;
  };

  // 자료의 실제 단위 조회(교재 전용 — 인강은 '강' 고정). '문'·'회' 단위 자료가 'p'로 표시되지 않게 한다.
  const getMaterialUnit = (studentId: string, materialType: 'book' | 'lecture', materialId: string): string => {
    if (materialType === 'lecture') return '강';
    const student = students.find(s => s.id === studentId);
    const book = [
      ...(student?.books || []),
      ...(student?.subjects || []).flatMap(s => s.books || []),
    ].find(b => b.id === materialId);
    return book?.unit || 'p';
  };

  // proposedMaterialEdit 수정 대상 자료의 서버 현재 상태(표시용) 조회.
  // before 값은 학생이 보낸 스냅샷(pme.current)이 아니라 이 실제 값을 우선한다 — 신청 후 관리자가 자료를
  // 고쳤거나 학생이 스냅샷을 위조한 경우 옛 값을 '현재'로 보여주면 승인 판단이 틀어지기 때문.
  const getEditTargetState = (studentId: string, pme: ProposedMaterialEdit) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return null;
    if (pme.materialType === 'book') {
      const b = [...(student.books || []), ...(student.subjects || []).flatMap(s => s.books || [])]
        .find(m => m.id === pme.materialId);
      if (!b) return null;
      return {
        title: b.title, total: Number(b.totalPages) || 0, progress: Number(b.currentPage) || 0,
        unit: (b.unit || '').trim(), studyDays: b.studyDays as string[] | undefined,
        studyTime: b.studySlot || b.studyTime || '', hasPlans: (b.detailedPlans?.length || 0) > 0,
      };
    }
    const l = [...(student.lectures || []), ...(student.subjects || []).flatMap(s => s.lectures || [])]
      .find(m => m.id === pme.materialId);
    if (!l) return null;
    return {
      title: l.name, total: Number(l.totalLectures) || 0, progress: Number(l.completedLectures) || 0,
      unit: '', studyDays: l.studyDays as string[] | undefined,
      studyTime: l.studySlot || l.studyTime || '', hasPlans: (l.detailedPlans?.length || 0) > 0,
    };
  };

  // proposedMaterialDelete 삭제 대상의 현재 진도(표시용) 조회. 승인 시 사라질 진도를 미리 경고하는 용도.
  const getMaterialDeleteProgress = (studentId: string, pmd: ProposedMaterialDelete): { percent: number; label: string } | null => {
    const student = students.find(s => s.id === studentId);
    if (!student || pmd.scope !== 'material' || !pmd.materialId) return null;
    const allBooks = [...(student.books || []), ...(student.subjects || []).flatMap(s => s.books || [])];
    const allLectures = [...(student.lectures || []), ...(student.subjects || []).flatMap(s => s.lectures || [])];
    if (pmd.materialType === 'book') {
      const book = allBooks.find(b => b.id === pmd.materialId);
      if (!book) return null;
      const total = Number(book.totalPages) || 0;
      const current = Number(book.currentPage) || 0;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      const unit = book.unit || 'p';
      return { percent, label: total > 0 ? `${current}/${total}${unit} (${percent}%)` : `${current}${unit} 진행` };
    }
    const lecture = allLectures.find(l => l.id === pmd.materialId);
    if (!lecture) return null;
    const total = Number(lecture.totalLectures) || 0;
    const current = Number(lecture.completedLectures) || 0;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    return { percent, label: total > 0 ? `${current}/${total}강 (${percent}%)` : `${current}강 진행` };
  };

  // proposedMaterialDelete scope==='subject' 삭제 대상의 하위 자료 개수(표시용).
  const getSubjectDeleteCount = (studentId: string, pmd: ProposedMaterialDelete): number => {
    const student = students.find(s => s.id === studentId);
    if (!student || pmd.scope !== 'subject' || !pmd.subjectId) return 0;
    const subject = (student.subjects || []).find(s => s.id === pmd.subjectId);
    if (!subject) return 0;
    return (subject.books || []).length + (subject.lectures || []).length;
  };

  const getGoalTypeLabel = (goalType: string) => {
    if (goalType === 'weeks') return '기간 지정';
    if (goalType === 'weeklyAmount') return '주당 분량';
    if (goalType === 'dailyAmount') return '일일 분량';
    if (goalType === 'deadlineWeeks') return '마감일까지';
    if (goalType === 'selfPaced') return '자율 진행';
    return goalType;
  };

  const DAY_LABEL_KO: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

  // 모든 신청건 통합 변환 가공
  const inboxItems = React.useMemo(() => {
    const items: InboxItem[] = [];
    students.forEach((student) => {
      // 1) 휴가/반차/병가 신청
      if (student.leaveRequests) {
        student.leaveRequests.forEach((r) => {
          let statusText: '접수중' | '처리중' | '완료' = '접수중';
          let tone: TimelineTone = 'amber';
          let needsAction = r.status === 'pending' && !(r.adminReply || (r as any).acknowledgedAt);
          if (r.status === 'approved' || r.status === 'rejected') {
            statusText = '완료';
            tone = 'emerald';
            needsAction = false;
          } else if (r.status === 'pending' && (r.adminReply || (r as any).acknowledgedAt)) {
            statusText = '처리중';
            tone = 'blue';
            needsAction = false;
          }
          // 학생이 답변에 재답변하면 처리 대상으로 재노출한다.
          // 단, 이미 승인/반려한 건은 처리 시각 이후에 온 새 답변일 때만 다시 띄운다.
          if (
            (r.status === 'pending' && awaitingAdminReply(r.thread)) ||
            ((r.status === 'approved' || r.status === 'rejected') && hasStudentReplyAfter(r.thread, r.reviewedAt))
          ) {
            statusText = '처리중';
            tone = 'blue';
            needsAction = true;
          }

          const isReappeal = !!r.reappealedAt && r.status === 'pending';
          items.push({
            id: r.id,
            studentId: student.id,
            studentName: student.name,
            campus: student.campus,
            type: 'leave',
            category: 'living',
            title: `${isReappeal ? '재승인 요청: ' : '반차/휴가 신청: '}${formatLeaveLabel(r.type, r.slot)}`,
            content: isReappeal && r.reappealReason
              ? `${r.reason || '(원 사유 없음)'}\n\n[재승인 요청 사유] ${r.reappealReason}`
              : (r.reason || '(사유 없음)'),
            date: r.date,
            status: r.status,
            statusText,
            needsAction,
            tone,
            adminReply: r.adminReply || '',
            createdAt: r.reappealedAt || r.createdAt || r.date,
            rawItem: r,
          });
        });
      }

      // 2) 학습 변경 신청 (type === 'request')
      const requests = (student.consultationLogs || []).filter((l) => l.type === 'request');
      requests.forEach((r) => {
        let statusText: '접수중' | '처리중' | '완료' = '접수중';
        let tone: TimelineTone = 'amber';
        let needsAction = (r.status || 'pending') !== 'resolved' && !(r.adminReply || (r as any).acknowledgedAt);
        if (r.status === 'resolved') {
          statusText = '완료';
          tone = 'emerald';
          needsAction = false;
        } else if (r.status === 'pending' && (r.adminReply || (r as any).acknowledgedAt)) {
          statusText = '처리중';
          tone = 'blue';
          needsAction = false;
        }
        if (
          (r.status !== 'resolved' && awaitingAdminReply(r.thread)) ||
          (r.status === 'resolved' && hasStudentReplyAfter(r.thread, r.resolvedAt))
        ) {
          statusText = '처리중';
          tone = 'blue';
          needsAction = true;
        }

        const category = (r.requestType === 'halfDay' || r.requestType === 'restPass') ? 'living' : 'counsel';

        items.push({
          id: r.id,
          studentId: student.id,
          studentName: student.name,
          campus: student.campus,
          type: 'request',
          category,
          title: `학습 변경 요청: ${getRequestTypeLabel(r.requestType)}`,
          content: r.content || '(내용 없음)',
          date: r.date,
          status: r.status || 'pending',
          statusText,
          needsAction,
          tone,
          adminReply: r.adminReply || '',
          createdAt: r.createdAt || r.date,
          rawItem: r,
        });
      });

      // 3) 건의사항 (type === 'suggestion')
      const suggestions = (student.consultationLogs || []).filter((l) => l.type === 'suggestion');
      suggestions.forEach((r) => {
        let statusText: '접수중' | '처리중' | '완료' = '접수중';
        let tone: TimelineTone = 'amber';
        let needsAction = (r.status || 'pending') !== 'resolved' && !(r.adminReply || (r as any).acknowledgedAt);
        if (r.status === 'resolved') {
          statusText = '완료';
          tone = 'emerald';
          needsAction = false;
        } else if (r.status === 'pending' && (r.adminReply || (r as any).acknowledgedAt)) {
          statusText = '처리중';
          tone = 'blue';
          needsAction = false;
        }
        if (
          (r.status !== 'resolved' && awaitingAdminReply(r.thread)) ||
          (r.status === 'resolved' && hasStudentReplyAfter(r.thread, r.resolvedAt))
        ) {
          statusText = '처리중';
          tone = 'blue';
          needsAction = true;
        }

        items.push({
          id: r.id,
          studentId: student.id,
          studentName: student.name,
          campus: student.campus,
          type: 'suggestion',
          category: 'facility',
          title: '건의사항 접수',
          content: r.content || '(내용 없음)',
          date: r.date,
          status: r.status || 'pending',
          statusText,
          needsAction,
          tone,
          adminReply: r.adminReply || '',
          createdAt: r.createdAt || r.date,
          rawItem: r,
        });
      });

      // 4) OT 불참 신청 (승인 대기)
      (student.otEvents || []).forEach((e) => {
        if (e.status !== 'absent_requested') return;
        const ev = eventNames[e.eventId];
        items.push({
          id: `ot:${e.eventId}:${student.id}`,
          studentId: student.id,
          studentName: student.name,
          campus: student.campus,
          type: 'ot_absence',
          category: 'living',
          title: `OT 불참 신청: ${ev?.name || 'OT'}`,
          content: e.reason || '(사유 없음)',
          date: ev?.date || (e.updatedAt || '').slice(0, 10),
          status: 'pending',
          statusText: '접수중',
          needsAction: true,
          tone: 'amber',
          adminReply: '',
          createdAt: e.updatedAt || '',
          rawItem: { eventId: e.eventId },
        });
      });

      // 5) 모의고사 불참 신청 (승인 대기)
      (student.mockExams || []).forEach((e) => {
        if (e.status !== 'absent_requested') return;
        const ev = eventNames[e.examId];
        items.push({
          id: `mock:${e.examId}:${student.id}`,
          studentId: student.id,
          studentName: student.name,
          campus: student.campus,
          type: 'mock_absence',
          category: 'living',
          title: `모의고사 불참 신청: ${ev?.name || '모의고사'}`,
          content: e.reason || '(사유 없음)',
          date: ev?.date || (e.updatedAt || '').slice(0, 10),
          status: 'pending',
          statusText: '접수중',
          needsAction: true,
          tone: 'amber',
          adminReply: '',
          createdAt: e.updatedAt || '',
          rawItem: { examId: e.examId },
        });
      });

      // 6) 쿠폰 교환 — 학생 신청(requested, 승인 필요) / 승인 후 물품 지급대기(pending)
      (student.rewardRedemptions || []).forEach((rwd) => {
        if (rwd.status === 'requested') {
          items.push({
            id: `reward:${rwd.id}`,
            studentId: student.id,
            studentName: student.name,
            campus: student.campus,
            type: 'reward',
            category: 'living',
            title: `쿠폰 교환 신청: ${getRewardLabel(rwd.type)}`,
            content: `쿠폰 ${rwd.cost}장으로 ${getRewardLabel(rwd.type)} 교환을 신청했습니다. 승인하면 쿠폰이 차감됩니다.`,
            date: (rwd.createdAt || '').slice(0, 10),
            status: 'pending',
            statusText: '접수중',
            needsAction: true,
            tone: 'amber',
            adminReply: '',
            createdAt: rwd.createdAt || '',
            rawItem: rwd,
          });
        } else if (rwd.status === 'pending') {
          items.push({
            id: `reward:${rwd.id}`,
            studentId: student.id,
            studentName: student.name,
            campus: student.campus,
            type: 'reward',
            category: 'living',
            title: `리워드 지급 대기: ${getRewardLabel(rwd.type)}`,
            content: `쿠폰 ${rwd.cost}장으로 ${getRewardLabel(rwd.type)}을(를) 교환했습니다. 쿠폰 관리 > 리워드 지급내역에서 지급 처리해 주세요.`,
            date: (rwd.createdAt || '').slice(0, 10),
            status: 'pending',
            statusText: '접수중',
            needsAction: true,
            tone: 'amber',
            adminReply: '',
            createdAt: rwd.createdAt || '',
            rawItem: rwd,
          });
        }
      });

      // 7) 도시락 마감 후 추가 신청 (승인 대기)
      (student.mealOrders || []).forEach((o) => {
        (o.addRequests || []).forEach((r) => {
          if (r.status !== 'pending') return;
          items.push({
            id: `meal:${o.planId}:${r.id}`,
            studentId: student.id,
            studentName: student.name,
            campus: student.campus,
            type: 'meal_add',
            category: 'living',
            title: `도시락 추가 신청: ${mealPlanLabels[o.planId] || ''} ${MEAL_DAY_LABELS[r.day]} ${MEAL_KIND_LABELS[r.meal]}`,
            content: r.reason || '(사유 없음)',
            date: (r.createdAt || '').slice(0, 10),
            status: 'pending',
            statusText: '접수중',
            needsAction: true,
            tone: 'amber',
            adminReply: '',
            createdAt: r.createdAt || '',
            rawItem: { planId: o.planId, requestId: r.id },
          });
        });
      });
    });

    // 8) 가입신청 (학생 셀프 신청 → 승인 대기). 상세 승인은 전용 페이지에서 처리.
    applications.forEach((app) => {
      const bits: string[] = [];
      if (app.studentPhone) bits.push(`본인 ${app.studentPhone}`);
      if (app.parentPhone) bits.push(`학부모 ${app.parentPhone}`);
      if (app.contact) bits.push(`목표시험 ${app.contact}`);
      items.push({
        id: `signup:${app.id}`,
        studentId: '',
        studentName: app.name,
        campus: app.campus || '',
        type: 'signup',
        category: 'living',
        title: `신규 가입신청${app.loginId ? ` (ID ${app.loginId})` : ''}`,
        content: bits.length ? bits.join('\n') : '(추가 정보 없음)',
        date: (app.createdAt || '').slice(0, 10),
        status: 'pending',
        statusText: '접수중',
        needsAction: true,
        tone: 'amber',
        adminReply: '',
        createdAt: app.createdAt || '',
        rawItem: app,
      });
    });

    // 최신 신청일자 순 정렬
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [students, eventNames, mealPlanLabels, applications]);

  // 카테고리 + 검색 필터링 반영 (신청 원생 / 코멘터 답장 / 전달 텍스트)
  const filteredItems = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inboxItems.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (hideCompleted && !item.needsAction) return false;
      if (q) {
        const haystack = [
          item.studentName,
          item.adminReply,
          item.content,
          item.title,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [inboxItems, activeCategory, hideCompleted, searchQuery]);

  // 정렬된 인박스 아이템
  const sortedInboxItems = React.useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      // 접수중 = 0, 처리중 = 1, 완료 = 2
      const getStatusRank = (item: InboxItem) => {
        if (item.statusText === '접수중') return 0;
        if (item.statusText === '처리중') return 1;
        return 2;
      };

      let comparison = 0;

      if (inboxSortField === 'status') {
        const rankA = getStatusRank(a);
        const rankB = getStatusRank(b);
        comparison = rankA - rankB;
        if (comparison === 0) {
          comparison = b.createdAt.localeCompare(a.createdAt);
        }
      } else if (inboxSortField === 'date') {
        comparison = a.createdAt.localeCompare(b.createdAt);
      } else if (inboxSortField === 'name') {
        comparison = a.studentName.localeCompare(b.studentName, 'ko');
      }

      if (inboxSortOrder === 'desc') {
        return -comparison;
      }
      return comparison;
    });
  }, [filteredItems, inboxSortField, inboxSortOrder]);

  // 3. 통합 요청 해결 PATCH API 호출 (단건 코어) — 성공 시 resolve, 실패 시 throw
  const processRequestItem = async (
    item: InboxItem,
    actionStatus: 'approved' | 'rejected' | 'resolved' | 'pending',
    reply?: string,
  ) => {
    // OT/모의고사 불참 신청 — POST(participation) 로 처리. 승인=불참확정(absent), 반려=참석요청(undecided)
    if (item.type === 'ot_absence' || item.type === 'mock_absence') {
      const isOt = item.type === 'ot_absence';
      const nextStatus = (actionStatus === 'approved' || actionStatus === 'resolved') ? 'absent' : 'undecided';
      const res = await fetch(`/api/admin/students/${item.studentId}/${isOt ? 'ot-event' : 'mock-exam'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isOt ? { eventId: item.rawItem.eventId, status: nextStatus } : { examId: item.rawItem.examId, status: nextStatus }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '불참 처리 실패');
      return;
    }

    // 도시락 추가 신청 — 승인 시 selections 반영, 반려 시 거절
    if (item.type === 'meal_add') {
      const approve = actionStatus === 'approved' || actionStatus === 'resolved';
      const res = await fetch(`/api/admin/students/${item.studentId}/meal-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: item.rawItem.planId, requestId: item.rawItem.requestId, approve, reject: !approve }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '추가신청 처리 실패');
      return;
    }

    // 쿠폰 교환 신청 — 승인 시 쿠폰 차감(+물품 지급대기), 반려 시 미차감 반려
    if (item.type === 'reward') {
      const approve = actionStatus === 'approved' || actionStatus === 'resolved';
      const res = await fetch(`/api/admin/students/${item.studentId}/reward`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approve ? { redemptionId: item.rawItem.id, approve: true } : { redemptionId: item.rawItem.id, reject: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || '교환 처리 실패');
      return;
    }

    let apiUrl = `/api/admin/students/${item.studentId}`;
    let body: any = {};

    if (item.type === 'leave') {
      apiUrl += '/leave';
      body = { requestId: item.id, status: actionStatus === 'resolved' ? 'approved' : actionStatus, reply: reply?.trim() || null };
    } else if (item.type === 'request') {
      apiUrl += '/requests';
      body = { requestId: item.id, status: actionStatus === 'approved' ? 'resolved' : actionStatus, reply: reply?.trim() || null };
      const override = planStartDateOverrides[item.id];
      if ((actionStatus === 'approved' || actionStatus === 'resolved') && /^\d{4}-\d{2}-\d{2}$/.test(override || '')) {
        body.planStartDateOverride = override;
      }
      if (actionStatus === 'approved' || actionStatus === 'resolved') {
        // 마감일형 승인 정책(기본 keep-deadline)과 수정 승인 계획 재생성 선택을 함께 전달.
        if (deadlinePolicies[item.id]) body.deadlinePolicy = deadlinePolicies[item.id];
        if (item.rawItem?.proposedMaterialEdit && (regenerateChecks[item.id] ?? true)) {
          const pme = item.rawItem.proposedMaterialEdit;
          // 계획에 영향을 주는 변경(총량/요일/시간대)일 때만 재생성 플래그를 보낸다.
          if (pme.total !== undefined || pme.studyDays || pme.studyTime !== undefined) body.regeneratePlans = true;
        }
      }
    } else {
      apiUrl += '/suggestions';
      body = { suggestionId: item.id, status: actionStatus === 'approved' ? 'resolved' : actionStatus, reply: reply?.trim() || null };
    }

    const res = await fetch(apiUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || '요청 처리 실패');
  };

  // 낙관적 로컬 업데이트 — 처리된 신청건의 상태/답변을 students 상태에 즉시 반영해
  // 전체 새로고침(깜빡임) 없이 UI를 갱신한다. 이후 silent reload로 서버 상태와 재동기화.
  const applyOptimistic = (
    item: InboxItem,
    actionStatus: 'approved' | 'rejected' | 'resolved' | 'pending',
    reply?: string,
  ) => {
    const replyTrim = reply?.trim() || '';
    const nowIso = new Date().toISOString();
    setStudents((prev) => prev.map((s) => {
      if (s.id !== item.studentId) return s;
      const next: Student = { ...s };
      if (item.type === 'leave') {
        next.leaveRequests = (s.leaveRequests || []).map((r) =>
          r.id === item.id
            ? {
                ...r,
                status: (actionStatus === 'resolved' ? 'approved' : actionStatus) as any,
                adminReply: replyTrim || r.adminReply,
                ...(actionStatus === 'pending' ? { acknowledgedAt: nowIso } : {}),
              } as any
            : r);
      } else if (item.type === 'request' || item.type === 'suggestion') {
        const nextStatus = actionStatus === 'approved' || actionStatus === 'resolved' ? 'resolved' : actionStatus;
        next.consultationLogs = (s.consultationLogs || []).map((l) =>
          l.id === item.id
            ? {
                ...l,
                status: nextStatus as any,
                adminReply: replyTrim || l.adminReply,
                ...(nextStatus === 'pending' ? { acknowledgedAt: nowIso } : {}),
              } as any
            : l);
      } else if (item.type === 'ot_absence') {
        const ns = (actionStatus === 'approved' || actionStatus === 'resolved') ? 'absent' : 'undecided';
        next.otEvents = (s.otEvents || []).map((e) =>
          e.eventId === item.rawItem.eventId ? { ...e, status: ns as any } : e);
      } else if (item.type === 'mock_absence') {
        const ns = (actionStatus === 'approved' || actionStatus === 'resolved') ? 'absent' : 'undecided';
        next.mockExams = (s.mockExams || []).map((e) =>
          e.examId === item.rawItem.examId ? { ...e, status: ns as any } : e);
      } else if (item.type === 'meal_add') {
        const approve = actionStatus === 'approved' || actionStatus === 'resolved';
        next.mealOrders = (s.mealOrders || []).map((o) => {
          if (o.planId !== item.rawItem.planId) return o;
          return {
            ...o,
            addRequests: (o.addRequests || []).map((r) =>
              r.id === item.rawItem.requestId ? { ...r, status: (approve ? 'approved' : 'rejected') as any } : r),
          };
        });
      }
      return next;
    }));
  };

  const canSendReply = (item: InboxItem | null) =>
    item?.type === 'leave' || item?.type === 'request' || item?.type === 'suggestion';

  const processReplyOnly = async (item: InboxItem, reply: string) => {
    let apiUrl = `/api/admin/students/${item.studentId}`;
    let body: any = {};

    if (item.type === 'leave') {
      apiUrl += '/leave';
      body = { requestId: item.id, reply };
    } else if (item.type === 'request') {
      apiUrl += '/requests';
      body = { requestId: item.id, reply };
    } else if (item.type === 'suggestion') {
      apiUrl += '/suggestions';
      body = { suggestionId: item.id, reply };
    } else {
      throw new Error('이 요청에는 답변을 보낼 수 없습니다.');
    }

    const res = await fetch(apiUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.message || '답변 전송 실패');
  };

  const appendLocalAdminReply = (rawItem: any, reply: string) => {
    const nowIso = new Date().toISOString();
    const thread = Array.isArray(rawItem?.thread) ? [...rawItem.thread] : [];
    if (thread.length === 0 && rawItem?.adminReply) {
      thread.push({
        id: `legacy_local_${Date.now()}`,
        from: 'admin',
        text: rawItem.adminReply,
        at: rawItem.repliedAt || '',
      });
    }
    thread.push({
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from: 'admin',
      text: reply,
      at: nowIso,
      author: '코멘터',
    });
    return { ...(rawItem || {}), adminReply: reply, repliedAt: nowIso, thread };
  };

  const applyReplyOptimistic = (item: InboxItem, reply: string) => {
    const nextRawItem = appendLocalAdminReply(item.rawItem, reply);
    setStudents((prev) => prev.map((student) => {
      if (student.id !== item.studentId) return student;
      if (item.type === 'leave') {
        return {
          ...student,
          leaveRequests: (student.leaveRequests || []).map((request) =>
            request.id === item.id ? { ...request, ...nextRawItem } : request),
        };
      }
      if (item.type === 'request' || item.type === 'suggestion') {
        return {
          ...student,
          consultationLogs: (student.consultationLogs || []).map((log) =>
            log.id === item.id ? { ...log, ...nextRawItem } : log),
        };
      }
      return student;
    }));
    setSelectedItem((prev) => prev && prev.id === item.id
      ? { ...prev, adminReply: reply, rawItem: nextRawItem }
      : prev);
  };

  const handleSendReply = async () => {
    const target = selectedItem;
    const reply = replyText.trim();
    if (!target || !reply || !canSendReply(target)) return;

    setReplySending(true);
    try {
      await processReplyOnly(target, reply);
      applyReplyOptimistic(target, reply);
      setReplyText('');
      toast.success('답변을 보냈습니다.');
      loadStudents(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '답변 전송 중 오류가 발생했습니다.');
    } finally {
      setReplySending(false);
    }
  };

  const handleProcessRequest = async (actionStatus: 'approved' | 'rejected' | 'resolved' | 'pending') => {
    if (!selectedItem) return;
    setProcessing(true);
    const target = selectedItem;
    try {
      await processRequestItem(target, actionStatus, replyText);
      applyOptimistic(target, actionStatus, replyText);
      toast.success('신청이 성공적으로 처리되었습니다.');
      setSelectedItem(null);
      setReplyText('');
      loadStudents(true); // 백그라운드 재동기화(깜빡임 없음)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 에러가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  // 다중 선택 일괄 승인 (완료되지 않은 건만 대상)
  const handleBulkApprove = async () => {
    const targets = inboxItems.filter((i) => selectedIds.has(i.id) && i.statusText !== '완료' && i.type !== 'reward' && i.type !== 'signup');
    if (targets.length === 0) return;
    if (!(await confirm({ title: `선택한 ${targets.length}건을 일괄 승인할까요?`, confirmText: '일괄 승인' }))) return;
    setBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    for (const item of targets) {
      try {
        await processRequestItem(item, 'approved');
        applyOptimistic(item, 'approved');
        ok++;
      } catch {
        fail++;
      }
    }
    loadStudents(true); // 백그라운드 재동기화(깜빡임 없음)
    setSelectedIds(new Set());
    setSelectedItem(null);
    setBulkProcessing(false);
    if (fail === 0) toast.success(`${ok}건을 일괄 승인했습니다.`);
    else toast.error(`${ok}건 승인 완료, ${fail}건 실패. 목록을 확인해 주세요.`);
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 선택 변경 시 폼 바인딩 (초안 유실 경고). 답변은 스레드에 append 되므로 새 메시지는 항상 빈 칸에서 시작.
  const handleSelectItem = async (item: InboxItem) => {
    if (
      selectedItem &&
      selectedItem.id !== item.id &&
      replyText.trim() !== ''
    ) {
      const ok = await confirm({
        title: '항목을 전환할까요?',
        description: '작성 중인 답변이 저장되지 않아요.',
        tone: 'danger',
        confirmText: '전환',
      });
      if (!ok) return;
    }
    setSelectedItem(item);
    setReplyText('');
  };

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F9FA] dark:bg-[#0b0b0c]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans transition-all">
      <AdminTopNav
        title="통합 신청 & 건의 인박스"
        onLogout={handleLogout}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadStudents()}
            className="rounded-2xl border-black/[0.05] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/10 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-premium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        }
      />

      <main className="stagger-children max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* 좌측: 카테고리 필터 및 요청 목록 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 검색 — 신청 원생 / 코멘터 답장 / 전달 텍스트 */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 dark:text-slate-600 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="원생 이름 · 신청 내용 · 코멘터 답변으로 검색"
              className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-10 pr-9 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/15 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400"
                aria-label="검색어 지우기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 bg-[#F5F5F7] dark:bg-white/5 p-1 rounded-2xl border border-black/[0.02] dark:border-white/10">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setActiveCategory(tab.value);
                  setSelectedItem(null);
                  setSelectedIds(new Set());
                }}
                className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold transition-all text-center whitespace-nowrap ${
                  activeCategory === tab.value
                    ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* 정렬 셀렉터 */}
            <div className="flex items-center gap-1 bg-[#F5F5F7] dark:bg-white/5 p-0.5 rounded-xl border border-black/[0.02] dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (inboxSortField === 'status') {
                    setInboxSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setInboxSortField('status');
                    setInboxSortOrder('asc');
                  }
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${
                  inboxSortField === 'status'
                    ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                미처리순 {inboxSortField === 'status' && (inboxSortOrder === 'asc' ? '▲' : '▼')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inboxSortField === 'date') {
                    setInboxSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setInboxSortField('date');
                    setInboxSortOrder('desc');
                  }
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${
                  inboxSortField === 'date'
                    ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                신청일순 {inboxSortField === 'date' && (inboxSortOrder === 'asc' ? '▲' : '▼')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inboxSortField === 'name') {
                    setInboxSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setInboxSortField('name');
                    setInboxSortOrder('asc');
                  }
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${
                  inboxSortField === 'name'
                    ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                이름순 {inboxSortField === 'name' && (inboxSortOrder === 'asc' ? '▲' : '▼')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHideCompleted((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-all ${
                hideCompleted
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#1c1c1e] border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-400'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              처리 필요만
            </button>
          </div>

          {/* 일괄 승인 바 — 미처리(완료 아님) 건이 있을 때만 */}
          {!loading && sortedInboxItems.some((i) => i.statusText !== '완료') && (() => {
            const approvable = sortedInboxItems.filter((i) => i.statusText !== '완료');
            const selCount = approvable.filter((i) => selectedIds.has(i.id)).length;
            const allSel = approvable.length > 0 && selCount === approvable.length;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-4 py-2.5 shadow-sm">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={() => setSelectedIds(allSel ? new Set() : new Set(approvable.map((i) => i.id)))}
                    className="h-4 w-4 rounded border-slate-300 dark:border-white/20 accent-[#0071E3] cursor-pointer"
                  />
                  미처리 전체 선택 <span className="text-slate-400 dark:text-slate-500 font-semibold">({selCount}/{approvable.length})</span>
                </label>
                <Button
                  size="sm"
                  disabled={selCount === 0 || bulkProcessing}
                  onClick={handleBulkApprove}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 h-8.5 disabled:opacity-40"
                >
                  {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                  선택 {selCount}건 일괄 승인
                </Button>
              </div>
            );
          })()}

          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {loading && students.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-100 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0071E3]" />
                <p className="text-xs text-slate-400 dark:text-slate-400 font-bold">요청 목록을 동기화하는 중...</p>
              </div>
            ) : sortedInboxItems.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-100 dark:border-white/10 flex flex-col items-center justify-center gap-2">
                <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400 dark:text-slate-400 font-bold">조회 대상 요청이 없습니다.</p>
              </div>
            ) : (
              sortedInboxItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`p-5 rounded-3xl border text-left cursor-pointer transition-all shadow-sm flex flex-col gap-3.5 ${
                      isSelected
                        ? 'border-[#0071E3] bg-[#0071E3]/[0.02] dark:bg-[#0071E3]/15 ring-2 ring-[#0071E3]/15'
                        : 'border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:border-slate-200 dark:hover:border-white/20 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {item.statusText !== '완료' && item.type !== 'reward' && item.type !== 'signup' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelectOne(item.id)}
                            className="h-4 w-4 rounded border-slate-300 dark:border-white/20 accent-[#0071E3] cursor-pointer shrink-0"
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openStudentById(item.studentId); }}
                          title={`${item.studentName} 원생 상세 열기`}
                          className="font-black text-sm text-slate-800 dark:text-slate-200 hover:text-[#0071E3] hover:underline underline-offset-2 transition-colors"
                        >
                          {item.studentName}
                        </button>
                        <Badge className="rounded-md border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                          {getCampusLabel(item.campus)}
                        </Badge>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{item.date}</span>
                      </span>

                      {/* 상태 타임라인 뱃지 */}
                      <span className="flex items-center gap-1 shrink-0">
                        {item.tone === 'amber' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            접수중
                          </span>
                        )}
                        {item.tone === 'blue' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 px-2.5 py-0.5 text-[10px] font-black text-[#0071E3] dark:bg-[#0071E3]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
                            처리중
                          </span>
                        )}
                        {item.tone === 'emerald' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/25 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            완료
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">{item.title}</h4>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed break-words bg-slate-50/50 dark:bg-white/5 p-3.5 rounded-2xl border border-slate-100/50 dark:border-white/10">
                        {item.content}
                      </p>
                    </div>

                    {item.adminReply && (
                      <div className="text-[11px] font-bold text-[#0071E3] bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 border border-[#0071E3]/10 dark:border-[#0071E3]/25 p-3 rounded-2xl flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-black text-[10px] text-[#0071E3]/80 uppercase tracking-wider">코멘터 답변 완료</p>
                          <p className="mt-1 font-semibold whitespace-pre-wrap leading-normal text-slate-600 dark:text-slate-300">{item.adminReply}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 상세 처리 패널 */}
        <div className="space-y-4">
          <Card className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase border-b border-slate-100 dark:border-white/10 pb-3 flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-[#0071E3]" />
              요청 상세 및 실시간 피드백 처리
            </h3>

            {selectedItem ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between items-center font-black text-slate-700 dark:text-slate-300 border-b border-slate-200/50 dark:border-white/10 pb-2">
                    <span>{selectedItem.studentName} ({getCampusLabel(selectedItem.campus)})</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{selectedItem.date}</span>
                  </div>
                  <p className="font-extrabold text-slate-600 dark:text-slate-300 text-[11px] mt-1">{selectedItem.title}</p>
                  <p className="text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-pre-wrap leading-relaxed break-words bg-white dark:bg-[#1c1c1e] p-2.5 rounded-xl border border-slate-100 dark:border-white/10">
                    {selectedItem.content}
                  </p>
                </div>

                {/* 양방향 대화 내역 (학생 재답변 포함) */}
                {(selectedItem.type === 'leave' || selectedItem.type === 'request' || selectedItem.type === 'suggestion') && (() => {
                  const raw = selectedItem.rawItem || {};
                  const convo = buildDisplayThread({
                    headText: selectedItem.content,
                    headAt: raw.createdAt || selectedItem.createdAt,
                    adminReply: raw.adminReply,
                    repliedAt: raw.repliedAt,
                    thread: raw.thread,
                  }).slice(1); // head(본문)는 위에서 이미 표시
                  if (convo.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">대화 내역</p>
                      <div className="space-y-2">
                        {convo.map((m) => (
                          <div key={m.id} className={`flex ${m.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] font-semibold whitespace-pre-wrap break-words ${m.from === 'admin' ? 'bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 border border-[#0071E3]/15 dark:border-[#0071E3]/25 text-slate-700 dark:text-slate-300' : 'bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'}`}>
                              <span className={`block text-[9px] font-black uppercase tracking-wider mb-0.5 ${m.from === 'admin' ? 'text-[#0071E3]/70' : 'text-slate-400 dark:text-slate-500'}`}>
                                {m.from === 'admin' ? (m.author || '코멘터') : '학생'}
                              </span>
                              {m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {selectedItem.type !== 'signup' && (
                <>
                <button
                  type="button"
                  onClick={() => openStudentById(selectedItem.studentId)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-[#F5F5F7] dark:hover:bg-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 py-2.5 transition-all active:scale-[0.98]"
                >
                  <User className="w-3.5 h-3.5 text-[#0071E3]" />
                  원생 상세 시트 열기
                </button>

                {canSendReply(selectedItem) && (
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider block">코멘터 답변 / 재답변 작성</label>
                  <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/20">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="원생에게 보낼 메시지를 입력하세요."
                      rows={3}
                      className="min-h-[76px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendReply}
                      disabled={!canSendReply(selectedItem) || !replyText.trim() || replySending}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0071E3] text-white shadow-sm transition hover:bg-[#0077ED] active:scale-[0.96] disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none"
                      aria-label="답변 전송"
                      title="답변 전송"
                    >
                      {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500">Enter 전송 · Shift+Enter 줄바꿈. 처리완료와 확인 처리는 아래 버튼으로 따로 기록합니다.</p>
                </div>
                )}
                </>
                )}

                {/* proposedGoal 제안 계획 표시 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedGoal && (() => {
                  const pg: ProposedGoal = selectedItem.rawItem.proposedGoal;
                  const cg = pg.currentGoal;
                  const materialTitle = getMaterialTitle(selectedItem.studentId, pg);
                  const isBook = pg.materialType === 'book';
                  const matUnit = getMaterialUnit(selectedItem.studentId, pg.materialType, pg.materialId);
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
                        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">승인 시작일</label>
                        <input
                          type="date"
                          min={kstToday()}
                          value={planStartDateOverrides[selectedItem.id] ?? pg.planStartDate ?? ''}
                          onChange={(e) => setPlanStartDateOverrides((prev) => ({ ...prev, [selectedItem.id]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                        />
                        <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">그대로 두면 학생 선택값 또는 오늘 기준으로 승인됩니다.</p>
                      </div>

                      {pg.goalType === 'deadlineWeeks' && pg.targetDate && (
                        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5 space-y-1.5">
                          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">마감일 처리</label>
                          <div className="flex gap-1.5">
                            {([['keep-deadline', `마감일 유지 (${pg.targetDate})`], ['keep-duration', `기간 유지 (약 ${pg.goalValue}주)`]] as const).map(([mode, label]) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setDeadlinePolicies((prev) => ({ ...prev, [selectedItem.id]: mode }))}
                                className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                                  (deadlinePolicies[selectedItem.id] ?? 'keep-deadline') === mode
                                    ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3]'
                                    : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 break-keep">마감일 유지는 시작일이 늦어져도 계획이 학생이 고른 마감일을 넘지 않아요(주당 분량 증가).</p>
                        </div>
                      )}

                      <p className="text-[9px] font-bold text-[#0071E3]/70 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> 승인 시 해당 교재/인강에 제안 계획이 자동 반영됩니다.
                      </p>
                    </div>
                  );
                })()}

                {/* proposedMaterial 교재/인강 추가 제안 표시 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedMaterial && (() => {
                  const pm: ProposedMaterial = selectedItem.rawItem.proposedMaterial;
                  const isBook = pm.materialType === 'book';
                  const unitLabel = isBook ? (pm.unit || 'p') : '강';
                  const dayLabel: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
                  const timeLabel: Record<string, string> = { morning: '오전', afternoon: '오후', night: '야간' };
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
                            {pm.studyDays?.length ? pm.studyDays.map((d) => dayLabel[d]).join('·') : ''}
                            {pm.studyTime ? ` ${timeLabel[pm.studyTime]}` : ''}
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
                          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">승인 시작일</label>
                          <input
                            type="date"
                            min={kstToday()}
                            value={planStartDateOverrides[selectedItem.id] ?? pm.planStartDate ?? ''}
                            onChange={(e) => setPlanStartDateOverrides((prev) => ({ ...prev, [selectedItem.id]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
                          />
                          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">그대로 두면 학생 선택값 또는 오늘 기준으로 자료 계획이 생성됩니다.</p>
                          {pm.goalType === 'deadlineWeeks' && pm.targetDate && (
                            <div className="space-y-1.5 pt-1">
                              <label className="block text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">마감일 처리</label>
                              <div className="flex gap-1.5">
                                {([['keep-deadline', `마감일 유지 (${pm.targetDate})`], ['keep-duration', `기간 유지 (약 ${pm.goalValue}주)`]] as const).map(([mode, label]) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setDeadlinePolicies((prev) => ({ ...prev, [selectedItem.id]: mode }))}
                                    className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                                      (deadlinePolicies[selectedItem.id] ?? 'keep-deadline') === mode
                                        ? 'border-[#0071E3] bg-[#0071E3]/10 text-[#0071E3]'
                                        : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 break-keep">마감일 유지는 시작일이 늦어져도 계획이 학생이 고른 마감일을 넘지 않아요(주당 분량 증가).</p>
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
                })()}

                {/* proposedMaterialEdit 기존 교재/강의 수정 제안 표시 — 바뀌는 필드만 before → after 로 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedMaterialEdit && (() => {
                  const pme: ProposedMaterialEdit = selectedItem.rawItem.proposedMaterialEdit;
                  const isBook = pme.materialType === 'book';
                  const unitLabel = isBook ? (pme.unit || pme.current?.unit || 'p') : '강';
                  const dayLabel: Record<string, string> = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
                  const timeLabel: Record<string, string> = { morning: '오전', afternoon: '오후', night: '야간' };
                  const daysText = (days?: string[]) => (days?.length ? days.map((d) => dayLabel[d] || d).join('·') : '기본');
                  // 미지정('')은 시간표 제외가 아니라 교시 고정 해제 — 빈 교시에 자동 배치되고, 과목 시간대가 있으면 그쪽을 따른다.
                  const timeText = (t?: string) => (t ? (timeLabel[t] || t) : '교시 미지정(자동 배치)');
                  // 서버 실제 값 우선, 없으면(자료 조회 실패) 학생 스냅샷으로 폴백.
                  const cur = getEditTargetState(selectedItem.studentId, pme);
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
                            checked={regenerateChecks[selectedItem.id] ?? true}
                            onChange={(e) => setRegenerateChecks((prev) => ({ ...prev, [selectedItem.id]: e.target.checked }))}
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
                })()}

                {/* proposedMaterialDelete 교재/강의(또는 과목 전체) 삭제 제안 표시 — 파괴적 작업이라 위험(red) 톤 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedMaterialDelete && (() => {
                  const pmd: ProposedMaterialDelete = selectedItem.rawItem.proposedMaterialDelete;
                  const isSubject = pmd.scope === 'subject';
                  const progress = getMaterialDeleteProgress(selectedItem.studentId, pmd);
                  const subjectCount = isSubject ? getSubjectDeleteCount(selectedItem.studentId, pmd) : 0;
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
                })()}

                {/* proposedProgressCorrection 진도 숫자 정정 제안 표시 — 승인 시 진도 자동 반영 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedProgressCorrection && (() => {
                  const ppc: ProposedProgressCorrection = selectedItem.rawItem.proposedProgressCorrection;
                  const unitLabel = getMaterialUnit(selectedItem.studentId, ppc.materialType, ppc.materialId);
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
                })()}

                <div className="space-y-2 border-t border-slate-100 dark:border-white/10 pt-4">
                  {selectedItem.type === 'signup' ? (
                    <Button
                      onClick={() => router.push('/admin/applications')}
                      className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1" /> 가입신청 승인 페이지에서 처리
                    </Button>
                  ) : selectedItem.type === 'reward' ? (
                    selectedItem.rawItem?.status === 'requested' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          disabled={processing}
                          onClick={() => handleProcessRequest('approved')}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> 승인 (쿠폰 차감)
                        </Button>
                        <Button
                          disabled={processing}
                          onClick={() => handleProcessRequest('rejected')}
                          className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                        >
                          <X className="w-3.5 h-3.5 mr-1" /> 반려
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => router.push('/admin/leave?tab=rewards')}
                        className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 mr-1 rotate-180" /> 쿠폰 관리 지급내역에서 처리
                      </Button>
                    )
                  ) : selectedItem.type === 'meal_add' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('approved')}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> 추가 승인 (표 반영)
                      </Button>
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('rejected')}
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> 반려
                      </Button>
                    </div>
                  ) : selectedItem.type === 'ot_absence' || selectedItem.type === 'mock_absence' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('approved')}
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> 불참 승인
                      </Button>
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('rejected')}
                        className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> 반려(참석 요청)
                      </Button>
                    </div>
                  ) : selectedItem.type === 'leave' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('approved')}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> 승인 처리
                      </Button>
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('rejected')}
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> 반려 처리
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('resolved')}
                        className={`w-full rounded-xl text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all ${selectedItem.rawItem?.proposedMaterialDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {selectedItem.rawItem?.proposedMaterialDelete ? '승인 및 삭제' : selectedItem.rawItem?.proposedMaterialEdit ? '승인 및 수정 반영' : selectedItem.rawItem?.proposedMaterial ? '승인 및 자료 생성' : selectedItem.rawItem?.proposedGoal ? '승인 및 계획 자동 반영' : selectedItem.rawItem?.proposedProgressCorrection ? '승인 및 진도 정정' : '해결/처리 완료'}
                      </Button>
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('pending')}
                        className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Clock className="w-3.5 h-3.5 mr-1" /> 확인했어요
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center gap-2.5">
                <Inbox className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400">요청을 선택하세요</p>
                <p className="text-[9px] text-slate-400/80 dark:text-slate-500 font-semibold">좌측 목록에서 신청건을 클릭하면 상세 내용 확인 및 답변 처리를 진행할 수 있습니다.</p>
              </div>
            )}
          </Card>
        </div>

      </main>
    </div>
  );
}
