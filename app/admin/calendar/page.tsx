'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, RefreshCw,
  Ticket, Minus, Plus, ChevronDown, PenLine, MessageSquare, ShieldAlert, CalendarHeart,
  ClipboardCheck, CalendarClock, Trash2, Bell, Gift, Search, Pin, GraduationCap,
  MessageCircle, TriangleAlert, CheckCircle2, Clock, Megaphone, ImagePlus, Utensils,
} from 'lucide-react';
import { toast } from 'sonner';
import { compressImageToJpeg } from '@/lib/image-compress';
import { Student, LeaveRequest, LeaveType, CampusEvent, MockExam, OtEvent, MealPlan, MealDay, MealKind } from '@/lib/types/student';
import { createPortal } from 'react-dom';
import { RecipientPickerModal } from '@/components/admin/recipient-picker-modal';
import { MockExamManager } from '@/components/admin/mock-exam-manager';
import { OtEventManager } from '@/components/admin/ot-event-manager';
import { MealPlanManager } from '@/components/admin/meal-plan-manager';
import { mondayOf, weekRangeLabel, deadlineForMealWeek, toKstIsoFromDateTimeLocal, formatDeadline, MEAL_DAYS, MEAL_DAY_LABELS, MEAL_KIND_LABELS } from '@/lib/meal';
import { LEAVE_TYPES, getLeaveTypeLabel, COUPONS_PER_EXTRA_HALFDAY } from '@/lib/leave';
import { LeaveTypeIcon } from '@/components/leave-type-icon';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const LEAVE_TYPE_ORDER: LeaveType[] = ['morning', 'afternoon', 'night', 'fullday', 'personal_halfday', 'personal_fullday', 'sick'];

function campusLabel(val: string) {
  switch (val) {
    case 'wonju': return '원주';
    case 'chuncheon': return '춘천';
    case 'chungju': return '충주';
    case 'all': return '전체 센터';
    default: return '기타';
  }
}

// [start, end] 사이의 모든 YYYY-MM-DD (다중일 일정 펼치기, 최대 90일 안전캡)
function eachDate(start: string, end?: string): string[] {
  if (!end || end <= start) return [start];
  const out: string[] = [];
  let cur = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  let guard = 0;
  while (cur <= last && guard < 90) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
    guard++;
  }
  return out;
}

interface LeaveEvent {
  student: Student;
  request: LeaveRequest;
}

export default function AdminCalendarPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [campusEvents, setCampusEvents] = useState<CampusEvent[]>([]);
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [otEvents, setOtEvents] = useState<OtEvent[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminCampus, setAdminCampus] = useState<string>('all');

  // 필터 상태
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // 날짜 선택 상태 (기본값 오늘)
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  // 미션 참여 관리 펼침
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null);
  const [missionSearch, setMissionSearch] = useState('');

  // 수기 휴가 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ studentId: string; type: LeaveType; date: string; reason: string; status: 'pending' | 'approved' }>({
    studentId: '', type: 'morning', date: todayStr, reason: '', status: 'approved',
  });
  const [addBusy, setAddBusy] = useState(false);

  // 일정/미션 등록 모달
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [evForm, setEvForm] = useState({
    title: '', date: todayStr, endDate: '', startTime: '', endTime: '',
    campus: 'all', memo: '', isMission: false, couponReward: 1,
    targetMode: 'campus' as 'campus' | 'students', targetStudentIds: [] as string[],
    responseMode: 'none' as 'none' | 'attendance' | 'postTask',
    postTaskLabel: '', postTaskDueDate: '', postTaskHref: '',
  });
  const [evBusy, setEvBusy] = useState(false);
  const [evStudentSearch, setEvStudentSearch] = useState('');

  // 통합 생성 모달 — 종류 선택(일정/미션 · 모의고사 · OT · 도시락). 공지는 별도 사진 모달.
  type CreateKind = 'event' | 'mock' | 'ot' | 'meal';
  const [createKind, setCreateKind] = useState<CreateKind>('event');
  const [mockForm, setMockForm] = useState<{ name: string; date: string; campus: string; targetTypes: string[] }>(
    { name: '', date: todayStr, campus: 'all', targetTypes: [] },
  );
  const [otForm, setOtForm] = useState<{ name: string; date: string; campus: string; message: string }>(
    { name: '', date: todayStr, campus: 'all', message: '' },
  );
  const [mealForm, setMealForm] = useState<{ weekStart: string; lunch: boolean; dinner: boolean; campus: string; deadline: string; closedDays: MealDay[]; lunchPrice: string; dinnerPrice: string }>(
    { weekStart: mondayOf(todayStr), lunch: true, dinner: false, campus: 'all', deadline: deadlineForMealWeek(mondayOf(todayStr)), closedDays: [], lunchPrice: '', dinnerPrice: '' },
  );

  // 전체화면 관리 오버레이 (모의고사 성적/출결, OT 출결·쿠폰, 도시락 정산·인쇄·그리드)
  const [mockManagerExam, setMockManagerExam] = useState<MockExam | null>(null);
  const [otManagerEvent, setOtManagerEvent] = useState<OtEvent | null>(null);
  const [mealManagerPlan, setMealManagerPlan] = useState<MealPlan | null>(null);

  // 알림 대상 선택 피커 — 참여미션/모의고사/OT 공용
  const [picker, setPicker] = useState<
    | { kind: 'mission'; id: string; name: string; campus?: string; participations: Map<string, 'accepted' | 'declined' | 'pending'>; pool: Student[] }
    | { kind: 'mock'; id: string; name: string; campus?: string; targetExamTypes?: string[] }
    | { kind: 'ot'; id: string; name: string; campus?: string }
    | null
  >(null);

  // 사진 공지 등록 모달
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [noticeForm, setNoticeForm] = useState<{ date: string; campus: string; memo: string; previewUrl: string; blob: Blob | null; fileName: string }>(
    { date: todayStr, campus: 'all', memo: '', previewUrl: '', blob: null, fileName: '' },
  );
  const [noticeBusy, setNoticeBusy] = useState(false);

  const openNoticeModal = () => {
    setNoticeForm({ date: selectedDate, campus: adminCampus !== 'all' ? adminCampus : 'all', memo: '', previewUrl: '', blob: null, fileName: '' });
    setNoticeModalOpen(true);
  };

  const handleNoticeFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error('이미지 파일만 올릴 수 있습니다.'); return; }
    try {
      const blob = await compressImageToJpeg(file);
      setNoticeForm((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        return { ...f, blob, previewUrl: URL.createObjectURL(blob), fileName: file.name };
      });
    } catch {
      toast.error('이미지 처리에 실패했습니다. 다른 사진으로 시도하세요.');
    }
  };

  const handleNoticeSubmit = async () => {
    if (!noticeForm.blob) { toast.error('공지 사진을 선택해 주세요.'); return; }
    if (!noticeForm.date) { toast.error('날짜를 선택해 주세요.'); return; }
    setNoticeBusy(true);
    let uploadedPath = '';
    try {
      // 1) 압축 이미지 업로드 → 공개 URL
      const fd = new FormData();
      fd.append('file', new File([noticeForm.blob], `notice-${noticeForm.date}.jpg`, { type: 'image/jpeg' }));
      fd.append('date', noticeForm.date);
      fd.append('campus', noticeForm.campus);
      const upRes = await fetch('/api/admin/announcement-image', { method: 'POST', body: fd, credentials: 'same-origin' });
      const upJson = await upRes.json();
      if (!upRes.ok || !upJson.success) { toast.error(upJson.message || '이미지 업로드에 실패했습니다.'); return; }
      uploadedPath = upJson.path;

      // 2) 공지 일정(category=notice) 등록
      const res = await fetch('/api/admin/campus-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          category: 'notice',
          title: noticeForm.memo.trim().slice(0, 40) || '학원 공지',
          date: noticeForm.date,
          campus: noticeForm.campus,
          memo: noticeForm.memo.trim() || undefined,
          imagePath: upJson.path, // 서버가 이 경로로 공개 URL을 재구성함
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCampusEvents((prev) => [json.event, ...prev]);
        setSelectedDate(json.event.date);
        if (noticeForm.previewUrl) URL.revokeObjectURL(noticeForm.previewUrl);
        setNoticeModalOpen(false);
        toast.success('공지가 등록됐습니다.');
      } else {
        // 일정 등록 실패 → 방금 올린 이미지가 고아로 남지 않게 정리(실패해도 무시).
        fetch(`/api/admin/announcement-image?path=${encodeURIComponent(uploadedPath)}`, {
          method: 'DELETE', credentials: 'same-origin',
        }).catch(() => {});
        toast.error(json.message || '등록에 실패했습니다.');
      }
    } catch {
      if (uploadedPath) {
        fetch(`/api/admin/announcement-image?path=${encodeURIComponent(uploadedPath)}`, {
          method: 'DELETE', credentials: 'same-origin',
        }).catch(() => {});
      }
      toast.error('등록 중 오류가 발생했습니다.');
    } finally {
      setNoticeBusy(false);
    }
  };

  const openAddModal = () => {
    setAddForm({ studentId: '', type: 'morning', date: selectedDate, reason: '', status: 'approved' });
    setAddModalOpen(true);
  };

  const openEventModal = (kind: CreateKind = 'event') => {
    const campus = adminCampus !== 'all' ? adminCampus : 'all';
    setEvForm({
      title: '', date: selectedDate, endDate: '', startTime: '', endTime: '',
      campus, memo: '', isMission: false, couponReward: 1,
      targetMode: 'campus', targetStudentIds: [],
      responseMode: 'none', postTaskLabel: '', postTaskDueDate: '', postTaskHref: '',
    });
    setMockForm({ name: '', date: selectedDate, campus, targetTypes: [] });
    setOtForm({ name: '', date: selectedDate, campus, message: '' });
    const wk = mondayOf(selectedDate);
    setMealForm({ weekStart: wk, lunch: true, dinner: false, campus, deadline: deadlineForMealWeek(wk), closedDays: [], lunchPrice: '', dinnerPrice: '' });
    setEvStudentSearch('');
    setCreateKind(kind);
    setEventModalOpen(true);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, evRes, exRes, otRes, mealRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/campus-events', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/mock-exams', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/ot-events', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/meal-plans', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (stuRes.ok) { const j = await stuRes.json(); if (j.success) setStudents(j.data || []); }
      if (evRes.ok) { const j = await evRes.json(); if (j.success) setCampusEvents(j.events || []); }
      if (exRes.ok) { const j = await exRes.json(); if (j.success) setMockExams(j.exams || j.data || []); }
      if (otRes.ok) { const j = await otRes.json(); if (j.success) setOtEvents(j.events || []); }
      if (mealRes.ok) { const j = await mealRes.json(); if (j.success) setMealPlans(j.plans || j.data || []); }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        try { const me = await res.json(); if (me?.campus && me.campus !== 'all') setAdminCampus(me.campus); } catch {}
        await loadAll();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router, loadAll]);

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); router.replace('/admin'); } catch {}
  };

  const handleAddSubmit = async () => {
    if (!addForm.studentId) { toast.error('학생을 선택해 주세요.'); return; }
    setAddBusy(true);
    try {
      const res = await fetch(`/api/admin/students/${addForm.studentId}/leave`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addForm.type, date: addForm.date, reason: addForm.reason, status: addForm.status }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudents((prev) => prev.map((s) => s.id === addForm.studentId ? json.student : s));
        toast.success('수기 신청이 등록됐습니다.');
        setAddModalOpen(false);
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러가 발생했습니다.'); } finally { setAddBusy(false); }
  };

  const handleEventSubmit = async () => {
    if (!evForm.title.trim()) { toast.error('일정 이름을 입력해 주세요.'); return; }
    if (!evForm.date) { toast.error('날짜를 선택해 주세요.'); return; }
    if (evForm.isMission && evForm.targetMode === 'students' && evForm.targetStudentIds.length === 0) {
      toast.error('대상 학생을 1명 이상 선택해 주세요.'); return;
    }
    setEvBusy(true);
    try {
      const res = await fetch('/api/admin/campus-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: evForm.title.trim(),
          date: evForm.date,
          endDate: evForm.endDate || undefined,
          startTime: evForm.startTime || undefined,
          endTime: evForm.endTime || undefined,
          campus: evForm.campus,
          memo: evForm.memo.trim() || undefined,
          isMission: evForm.isMission,
          couponReward: evForm.isMission ? evForm.couponReward : undefined,
          targetMode: evForm.isMission ? evForm.targetMode : undefined,
          targetStudentIds: evForm.isMission && evForm.targetMode === 'students' ? evForm.targetStudentIds : undefined,
          // 참여 미션이 아닐 때만 응답 모드 전달 (미션은 서버에서 attendance 강제)
          responseMode: evForm.isMission ? undefined : evForm.responseMode,
          postTaskLabel: !evForm.isMission && evForm.responseMode === 'postTask' ? evForm.postTaskLabel.trim() || undefined : undefined,
          postTaskDueDate: !evForm.isMission && evForm.responseMode === 'postTask' ? evForm.postTaskDueDate || undefined : undefined,
          postTaskHref: !evForm.isMission && evForm.responseMode === 'postTask' ? evForm.postTaskHref.trim() || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCampusEvents((prev) => [json.event, ...prev]);
        setSelectedDate(json.event.date);
        toast.success(evForm.isMission ? '참여 미션이 등록됐습니다.' : '일정이 등록됐습니다.');
        setEventModalOpen(false);
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러가 발생했습니다.'); } finally { setEvBusy(false); }
  };

  const deleteEvent = async (eventId: string) => {
    if (!(await confirm({ title: '이 일정을 삭제할까요?', tone: 'danger', confirmText: '삭제' }))) return;
    try {
      const res = await fetch(`/api/admin/campus-events?eventId=${encodeURIComponent(eventId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setCampusEvents((prev) => prev.filter((e) => e.id !== eventId));
        toast.success('삭제되었습니다.');
      } else { toast.error(json.message || '삭제 실패'); }
    } catch { toast.error('네트워크 에러'); }
  };

  const notifyEvent = async (eventId: string, action: 'send' | 'cancel' = 'send', studentIds?: string[]) => {
    if (action === 'cancel' && !(await confirm({ title: '발송된 참여 미션 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    const key = `notify_${eventId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/campus-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action, ...(studentIds ? { studentIds } : {}) }),
      });
      const json = await res.json();
      if (json.success) {
        setCampusEvents((prev) => prev.map((e) => e.id === eventId ? json.event : e));
        setPicker(null);
        toast.success(action === 'cancel' ? '참여 미션 알림을 취소했습니다.'
          : studentIds ? `${studentIds.length}명에게 참여 확인 알림을 발송했습니다.` : '학생들에게 참여 확인 알림을 발송했습니다.');
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  // ── 캘린더에서 직접 생성: 모의고사 · OT · 도시락 ──
  const submitMock = async () => {
    if (!mockForm.name.trim() || !mockForm.date) { toast.error('시험명과 날짜를 입력해 주세요.'); return; }
    setEvBusy(true);
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ name: mockForm.name.trim(), date: mockForm.date, targetExamTypes: mockForm.targetTypes, campus: mockForm.campus }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMockExams((prev) => [json.exam, ...prev]);
        setSelectedDate(json.exam.date);
        setEventModalOpen(false);
        toast.success('모의고사 일정이 등록됐습니다.');
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setEvBusy(false); }
  };

  const submitOt = async () => {
    if (!otForm.name.trim() || !otForm.date) { toast.error('OT명과 날짜를 입력해 주세요.'); return; }
    setEvBusy(true);
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ name: otForm.name.trim(), date: otForm.date, campus: otForm.campus, message: otForm.message.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setOtEvents((prev) => [json.event, ...prev]);
        setSelectedDate(json.event.date);
        setEventModalOpen(false);
        toast.success('OT 일정이 등록됐습니다.');
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setEvBusy(false); }
  };

  const submitMeal = async () => {
    const meals: MealKind[] = [];
    if (mealForm.lunch) meals.push('lunch');
    if (mealForm.dinner) meals.push('dinner');
    if (meals.length === 0) { toast.error('점심/저녁 중 하나 이상을 선택해 주세요.'); return; }
    // 주·센터당 1라운드 불변조건 — 이미 있으면 막고 안내.
    const dup = mealPlans.some((p) => p.weekStart === mealForm.weekStart && (p.campus || 'all') === (mealForm.campus || 'all'));
    if (dup) { toast.error('해당 주·센터에는 이미 도시락 라운드가 있습니다. 도시락 관리에서 수정하세요.'); return; }
    setEvBusy(true);
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          weekStart: mealForm.weekStart, meals, campus: mealForm.campus,
          deadline: toKstIsoFromDateTimeLocal(mealForm.deadline),
          closedDays: mealForm.closedDays,
          lunchPrice: mealForm.lunchPrice || undefined, dinnerPrice: mealForm.dinnerPrice || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMealPlans((prev) => [json.plan, ...prev]);
        setSelectedDate(json.plan.weekStart);
        setEventModalOpen(false);
        toast.success('도시락 라운드가 등록됐습니다.');
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setEvBusy(false); }
  };

  // ── 모의고사 · OT 학생 알림(선택 발송/취소) ──
  const notifyMock = async (examId: string, studentIds: string[]) => {
    const key = `mock_${examId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, action: 'send', studentIds }),
      });
      const json = await res.json();
      if (json.success) {
        setMockExams((prev) => prev.map((e) => e.id === examId ? json.exam : e));
        setPicker(null);
        toast.success(`${studentIds.length}명에게 모의고사 알림을 발송했습니다.`);
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };
  const cancelMock = async (examId: string) => {
    if (!(await confirm({ title: '발송된 모의고사 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    const key = `mock_${examId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, action: 'cancel' }),
      });
      const json = await res.json();
      if (json.success) { setMockExams((prev) => prev.map((e) => e.id === examId ? json.exam : e)); toast.success('모의고사 알림을 취소했습니다.'); }
      else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const notifyOt = async (eventId: string, studentIds: string[]) => {
    const key = `ot_${eventId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'send', studentIds }),
      });
      const json = await res.json();
      if (json.success) {
        setOtEvents((prev) => prev.map((e) => e.id === eventId ? json.event : e));
        setPicker(null);
        toast.success(`${studentIds.length}명에게 OT 알림을 발송했습니다.`);
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };
  const cancelOt = async (eventId: string) => {
    if (!(await confirm({ title: '발송된 OT 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    const key = `ot_${eventId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/ot-events', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, action: 'cancel' }),
      });
      const json = await res.json();
      if (json.success) { setOtEvents((prev) => prev.map((e) => e.id === eventId ? json.event : e)); toast.success('OT 알림을 취소했습니다.'); }
      else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  // ── 도시락 학생 알림(캠퍼스 단위 · 대상 필터 없음) ──
  const notifyMeal = async (planId: string, action: 'send' | 'cancel') => {
    if (action === 'cancel' && !(await confirm({ title: '발송된 도시락 알림을 취소할까요?', tone: 'danger', confirmText: '취소' }))) return;
    const key = `meal_${planId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, ...(action === 'cancel' ? { action: 'cancel' } : {}) }),
      });
      const json = await res.json();
      if (json.success) {
        setMealPlans((prev) => prev.map((p) => p.id === planId ? json.plan : p));
        toast.success(action === 'cancel' ? '도시락 알림을 취소했습니다.' : '학생들에게 도시락 신청 알림을 발송했습니다.');
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  // 참여미션 알림 피커 오픈 — 후보 풀·응답상태 스냅샷 준비
  const openMissionPicker = (event: CampusEvent) => {
    const pool = students.filter((s) => {
      if (event.targetMode === 'students') return (event.targetStudentIds || []).includes(s.id);
      return !event.campus || event.campus === 'all' || event.campus === s.campus;
    });
    const participations = new Map<string, 'accepted' | 'declined' | 'pending'>();
    for (const s of pool) {
      const p = (s.eventParticipations || []).find((x) => x.eventId === event.id);
      participations.set(s.id, p?.status === 'accepted' ? 'accepted' : p?.status === 'declined' ? 'declined' : 'pending');
    }
    setPicker({ kind: 'mission', id: event.id, name: event.title, campus: event.campus, participations, pool });
  };

  const grantEventCoupons = async (event: CampusEvent) => {
    const key = `grant_${event.id}`;
    if (!(await confirm({ title: '쿠폰을 일괄 지급할까요?', description: `수락한 참여자에게 쿠폰 ${event.couponReward || 0}장을 지급합니다.`, confirmText: '지급' }))) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch('/api/admin/campus-events/grant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.rewardedStudents}명에게 쿠폰 ${json.totalCoupons}장 지급 완료`);
        setCampusEvents((prev) => prev.map((e) => e.id === event.id ? json.event : e));
        await loadAll();
      } else { toast.error(json.message || '지급 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const setParticipation = async (studentId: string, eventId: string, status: 'accepted' | 'declined') => {
    const key = `part_${studentId}_${eventId}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/event-participation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, status }),
      });
      const json = await res.json();
      if (json.success) {
        setStudents((prev) => prev.map((s) => {
          if (s.id !== studentId) return s;
          const rest = (s.eventParticipations || []).filter((p) => p.eventId !== eventId);
          return { ...s, eventParticipations: [...rest, json.entry] };
        }));
      } else { toast.error(json.message || '변경 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  // ── 집계 ──
  const allEvents: LeaveEvent[] = useMemo(() => {
    const events: LeaveEvent[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const r of s.leaveRequests || []) {
        if (statusFilter !== 'all' && r.status !== statusFilter) continue;
        events.push({ student: s, request: r });
      }
    }
    return events;
  }, [students, campusFilter, statusFilter]);

  const matchCampus = useCallback((c?: string) => {
    if (campusFilter === 'all') return true;
    return !c || c === 'all' || c === campusFilter;
  }, [campusFilter]);

  // 날짜별 campus_events / mock_exams / ot_events
  const campusEventsByDate = useMemo(() => {
    const map: Record<string, CampusEvent[]> = {};
    for (const ev of campusEvents) {
      if (!matchCampus(ev.campus)) continue;
      for (const d of eachDate(ev.date, ev.endDate)) {
        (map[d] ||= []).push(ev);
      }
    }
    return map;
  }, [campusEvents, matchCampus]);

  const mockExamsByDate = useMemo(() => {
    const map: Record<string, MockExam[]> = {};
    for (const ex of mockExams) {
      if (!matchCampus(ex.campus)) continue;
      (map[ex.date] ||= []).push(ex);
    }
    return map;
  }, [mockExams, matchCampus]);

  const otEventsByDate = useMemo(() => {
    const map: Record<string, OtEvent[]> = {};
    for (const ot of otEvents) {
      if (!matchCampus(ot.campus)) continue;
      (map[ot.date] ||= []).push(ot);
    }
    return map;
  }, [otEvents, matchCampus]);

  // 도시락 라운드 — 주(월) 단위. 캘린더 칩은 주 시작(월요일) 칸에 표시.
  const mealPlansByDate = useMemo(() => {
    const map: Record<string, MealPlan[]> = {};
    for (const p of mealPlans) {
      if (!matchCampus(p.campus)) continue;
      (map[p.weekStart] ||= []).push(p);
    }
    return map;
  }, [mealPlans, matchCampus]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, LeaveEvent[]> = {};
    for (const ev of allEvents) {
      (map[ev.request.date] ||= []).push(ev);
    }
    return map;
  }, [allEvents]);

  const selectedDateConsultations = useMemo(() => {
    const list: { student: Student; log: any }[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const log of s.consultationLogs || []) {
        if (log.date === selectedDate) list.push({ student: s, log });
      }
    }
    return list;
  }, [students, campusFilter, selectedDate]);

  const selectedDatePenalties = useMemo(() => {
    const list: { student: Student; record: any }[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const record of s.penalties || []) {
        if (record.date === selectedDate) list.push({ student: s, record });
      }
    }
    return list;
  }, [students, campusFilter, selectedDate]);

  // 캘린더 칸 활동 종합
  const activitiesByDate = useMemo(() => {
    const map: Record<string, { leaves: number; consultations: number; penalties: number; events: number; missions: number; exams: number; ot: number; meals: number }> = {};
    const ensure = (d: string) => (map[d] ||= { leaves: 0, consultations: 0, penalties: 0, events: 0, missions: 0, exams: 0, ot: 0, meals: 0 });
    for (const ev of allEvents) ensure(ev.request.date).leaves += 1;
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const log of s.consultationLogs || []) ensure(log.date).consultations += 1;
      for (const p of s.penalties || []) ensure(p.date).penalties += 1;
    }
    for (const [d, list] of Object.entries(campusEventsByDate)) {
      for (const ev of list) { if (ev.isMission) ensure(d).missions += 1; else ensure(d).events += 1; }
    }
    for (const [d, list] of Object.entries(mockExamsByDate)) ensure(d).exams += list.length;
    for (const [d, list] of Object.entries(otEventsByDate)) ensure(d).ot += list.length;
    for (const [d, list] of Object.entries(mealPlansByDate)) ensure(d).meals += list.length;
    return map;
  }, [students, allEvents, campusFilter, campusEventsByDate, mockExamsByDate, otEventsByDate, mealPlansByDate]);

  const calendarDays = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    const startDayOfWeek = (date.getDay() + 6) % 7;
    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) days.push({ date: new Date(currentYear, currentMonth - 1, prevMonthLastDate - i), isCurrentMonth: false });
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= lastDate; i++) days.push({ date: new Date(currentYear, currentMonth, i), isCurrentMonth: true });
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) days.push({ date: new Date(currentYear, currentMonth + 1, i), isCurrentMonth: false });
    return days;
  }, [currentYear, currentMonth]);

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); } else setCurrentMonth((m) => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); } else setCurrentMonth((m) => m + 1); };
  const goToday = () => { const now = new Date(); setCurrentYear(now.getFullYear()); setCurrentMonth(now.getMonth()); setSelectedDate(todayStr); };

  const selectedDateEvents = useMemo(() => eventsByDate[selectedDate] || [], [eventsByDate, selectedDate]);
  const selectedCampusEvents = useMemo(() => campusEventsByDate[selectedDate] || [], [campusEventsByDate, selectedDate]);
  const selectedMockExams = useMemo(() => mockExamsByDate[selectedDate] || [], [mockExamsByDate, selectedDate]);
  const selectedOtEvents = useMemo(() => otEventsByDate[selectedDate] || [], [otEventsByDate, selectedDate]);
  // 선택 날짜가 속한 주(월~금)의 도시락 라운드
  const selectedMealPlans = useMemo(() => mealPlansByDate[mondayOf(selectedDate)] || [], [mealPlansByDate, selectedDate]);

  // 모의고사 대상 직렬 후보 — 학생 contact(직렬) 고유값
  const examTypeOptions = useMemo(
    () => Array.from(new Set(students.map((s) => (s.contact || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [students],
  );

  const groupedEvents = useMemo(() => {
    const groups: Record<LeaveType, LeaveEvent[]> = {
      morning: [], afternoon: [], night: [], fullday: [], personal_halfday: [], personal_fullday: [], sick: [],
    };
    for (const ev of selectedDateEvents) groups[ev.request.type]?.push(ev);
    return groups;
  }, [selectedDateEvents]);

  const patchLeave = async (studentId: string, body: Record<string, unknown>, key: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/leave`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) return json;
      toast.error(json.message || '처리에 실패했습니다.');
      return null;
    } catch { toast.error('네트워크 에러가 발생했습니다.'); return null; }
    finally { setBusy((b) => ({ ...b, [key]: false })); }
  };

  const reviewRequest = async (ev: LeaveEvent, status: 'approved' | 'rejected') => {
    const key = `rev_${ev.request.id}`;
    const reply = (replyDrafts[ev.request.id] || '').trim();
    const json = await patchLeave(ev.student.id, { requestId: ev.request.id, status, reply }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id !== ev.student.id ? s : {
      ...s,
      leaveRequests: (s.leaveRequests || []).map((r) => r.id !== ev.request.id ? r : { ...r, status, adminReply: reply || r.adminReply, reviewedAt: new Date().toISOString() }),
    }));
    toast.success(status === 'approved' ? '승인했습니다.' : '반려했습니다.');
  };

  const adjustCoupon = async (student: Student, delta: number) => {
    const key = `cp_${student.id}`;
    const json = await patchLeave(student.id, { couponDelta: delta }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, leaveCoupons: json.leaveCoupons } : s));
  };

  const openStudentSheet = (student: Student) => openStudent(student, {
    onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
    onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
    allStudents: students,
    defaultTab: 'info',
  });

  // 미션 대상/통계 계산
  const missionStats = (event: CampusEvent) => {
    const targets = students.filter((s) => {
      if (event.recipientStudentIds && event.recipientStudentIds.length) return event.recipientStudentIds.includes(s.id);
      if (event.targetMode === 'students') return (event.targetStudentIds || []).includes(s.id);
      return !event.campus || event.campus === 'all' || event.campus === s.campus;
    });
    let accepted = 0, declined = 0, rewarded = 0;
    for (const s of targets) {
      const p = (s.eventParticipations || []).find((x) => x.eventId === event.id);
      if (p?.status === 'accepted') accepted++;
      else if (p?.status === 'declined') declined++;
      if (p?.rewarded) rewarded++;
    }
    return { targets, total: targets.length, accepted, declined, pending: targets.length - accepted - declined, rewarded };
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-white/5 flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-slate-500 dark:text-slate-400">캘린더 로드 중...</p>
      </div>
    );
  }

  const totalSelected = selectedDateEvents.length + selectedCampusEvents.length + selectedMockExams.length + selectedOtEvents.length + selectedMealPlans.length + selectedDateConsultations.length + selectedDatePenalties.length;

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans no-print">
      <AdminTopNav
        title="학원 캘린더"
        titleIcon={<CalendarIcon className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
        actions={
          <Button size="sm" variant="outline" onClick={loadAll} className="rounded-2xl border-black/[0.05] dark:border-white/10 text-xs h-9.5 bg-white dark:bg-[#1c1c1e] px-3 shadow-sm" title="새로고침">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <main className="stagger-children max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* 상단 컨트롤 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-[#1c1c1e] p-5 rounded-2xl border border-black/[0.05] dark:border-white/10 shadow-sm">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="outline" onClick={prevMonth} className="h-9 w-9 rounded-xl border-black/[0.05] dark:border-white/10"><ChevronLeft className="w-5 h-5" /></Button>
            <h2 className="text-[17px] font-semibold tracking-tight min-w-[100px] text-center">{currentYear}년 {currentMonth + 1}월</h2>
            <Button size="icon" variant="outline" onClick={nextMonth} className="h-9 w-9 rounded-xl border-black/[0.05] dark:border-white/10"><ChevronRight className="w-5 h-5" /></Button>
            <Button size="sm" variant="ghost" onClick={goToday} className="text-xs font-bold text-[#0071E3] hover:bg-[#0071E3]/[0.06] rounded-xl px-3 h-9">오늘</Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 shrink-0">휴가</span>
              <div className="flex items-center bg-[#F5F5F7] dark:bg-white/5 p-1 rounded-xl border border-black/[0.04] dark:border-white/10">
                {([['all', '전체'], ['pending', '대기'], ['approved', '승인'], ['rejected', '반려']] as [StatusFilter, string][]).map(([v, label]) => (
                  <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'ghost'} onClick={() => setStatusFilter(v)}
                    className={`h-7.5 rounded-lg px-2.5 text-[11px] font-bold ${statusFilter === v ? 'bg-white dark:bg-[#1c1c1e] text-black dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-slate-100'}`}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openNoticeModal} className="rounded-xl border-[#0071E3]/30 text-[#0071E3] hover:bg-[#0071E3]/[0.06] dark:hover:bg-[#0071E3]/15 text-xs font-black h-9 px-3.5">
                <Megaphone className="w-4 h-4 mr-1" /> 공지 등록
              </Button>
              <Button size="sm" onClick={() => openEventModal()} className="rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white text-xs font-black h-9 px-3.5 shadow-sm">
                <Plus className="w-4 h-4 mr-1" /> 만들기
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* 달력 */}
          <div className="lg:col-span-2 bg-white dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.05] dark:border-white/10 p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-7 text-center text-xs font-black text-slate-500 dark:text-slate-400 pb-2 border-b border-black/[0.04] dark:border-white/10">
              <div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-600">토</div><div className="text-red-500">일</div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {loading && students.length === 0 ? (
                <div className="col-span-7 py-32 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">불러오는 중...</p>
                </div>
              ) : (
                calendarDays.map(({ date, isCurrentMonth }, idx) => {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  const dateStr = `${y}-${m}-${d}`;
                  const isSelected = selectedDate === dateStr;
                  const isToday = dateStr === todayStr;
                  const act = activitiesByDate[dateStr];

                  return (
                    <button key={idx} onClick={() => setSelectedDate(dateStr)}
                      className={`min-h-[92px] flex flex-col p-1.5 rounded-xl border text-left transition-all relative outline-none focus:ring-1 focus:ring-[#0071E3] ${
                        isSelected ? 'border-[#0071E3] bg-[#0071E3]/[0.02] dark:bg-[#0071E3]/15 shadow-[inset_0_0_0_1px_#0071E3]' : 'border-black/[0.03] dark:border-white/10 hover:bg-[#F5F5F7]/40 dark:hover:bg-white/5'
                      }`}>
                      <span className={`text-[10px] font-black h-5 w-5 flex items-center justify-center rounded-full mb-1 ${
                        !isCurrentMonth ? 'text-slate-300 dark:text-slate-600' : date.getDay() === 0 ? 'text-red-500' : date.getDay() === 6 ? 'text-blue-600' : 'text-slate-900 dark:text-slate-100'
                      } ${isToday ? 'bg-[#0071E3] text-white font-extrabold' : ''}`}>{date.getDate()}</span>

                      {act && (
                        <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden mt-0.5">
                          {act.missions > 0 && <Pill cls="bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/15" icon={<Gift className="w-2.5 h-2.5 shrink-0" />} text={`미션 ${act.missions}`} />}
                          {act.events > 0 && <Pill cls="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-white/10" icon={<Pin className="w-2.5 h-2.5 shrink-0" />} text={`일정 ${act.events}`} />}
                          {act.exams > 0 && <Pill cls="bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/20" icon={<PenLine className="w-2.5 h-2.5 shrink-0" />} text={`모고 ${act.exams}`} />}
                          {act.ot > 0 && <Pill cls="bg-[#F56300]/10 dark:bg-[#F56300]/15 text-[#F56300] border-[#F56300]/20" icon={<GraduationCap className="w-2.5 h-2.5 shrink-0" />} text={`OT ${act.ot}`} />}
                          {act.meals > 0 && <Pill cls="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100/60 dark:border-white/10" icon={<Utensils className="w-2.5 h-2.5 shrink-0" />} text="도시락" />}
                          {act.leaves > 0 && <Pill cls="bg-sky-50 dark:bg-sky-500/10 text-sky-700 border-sky-100/60 dark:border-white/10" icon={<Ticket className="w-2.5 h-2.5 shrink-0" />} text={`휴가 ${act.leaves}`} />}
                          {act.consultations > 0 && <Pill cls="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-100/50 dark:border-white/10" icon={<MessageCircle className="w-2.5 h-2.5 shrink-0" />} text={`상담 ${act.consultations}`} />}
                          {act.penalties > 0 && <Pill cls="bg-red-50 dark:bg-red-500/10 text-red-600 border-red-100/60 dark:border-white/10" icon={<TriangleAlert className="w-2.5 h-2.5 shrink-0" />} text={`벌점 ${act.penalties}`} />}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 상세 패널 */}
          <div className="bg-white dark:bg-[#1c1c1e] rounded-3xl border border-black/[0.05] dark:border-white/10 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/10 bg-[#FAFAFA] dark:bg-white/5 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#0071E3] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight">{selectedDate}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  {totalSelected === 0 ? '기록 없음'
                    : `일정 ${selectedCampusEvents.length} · 모고 ${selectedMockExams.length} · OT ${selectedOtEvents.length} · 도시락 ${selectedMealPlans.length} · 휴가 ${selectedDateEvents.length}`}
                </p>
              </div>
              <button onClick={() => openEventModal()} className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#0071E3] bg-[#0071E3]/[0.07] dark:bg-[#0071E3]/15 hover:bg-[#0071E3]/[0.12] rounded-xl px-3 py-1.5 transition-colors shrink-0">
                <Plus className="w-3.5 h-3.5" /> 만들기
              </button>
            </div>

            <div className="divide-y divide-black/[0.03] dark:divide-white/10 max-h-[720px] overflow-y-auto">
              {totalSelected === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <CalendarIcon className="w-8 h-8 text-slate-200 dark:text-slate-600" />
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">이 날짜에 등록된 일정이 없습니다.</p>
                  <button onClick={() => openEventModal()} className="mt-1 text-[11px] font-bold text-[#0071E3]">+ 일정·모의고사·도시락 만들기</button>
                </div>
              )}

              {/* 1. 일정 & 미션 */}
              {selectedCampusEvents.length > 0 && (
                <div className="pb-3">
                  <SectionHeader color="bg-[#0071E3]" icon={<CalendarHeart className="w-3.5 h-3.5 text-[#0071E3]" />} title="일정 · 참여 미션" count={selectedCampusEvents.length} chip="bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/20" />
                  <div className="px-3 pt-2 space-y-2">
                    {selectedCampusEvents.map((ev) => {
                      const isMissionOpen = expandedMissionId === ev.id;
                      const stat = ev.isMission ? missionStats(ev) : null;
                      const targetList = stat ? stat.targets.filter((s) => !missionSearch || s.name.includes(missionSearch)) : [];
                      return (
                        <div key={ev.id} className={`rounded-xl border overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-sm ${ev.isMission ? 'border-l-[3px] border-l-[#0071E3] border-black/[0.05] dark:border-white/10' : 'border-l-[3px] border-l-slate-400 border-black/[0.05] dark:border-white/10'}`}>
                          <div className="px-3.5 py-2.5 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100">{ev.title}</span>
                                  {ev.isMission
                                    ? <span className="rounded bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] px-1.5 py-0.5 text-[9px] font-black">참여 미션</span>
                                    : <span className="rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black">일정</span>}
                                  <span className="rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black">{campusLabel(ev.campus || 'all')}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                  {ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate}` : ev.date}
                                  {ev.startTime ? ` · ${ev.startTime}${ev.endTime ? `~${ev.endTime}` : ''}` : ''}
                                </p>
                              </div>
                              <button onClick={() => deleteEvent(ev.id)} className="rounded-lg p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition shrink-0" title="삭제">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {ev.memo && <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap break-words rounded-lg bg-slate-50 dark:bg-white/5 px-2.5 py-2">{ev.memo}</p>}

                            {ev.isMission && stat && (
                              <>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold flex-wrap pt-0.5">
                                  <span className="rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5">수락 {stat.accepted}</span>
                                  <span className="rounded bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-1.5 py-0.5">미응답 {stat.pending}</span>
                                  <span className="rounded bg-red-50 dark:bg-red-500/10 text-red-600 px-1.5 py-0.5">불참 {stat.declined}</span>
                                  <span className="rounded bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] px-1.5 py-0.5 inline-flex items-center gap-0.5"><Ticket className="w-2.5 h-2.5" />{ev.couponReward}장</span>
                                  {stat.rewarded > 0 && <span className="rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 px-1.5 py-0.5">지급 {stat.rewarded}</span>}
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                  <button disabled={!!busy[`notify_${ev.id}`]} onClick={() => ev.notifiedAt ? notifyEvent(ev.id, 'cancel') : openMissionPicker(ev)}
                                    title={ev.notifiedAt ? `발송: ${new Date(ev.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '대상을 골라 참여 확인 알림 발송'}
                                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${ev.notifiedAt ? 'border border-red-100 dark:border-white/10 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                    {busy[`notify_${ev.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : ev.notifiedAt ? <X className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                                    {ev.notifiedAt ? '알림 취소' : '학생 알림'}
                                  </button>
                                  <button disabled={!!busy[`grant_${ev.id}`] || !ev.notifiedAt} onClick={() => grantEventCoupons(ev)}
                                    title={!ev.notifiedAt ? '먼저 알림을 발송하세요' : '수락자에게 쿠폰 일괄 지급'}
                                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${ev.rewardedAt ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 border border-amber-200 dark:border-white/10' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'}`}>
                                    {busy[`grant_${ev.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                                    {ev.rewardedAt ? '지급 완료' : '쿠폰 일괄 지급'}
                                  </button>
                                  <button onClick={() => { setExpandedMissionId(isMissionOpen ? null : ev.id); setMissionSearch(''); }}
                                    className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">
                                    참여자 <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMissionOpen ? 'rotate-180' : ''}`} />
                                  </button>
                                </div>

                                {isMissionOpen && (
                                  <div className="rounded-xl border border-black/[0.05] dark:border-white/10 bg-[#FAFAFA] dark:bg-white/5 p-2 space-y-1.5 mt-1">
                                    <div className="relative">
                                      <input value={missionSearch} onChange={(e) => setMissionSearch(e.target.value)} placeholder="학생 검색"
                                        className="w-full rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-7 pr-3 py-1.5 text-[11px] font-semibold focus:border-[#0071E3] focus:outline-none" />
                                      <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    </div>
                                    <div className="max-h-52 overflow-y-auto space-y-1">
                                      {targetList.length === 0 && <p className="text-[11px] text-slate-400 dark:text-slate-400 font-semibold py-2 text-center">대상 학생이 없습니다.</p>}
                                      {targetList.map((s) => {
                                        const p = (s.eventParticipations || []).find((x) => x.eventId === ev.id);
                                        const pk = `part_${s.id}_${ev.id}`;
                                        return (
                                          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white dark:bg-[#1c1c1e] border border-black/[0.04] dark:border-white/10 px-2.5 py-1.5">
                                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">{s.name}
                                              <span className="text-[9px] text-slate-400 ml-1">{campusLabel(s.campus)}</span>
                                              {p?.rewarded && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 px-1 py-0.5 text-[9px] font-black"><Ticket className="w-2 h-2" />지급</span>}
                                            </span>
                                            <button disabled={!!busy[pk]} onClick={() => setParticipation(s.id, ev.id, 'accepted')}
                                              className={`rounded-md px-2 py-1 text-[10px] font-black transition ${p?.status === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-[#1c1c1e] text-slate-400 border border-slate-200 dark:border-white/10 hover:border-emerald-300'}`}>수락</button>
                                            <button disabled={!!busy[pk]} onClick={() => setParticipation(s.id, ev.id, 'declined')}
                                              className={`rounded-md px-2 py-1 text-[10px] font-black transition ${p?.status === 'declined' ? 'bg-slate-500 text-white' : 'bg-white dark:bg-[#1c1c1e] text-slate-400 border border-slate-200 dark:border-white/10 hover:border-slate-300'}`}>불참</button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. 모의고사 */}
              {selectedMockExams.length > 0 && (
                <div className="py-3">
                  <SectionHeader color="bg-[#0071E3]" icon={<ClipboardCheck className="w-3.5 h-3.5 text-[#0071E3]" />} title="모의고사" count={selectedMockExams.length} chip="bg-[#0071E3]/10 dark:bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/25" />
                  <div className="px-3 pt-2 space-y-1.5">
                    {selectedMockExams.map((ex) => (
                      <div key={ex.id} className="rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] border-l-[#0071E3] bg-white dark:bg-[#1c1c1e] shadow-sm p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100 flex-1 min-w-0 truncate">{ex.name}</span>
                          <span className="rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black shrink-0">{campusLabel(ex.campus || 'all')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button disabled={!!busy[`mock_${ex.id}`]} onClick={() => ex.notifiedAt ? cancelMock(ex.id) : setPicker({ kind: 'mock', id: ex.id, name: ex.name, campus: ex.campus, targetExamTypes: ex.targetExamTypes })}
                            title={ex.notifiedAt ? `발송: ${new Date(ex.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '대상을 골라 참여 확인 알림 발송'}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${ex.notifiedAt ? 'border border-red-100 dark:border-white/10 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                            {busy[`mock_${ex.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : ex.notifiedAt ? <X className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                            {ex.notifiedAt ? '알림 취소' : '학생 알림'}
                          </button>
                          <button onClick={() => setMockManagerExam(ex)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">
                            성적·관리 <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. OT */}
              {selectedOtEvents.length > 0 && (
                <div className="py-3">
                  <SectionHeader color="bg-[#F56300]" icon={<CalendarClock className="w-3.5 h-3.5 text-[#F56300]" />} title="OT 특별 세션" count={selectedOtEvents.length} chip="bg-[#F56300]/10 dark:bg-[#F56300]/15 text-[#F56300] border-[#F56300]/25" />
                  <div className="px-3 pt-2 space-y-1.5">
                    {selectedOtEvents.map((ot) => (
                      <div key={ot.id} className="rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] border-l-[#F56300] bg-white dark:bg-[#1c1c1e] shadow-sm p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100 flex-1 min-w-0 truncate">{ot.name}</span>
                          <span className="rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black shrink-0">{campusLabel(ot.campus || 'all')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button disabled={!!busy[`ot_${ot.id}`]} onClick={() => ot.notifiedAt ? cancelOt(ot.id) : setPicker({ kind: 'ot', id: ot.id, name: ot.name, campus: ot.campus })}
                            title={ot.notifiedAt ? `발송: ${new Date(ot.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '대상을 골라 OT 알림 발송'}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${ot.notifiedAt ? 'border border-red-100 dark:border-white/10 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20' : 'bg-[#F56300] text-white hover:bg-[#d95400]'}`}>
                            {busy[`ot_${ot.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : ot.notifiedAt ? <X className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                            {ot.notifiedAt ? '알림 취소' : '학생 알림'}
                          </button>
                          <button onClick={() => setOtManagerEvent(ot)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">
                            응답·관리 <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. 도시락 (주 라운드 — 월~금) */}
              {selectedMealPlans.length > 0 && (
                <div className="py-3">
                  <SectionHeader color="bg-emerald-500" icon={<Utensils className="w-3.5 h-3.5 text-emerald-500" />} title="도시락 라운드" count={selectedMealPlans.length} chip="bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 border-emerald-500/25" />
                  <div className="px-3 pt-2 space-y-1.5">
                    {selectedMealPlans.map((p) => (
                      <div key={p.id} className="rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] border-l-emerald-500 bg-white dark:bg-[#1c1c1e] shadow-sm p-3 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100">{weekRangeLabel(p.weekStart)} 주</span>
                          <span className="rounded bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 text-[9px] font-black">{campusLabel(p.campus || 'all')}</span>
                          <span className="rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 text-[9px] font-black">{(p.meals || []).map((m) => MEAL_KIND_LABELS[m]).join('·')}</span>
                          {p.deadline && <span className="text-[9px] font-bold text-slate-400">마감 {formatDeadline(p.deadline)}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button disabled={!!busy[`meal_${p.id}`]} onClick={() => notifyMeal(p.id, p.notifiedAt ? 'cancel' : 'send')}
                            title={p.notifiedAt ? `발송: ${new Date(p.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '해당 센터 학생에게 도시락 신청 알림 발송'}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${p.notifiedAt ? 'border border-red-100 dark:border-white/10 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-500/20' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                            {busy[`meal_${p.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : p.notifiedAt ? <X className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                            {p.notifiedAt ? '알림 취소' : '학생 알림'}
                          </button>
                          <button onClick={() => setMealManagerPlan(p)} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">
                            신청·정산 <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. 휴식반차 */}
              {selectedDateEvents.length > 0 && (
                <div className="pb-4">
                  <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFA] dark:bg-white/5 border-b border-black/[0.02] dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-5 rounded-full shrink-0 bg-sky-500" />
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5 text-sky-600" /><span>휴식반차 신청</span></span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-sky-50 dark:bg-sky-500/10 text-sky-700 border-sky-200/60 dark:border-white/10">{selectedDateEvents.length}건</span>
                    </div>
                    <button onClick={openAddModal} className="flex items-center gap-1 text-[11px] font-extrabold text-[#0071E3] hover:bg-[#0071E3]/[0.08] dark:hover:bg-[#0071E3]/15 rounded-lg px-2 py-1">
                      <PenLine className="w-3 h-3" /> 수기
                    </button>
                  </div>

                  <div className="px-3 pb-2 pt-2 space-y-1.5">
                    {LEAVE_TYPE_ORDER.map((type) => {
                      const typeEvents = groupedEvents[type];
                      if (typeEvents.length === 0) return null;
                      const typeInfo = LEAVE_TYPES[type];
                      return (
                        <div key={type} className="space-y-1.5">
                          <div className="px-2 py-1 text-[10px] font-black text-slate-400 dark:text-slate-400 flex items-center gap-1.5">
                            <LeaveTypeIcon type={type} className="h-3 w-3 shrink-0" />
                            <span>{getLeaveTypeLabel(type)} ({typeEvents.length}명)</span>
                          </div>
                          {typeEvents.map((ev) => {
                            const isExpanded = expandedRequestId === ev.request.id;
                            const revKey = `rev_${ev.request.id}`;
                            const cpKey = `cp_${ev.student.id}`;
                            const statusBar = ev.request.status === 'approved' ? 'border-l-emerald-400' : ev.request.status === 'rejected' ? 'border-l-red-400' : 'border-l-amber-400';
                            const statusLabel = ev.request.status === 'approved'
                              ? <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />승인</span>
                              : ev.request.status === 'rejected'
                              ? <span className="flex items-center gap-1 text-[10px] font-black text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />반려</span>
                              : <span className="flex items-center gap-1 text-[10px] font-black text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />대기</span>;
                            return (
                              <div key={ev.request.id} className={`rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-sm ${statusBar}`}>
                                <button type="button" onClick={() => setExpandedRequestId(isExpanded ? null : ev.request.id)} className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#F8F9FA] dark:hover:bg-white/5 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100 truncate block">{ev.student.name}</span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{campusLabel(ev.student.campus)} · {ev.student.manager || '담당 없음'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">{statusLabel}<ChevronDown className={`w-3.5 h-3.5 text-slate-300 dark:text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></div>
                                </button>
                                {isExpanded && (
                                  <div className="border-t border-black/[0.04] dark:border-white/10 bg-[#F8F9FA] dark:bg-white/5 px-3.5 pb-3.5 pt-2.5 space-y-3">
                                    {ev.request.reason && (
                                      <div className="rounded-xl bg-white dark:bg-[#1c1c1e] border border-black/[0.05] dark:border-white/10 px-3 py-2.5">
                                        <p className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">신청 사유</p>
                                        <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-relaxed break-words">{ev.request.reason}</p>
                                      </div>
                                    )}
                                    {ev.request.adminReply && (
                                      <div className="rounded-xl bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/15 border border-[#0071E3]/15 px-3 py-2.5">
                                        <p className="text-[9px] font-extrabold text-[#0071E3] uppercase tracking-wide mb-1">답변</p>
                                        <p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">{ev.request.adminReply}</p>
                                      </div>
                                    )}
                                    {ev.request.status === 'pending' && (
                                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <input value={replyDrafts[ev.request.id] ?? ''} onChange={(e) => setReplyDrafts((dft) => ({ ...dft, [ev.request.id]: e.target.value }))}
                                          placeholder="답변 코멘트 입력 (선택)" className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none" />
                                        <div className="grid grid-cols-2 gap-2">
                                          <Button size="sm" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'approved')} className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"><Check className="w-3.5 h-3.5 mr-1" /> 승인</Button>
                                          <Button size="sm" variant="outline" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'rejected')} className="h-9 rounded-xl border-red-200 dark:border-white/10 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs font-bold"><X className="w-3.5 h-3.5 mr-1" /> 반려</Button>
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between rounded-xl bg-white dark:bg-[#1c1c1e] border border-black/[0.05] dark:border-white/10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-900 dark:text-slate-100"><Ticket className="w-3 h-3 text-slate-500" />쿠폰 <b className="text-[#0071E3]">{ev.student.leaveCoupons ?? 0}</b>개</span>
                                      <div className="flex items-center gap-1">
                                        <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10"><Minus className="w-3 h-3" /></Button>
                                        <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10"><Plus className="w-3 h-3" /></Button>
                                        <Button size="sm" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, COUPONS_PER_EXTRA_HALFDAY)} className="h-7 rounded-lg border-black/[0.08] dark:border-white/10 text-[10px] px-2 font-bold">+{COUPONS_PER_EXTRA_HALFDAY}</Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. 상담 */}
              {selectedDateConsultations.length > 0 && (
                <div className="py-4">
                  <SectionHeader color="bg-emerald-500" icon={<MessageSquare className="w-3.5 h-3.5 text-emerald-600" />} title="당일 상담 진행" count={selectedDateConsultations.length} chip="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-200/60 dark:border-white/10" />
                  <div className="px-3 pt-2 space-y-2">
                    {selectedDateConsultations.map(({ student, log }) => (
                      <div key={log.id} onClick={() => openStudentSheet(student)} className="rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] border-l-emerald-500 bg-white dark:bg-[#1c1c1e] shadow-sm hover:bg-[#F8F9FA] dark:hover:bg-white/5 transition cursor-pointer p-3.5 space-y-2">
                        <div className="flex justify-between items-start">
                          <div><span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100">{student.name}</span><span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-2">{campusLabel(student.campus)} · 코멘터 {student.manager || '없음'}</span></div>
                          <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">코멘터 {log.manager}</span>
                        </div>
                        <div className="rounded-lg bg-emerald-50/[0.2] dark:bg-emerald-500/10 border border-emerald-100/30 dark:border-white/10 p-2.5"><p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{log.content}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. 벌점/상점 */}
              {selectedDatePenalties.length > 0 && (
                <div className="py-4">
                  <SectionHeader color="bg-amber-500" icon={<ShieldAlert className="w-3.5 h-3.5 text-amber-600" />} title="당일 벌점·상점" count={selectedDatePenalties.length} chip="bg-amber-50 dark:bg-amber-500/10 text-amber-700 border-amber-200/60 dark:border-white/10" />
                  <div className="px-3 pt-2 space-y-2">
                    {selectedDatePenalties.map(({ student, record }) => {
                      const isPenalty = record.type === 'penalty';
                      return (
                        <div key={record.id} onClick={() => openStudentSheet(student)} className={`rounded-xl border border-black/[0.05] dark:border-white/10 border-l-[3px] bg-white dark:bg-[#1c1c1e] shadow-sm hover:bg-[#F8F9FA] dark:hover:bg-white/5 transition cursor-pointer p-3.5 space-y-2 ${isPenalty ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
                          <div className="flex justify-between items-center">
                            <div><span className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100">{student.name}</span><span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-2">{campusLabel(student.campus)}</span></div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${isPenalty ? 'bg-red-50 dark:bg-red-500/10 text-red-700 border-red-100/50 dark:border-white/10' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-100/50 dark:border-white/10'}`}>{isPenalty ? '벌점' : '상점'} {record.points}점</span>
                          </div>
                          <div className="rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 p-2.5"><p className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-relaxed break-words">{record.reason}</p></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 일정/미션 등록 모달 */}
      <Dialog open={eventModalOpen} onOpenChange={setEventModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2"><CalendarHeart className="w-4 h-4 text-[#0071E3]" /> 캘린더에 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* 종류 선택 */}
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ['event', '일정·미션', <CalendarHeart key="i" className="w-3.5 h-3.5" />],
                ['mock', '모의고사', <ClipboardCheck key="i" className="w-3.5 h-3.5" />],
                ['ot', 'OT', <CalendarClock key="i" className="w-3.5 h-3.5" />],
                ['meal', '도시락', <Utensils key="i" className="w-3.5 h-3.5" />],
              ] as [CreateKind, string, React.ReactNode][]).map(([k, l, ic]) => (
                <button key={k} type="button" onClick={() => setCreateKind(k)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-black transition ${createKind === k ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>
                  {ic}{l}
                </button>
              ))}
            </div>

            {createKind === 'event' && (<>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">일정 이름</Label>
              <input value={evForm.title} onChange={(e) => setEvForm((f) => ({ ...f, title: e.target.value }))} placeholder="예: 클린데이, 개원기념 휴무"
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">시작일</Label>
                <input type="date" value={evForm.date} onChange={(e) => setEvForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">종료일 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                <input type="date" value={evForm.endDate} min={evForm.date} onChange={(e) => setEvForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">시작 시각 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                <input type="time" value={evForm.startTime} onChange={(e) => setEvForm((f) => ({ ...f, startTime: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">종료 시각 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                <input type="time" value={evForm.endTime} onChange={(e) => setEvForm((f) => ({ ...f, endTime: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 센터</Label>
              <select value={evForm.campus} onChange={(e) => setEvForm((f) => ({ ...f, campus: e.target.value }))} disabled={adminCampus !== 'all'}
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3] disabled:opacity-70">
                <option value="all">전체 센터</option><option value="wonju">원주</option><option value="chuncheon">춘천</option><option value="chungju">충주</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">안내 메모 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택, 학생 알림에 노출)</span></Label>
              <textarea value={evForm.memo} onChange={(e) => setEvForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="예: 오후 2시 강의실 청소 봉사"
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm bg-white dark:bg-[#1c1c1e] px-3 py-2 focus:outline-none focus:border-[#0071E3] resize-none" />
            </div>

            {/* 학생 응답 방식 — 참여 미션이면 자동 참석 응답이므로 숨김 */}
            {!evForm.isMission && (
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">학생 응답 방식</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['none', '알림만', '공지'],
                    ['attendance', '참석 응답', '참석/불참'],
                    ['postTask', '사후 과제', '종료 후 제출'],
                  ] as const).map(([v, l, sub]) => (
                    <button key={v} type="button" onClick={() => setEvForm((f) => ({ ...f, responseMode: v }))}
                      className={`rounded-xl border py-2 px-1 text-center transition ${evForm.responseMode === v ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>
                      <span className="block text-[11px] font-extrabold">{l}</span>
                      <span className={`block text-[9px] font-bold ${evForm.responseMode === v ? 'text-white/70' : 'text-slate-400'}`}>{sub}</span>
                    </button>
                  ))}
                </div>
                {evForm.responseMode === 'postTask' && (
                  <div className="space-y-2 pt-1.5">
                    <input value={evForm.postTaskLabel} onChange={(e) => setEvForm((f) => ({ ...f, postTaskLabel: e.target.value }))} placeholder="과제 안내 (예: 후기 제출, 사진 업로드)"
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">마감일 <span className="font-medium">(선택)</span></Label>
                        <input type="date" value={evForm.postTaskDueDate} min={evForm.date} onChange={(e) => setEvForm((f) => ({ ...f, postTaskDueDate: e.target.value }))}
                          className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">이동 링크 <span className="font-medium">(선택)</span></Label>
                        <input value={evForm.postTaskHref} onChange={(e) => setEvForm((f) => ({ ...f, postTaskHref: e.target.value }))} placeholder="/report/... 또는 https://"
                          className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 참여 미션 토글 */}
            <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] dark:bg-[#0071E3]/15 p-3.5 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={evForm.isMission} onChange={(e) => setEvForm((f) => ({ ...f, isMission: e.target.checked }))} className="w-4 h-4 accent-[#0071E3]" />
                <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-[#0071E3]" /> 참여 미션으로 만들기 (쿠폰 지급)</span>
              </label>
              {evForm.isMission && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 shrink-0">지급 쿠폰</Label>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" onClick={() => setEvForm((f) => ({ ...f, couponReward: Math.max(0, f.couponReward - 1) }))} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10"><Minus className="w-3 h-3" /></Button>
                      <span className="w-9 text-center text-sm font-black text-[#0071E3]">{evForm.couponReward}</span>
                      <Button size="icon" variant="outline" onClick={() => setEvForm((f) => ({ ...f, couponReward: f.couponReward + 1 }))} className="h-7 w-7 rounded-lg border-black/[0.08] dark:border-white/10"><Plus className="w-3 h-3" /></Button>
                      <span className="text-[10px] text-slate-400 font-bold ml-1">장 · 행사 후 일괄 지급</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">대상 선정</Label>
                    <div className="flex gap-1.5">
                      {([['campus', '센터 전체'], ['students', '특정 인원']] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setEvForm((f) => ({ ...f, targetMode: v }))}
                          className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition ${evForm.targetMode === v ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  {evForm.targetMode === 'students' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">대상 학생 ({evForm.targetStudentIds.length}명)</Label>
                        <button type="button" onClick={() => setEvForm((f) => ({ ...f, targetStudentIds: [] }))} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">전체 해제</button>
                      </div>
                      <div className="relative">
                        <input value={evStudentSearch} onChange={(e) => setEvStudentSearch(e.target.value)} placeholder="학생 검색"
                          className="w-full rounded-lg border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1c1c1e] pl-7 pr-3 py-1.5 text-[11px] font-semibold focus:border-[#0071E3] focus:outline-none" />
                        <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>
                      <div className="max-h-44 overflow-y-auto rounded-xl border border-black/[0.06] dark:border-white/10 divide-y divide-black/[0.03] dark:divide-white/10">
                        {[...students]
                          .filter((s) => evForm.campus === 'all' || s.campus === evForm.campus)
                          .filter((s) => !evStudentSearch || s.name.includes(evStudentSearch))
                          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                          .map((s) => {
                            const checked = evForm.targetStudentIds.includes(s.id);
                            return (
                              <label key={s.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                                <input type="checkbox" checked={checked} onChange={() => setEvForm((f) => ({
                                  ...f, targetStudentIds: checked ? f.targetStudentIds.filter((id) => id !== s.id) : [...f.targetStudentIds, s.id],
                                }))} className="w-3.5 h-3.5 accent-[#0071E3]" />
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{s.name}</span>
                                <span className="text-[9px] text-slate-400 ml-auto">{campusLabel(s.campus)}</span>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </>)}

            {/* 모의고사 필드셋 */}
            {createKind === 'mock' && (<>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">시험명</Label>
                <input value={mockForm.name} onChange={(e) => setMockForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 6월 전국모의고사"
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">날짜</Label>
                  <input type="date" value={mockForm.date} onChange={(e) => setMockForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 센터</Label>
                  <select value={mockForm.campus} onChange={(e) => setMockForm((f) => ({ ...f, campus: e.target.value }))} disabled={adminCampus !== 'all'}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3] disabled:opacity-70">
                    <option value="all">전체 센터</option><option value="wonju">원주</option><option value="chuncheon">춘천</option><option value="chungju">충주</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 직렬 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택 · 미지정 시 센터 전체)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {examTypeOptions.length === 0 && <span className="text-[11px] font-semibold text-slate-400">등록된 직렬 정보가 없습니다.</span>}
                  {examTypeOptions.map((t) => {
                    const on = mockForm.targetTypes.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => setMockForm((f) => ({ ...f, targetTypes: on ? f.targetTypes.filter((x) => x !== t) : [...f.targetTypes, t] }))}
                        className={`rounded-xl px-3 py-1.5 text-[11px] font-black border transition active:scale-95 ${on ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:border-slate-300'}`}>{t}</button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] font-semibold text-slate-400">등록 후 날짜 패널에서 대상을 골라 알림을 보낼 수 있습니다. 성적 입력은 모의고사 관리에서.</p>
            </>)}

            {/* OT 필드셋 */}
            {createKind === 'ot' && (<>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">OT명</Label>
                <input value={otForm.name} onChange={(e) => setOtForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 신규 원생 오리엔테이션"
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">날짜</Label>
                  <input type="date" value={otForm.date} onChange={(e) => setOtForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 센터</Label>
                  <select value={otForm.campus} onChange={(e) => setOtForm((f) => ({ ...f, campus: e.target.value }))} disabled={adminCampus !== 'all'}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3] disabled:opacity-70">
                    <option value="all">전체 센터</option><option value="wonju">원주</option><option value="chuncheon">춘천</option><option value="chungju">충주</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">안내 메시지 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                <textarea value={otForm.message} onChange={(e) => setOtForm((f) => ({ ...f, message: e.target.value }))} rows={2} placeholder="학생에게 보여줄 안내"
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm bg-white dark:bg-[#1c1c1e] px-3 py-2 focus:outline-none focus:border-[#0071E3] resize-none" />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">날짜 3일 전부터 학생에게 자동 노출되며, 대상을 골라 즉시 알림도 보낼 수 있습니다.</p>
            </>)}

            {/* 도시락 필드셋 */}
            {createKind === 'meal' && (<>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">주 (월요일 기준)</Label>
                <input type="date" value={mealForm.weekStart}
                  onChange={(e) => { const wk = mondayOf(e.target.value); setMealForm((f) => ({ ...f, weekStart: wk, deadline: deadlineForMealWeek(wk) })); }}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                <p className="text-[10px] font-semibold text-slate-400">{weekRangeLabel(mealForm.weekStart)} 주 (월~금) 라운드가 만들어집니다.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">끼니</Label>
                  <div className="flex gap-1.5">
                    {([['lunch', '점심'], ['dinner', '저녁']] as const).map(([k, l]) => {
                      const on = k === 'lunch' ? mealForm.lunch : mealForm.dinner;
                      return (
                        <button key={k} type="button" onClick={() => setMealForm((f) => ({ ...f, [k]: !on }))}
                          className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>{l}</button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 센터</Label>
                  <select value={mealForm.campus} onChange={(e) => setMealForm((f) => ({ ...f, campus: e.target.value }))} disabled={adminCampus !== 'all'}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3] disabled:opacity-70">
                    <option value="all">전체 센터</option><option value="wonju">원주</option><option value="chuncheon">춘천</option><option value="chungju">충주</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">신청 마감</Label>
                <input type="datetime-local" value={mealForm.deadline} onChange={(e) => setMealForm((f) => ({ ...f, deadline: e.target.value }))}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">신청 안 받는 요일 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                <div className="flex gap-1.5">
                  {MEAL_DAYS.map((d) => {
                    const on = mealForm.closedDays.includes(d);
                    return (
                      <button key={d} type="button" onClick={() => setMealForm((f) => ({ ...f, closedDays: on ? f.closedDays.filter((x) => x !== d) : [...f.closedDays, d] }))}
                        className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition ${on ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>{MEAL_DAY_LABELS[d]}</button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mealForm.lunch && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">점심 단가 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                    <input type="number" inputMode="numeric" value={mealForm.lunchPrice} onChange={(e) => setMealForm((f) => ({ ...f, lunchPrice: e.target.value }))} placeholder="원"
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                  </div>
                )}
                {mealForm.dinner && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">저녁 단가 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
                    <input type="number" inputMode="numeric" value={mealForm.dinnerPrice} onChange={(e) => setMealForm((f) => ({ ...f, dinnerPrice: e.target.value }))} placeholder="원"
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
                  </div>
                )}
              </div>
              <p className="text-[11px] font-semibold text-slate-400">주·센터당 한 라운드만 만들 수 있습니다. 인쇄·정산은 도시락 관리에서.</p>
            </>)}

            <Button
              onClick={createKind === 'event' ? handleEventSubmit : createKind === 'mock' ? submitMock : createKind === 'ot' ? submitOt : submitMeal}
              disabled={evBusy || (createKind === 'event' ? !evForm.title.trim() : createKind === 'mock' ? !mockForm.name.trim() : createKind === 'ot' ? !otForm.name.trim() : !(mealForm.lunch || mealForm.dinner))}
              className="w-full h-11 rounded-xl bg-slate-900 hover:bg-[#323236] text-white font-extrabold text-sm">
              {evBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : '등록하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 알림 대상 선택 피커 — 참여미션/모의고사/OT 공용 */}
      {picker && (
        <RecipientPickerModal
          key={picker.id}
          eventName={picker.name}
          kindLabel={picker.kind === 'mission' ? '참여 미션' : picker.kind === 'mock' ? '모의고사' : 'OT'}
          students={picker.kind === 'mission' ? picker.pool : students}
          campus={picker.campus}
          targetExamTypes={picker.kind === 'mock' ? picker.targetExamTypes : undefined}
          participations={picker.kind === 'mission' ? picker.participations : undefined}
          showStatusFilter={picker.kind === 'mission'}
          sending={picker.kind === 'mission' ? !!busy[`notify_${picker.id}`] : picker.kind === 'mock' ? !!busy[`mock_${picker.id}`] : !!busy[`ot_${picker.id}`]}
          onCancel={() => setPicker(null)}
          onSend={(ids) => picker.kind === 'mission' ? notifyEvent(picker.id, 'send', ids) : picker.kind === 'mock' ? notifyMock(picker.id, ids) : notifyOt(picker.id, ids)}
        />
      )}

      {/* 모의고사 성적·출결 관리 (전체화면 오버레이) */}
      {mockManagerExam && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto print-host" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
            <div className="print-mgmt-card w-full max-w-5xl rounded-3xl bg-[#F8F9FA] dark:bg-[#0b0b0c] shadow-2xl">
              <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3.5 border-b border-black/[0.06] dark:border-white/10 bg-white/90 dark:bg-[#0b0b0c]/90 backdrop-blur rounded-t-3xl">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
                  <ClipboardCheck className="w-4 h-4 text-[#0071E3] shrink-0" /> <span className="truncate">{mockManagerExam.name} · 성적·출결 관리</span>
                </h3>
                <button onClick={() => setMockManagerExam(null)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 sm:p-5">
                <MockExamManager exam={mockManagerExam} students={students} onStudentsChange={setStudents} adminCampus={adminCampus} />
              </div>
            </div>
          </div>
        </div>, document.body,
      )}

      {/* OT 출결·쿠폰 관리 (전체화면 오버레이) */}
      {otManagerEvent && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto print-host" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
            <div className="print-mgmt-card w-full max-w-5xl rounded-3xl bg-[#F8F9FA] dark:bg-[#0b0b0c] shadow-2xl">
              <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3.5 border-b border-black/[0.06] dark:border-white/10 bg-white/90 dark:bg-[#0b0b0c]/90 backdrop-blur rounded-t-3xl">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
                  <CalendarClock className="w-4 h-4 text-[#F56300] shrink-0" /> <span className="truncate">{otManagerEvent.name} · OT 출결·쿠폰 관리</span>
                </h3>
                <button onClick={() => setOtManagerEvent(null)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 sm:p-5">
                <OtEventManager event={otManagerEvent} students={students} onStudentsChange={setStudents} adminCampus={adminCampus} />
              </div>
            </div>
          </div>
        </div>, document.body,
      )}

      {/* 도시락 라운드 관리 (전체화면 오버레이 · A4 인쇄 포함) */}
      {mealManagerPlan && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto print-host" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
            <div className="print-mgmt-card w-full max-w-5xl rounded-3xl bg-[#F8F9FA] dark:bg-[#0b0b0c] shadow-2xl">
              <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3.5 border-b border-black/[0.06] dark:border-white/10 bg-white/90 dark:bg-[#0b0b0c]/90 backdrop-blur rounded-t-3xl">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
                  <Utensils className="w-4 h-4 text-emerald-500 shrink-0" /> <span className="truncate">{weekRangeLabel(mealManagerPlan.weekStart)} 주 도시락 관리</span>
                </h3>
                <button onClick={() => setMealManagerPlan(null)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 transition shrink-0"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 sm:p-5">
                <MealPlanManager
                  plan={mealManagerPlan}
                  students={students}
                  onStudentsChange={setStudents}
                  onPlanChange={(p) => { setMealPlans((prev) => prev.map((x) => (x.id === p.id ? p : x))); setMealManagerPlan(p); }}
                  onReloadNeeded={loadAll}
                  adminCampus={adminCampus}
                />
              </div>
            </div>
          </div>
        </div>, document.body,
      )}

      {/* 사진 공지 등록 모달 */}
      <Dialog open={noticeModalOpen} onOpenChange={(open) => {
        if (!open && noticeForm.previewUrl) URL.revokeObjectURL(noticeForm.previewUrl);
        setNoticeModalOpen(open);
      }}>
        <DialogContent className="max-w-md rounded-3xl p-6 max-h-[88vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2"><Megaphone className="w-4 h-4 text-[#0071E3]" /> 사진 공지 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              사진은 업로드 전 자동 압축됩니다(용량 걱정 없음). 학생 캘린더 해당 날짜에 표시되고, 눌러서 크게 볼 수 있습니다.
            </p>

            {/* 이미지 선택/미리보기 */}
            <label className="block cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleNoticeFile(e.target.files?.[0])} />
              {noticeForm.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={noticeForm.previewUrl} alt="공지 미리보기" className="w-full max-h-64 rounded-2xl object-contain border border-black/[0.08] dark:border-white/10 bg-slate-50 dark:bg-white/5" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/[0.1] dark:border-white/15 py-10 text-slate-400">
                  <ImagePlus className="w-7 h-7" />
                  <span className="text-xs font-bold">공지 사진 선택</span>
                </div>
              )}
            </label>
            {noticeForm.previewUrl && (
              <p className="text-center text-[11px] font-bold text-[#0071E3]">사진을 다시 누르면 교체할 수 있습니다</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">날짜</Label>
                <input type="date" value={noticeForm.date} onChange={(e) => setNoticeForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">대상 센터</Label>
                <select value={noticeForm.campus} onChange={(e) => setNoticeForm((f) => ({ ...f, campus: e.target.value }))} disabled={adminCampus !== 'all'}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3] disabled:opacity-70">
                  <option value="all">전체 센터</option><option value="wonju">원주</option><option value="chuncheon">춘천</option><option value="chungju">충주</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">한 줄 설명 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
              <input value={noticeForm.memo} onChange={(e) => setNoticeForm((f) => ({ ...f, memo: e.target.value }))} placeholder="예: 오늘 하원 시간표 변경 안내"
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
            </div>

            <Button onClick={handleNoticeSubmit} disabled={noticeBusy || !noticeForm.blob} className="w-full h-11 rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white font-extrabold text-sm">
              {noticeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : '공지 등록'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 수기 휴가 추가 모달 */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2"><PenLine className="w-4 h-4 text-[#0071E3]" /> 반차/휴가 수기 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">학생</Label>
              <select value={addForm.studentId} onChange={(e) => setAddForm((f) => ({ ...f, studentId: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]">
                <option value="">-- 학생 선택 --</option>
                {[...students].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((s) => (<option key={s.id} value={s.id}>{s.name} ({campusLabel(s.campus)})</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">유형</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.entries(LEAVE_TYPES) as [LeaveType, typeof LEAVE_TYPES[LeaveType]][]).map(([key, info]) => (
                  <button key={key} type="button" onClick={() => setAddForm((f) => ({ ...f, type: key }))}
                    className={`rounded-xl border px-2 py-2 text-[11px] font-extrabold flex flex-col items-center gap-0.5 transition ${addForm.type === key ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>
                    <LeaveTypeIcon type={key} className="h-4 w-4" /><span>{info.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">날짜</Label>
              <input type="date" value={addForm.date} onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm h-10 bg-white dark:bg-[#1c1c1e] px-3 focus:outline-none focus:border-[#0071E3]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">사유 <span className="text-slate-500 dark:text-slate-400 font-medium">(선택)</span></Label>
              <textarea value={addForm.reason} onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))} placeholder="관리자 수기 등록" rows={2} className="w-full rounded-xl border border-black/[0.08] dark:border-white/10 text-sm bg-white dark:bg-[#1c1c1e] px-3 py-2 focus:outline-none focus:border-[#0071E3] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-slate-900 dark:text-slate-100">등록 상태</Label>
              <div className="flex gap-2">
                {([['approved', '바로 승인'], ['pending', '대기 중']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setAddForm((f) => ({ ...f, status: val }))}
                    className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition inline-flex items-center justify-center gap-1 ${addForm.status === val ? (val === 'approved' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500') : 'bg-white dark:bg-[#1c1c1e] text-slate-900 dark:text-slate-100 border-black/[0.08] dark:border-white/10 hover:bg-[#F5F5F7] dark:hover:bg-white/5'}`}>
                    {val === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}{label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleAddSubmit} disabled={addBusy || !addForm.studentId} className="w-full h-11 rounded-xl bg-slate-900 hover:bg-[#323236] text-white font-extrabold text-sm">
              {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : '등록하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pill({ cls, icon, text }: { cls: string; icon: React.ReactNode; text: string }) {
  return (
    <div className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border truncate flex items-center gap-1 ${cls}`}>
      {icon}<span className="truncate">{text}</span>
    </div>
  );
}

function SectionHeader({ color, icon, title, count, chip }: { color: string; icon: React.ReactNode; title: string; count: number; chip: string }) {
  return (
    <div className="px-5 py-3 flex items-center gap-2 bg-[#FAFAFA] dark:bg-white/5 border-b border-black/[0.02] dark:border-white/10">
      <span className={`w-1.5 h-5 rounded-full shrink-0 ${color}`} />
      <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">{icon}<span>{title}</span></span>
      <span className={`ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${chip}`}>{count}건</span>
    </div>
  );
}
