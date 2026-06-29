'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, RefreshCw, Ticket, Minus, Plus, ChevronDown, PenLine, MessageSquare, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Student, LeaveRequest, LeaveType } from '@/lib/types/student';
import { LEAVE_TYPES, getLeaveTypeLabel, COUPONS_PER_EXTRA_HALFDAY, isLeaveType } from '@/lib/leave';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
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
    default: return '기타';
  }
}

interface LeaveEvent {
  student: Student;
  request: LeaveRequest;
}

export default function AdminLeaveByDatePage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 필터 상태
  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // 날짜 선택 상태 (기본값 오늘)
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-11
  
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);
  
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // 확장해서 보여줄 신청서 ID
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  // 수기 추가 모달
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ studentId: string; type: LeaveType; date: string; reason: string; status: 'pending' | 'approved' }>({
    studentId: '',
    type: 'morning',
    date: todayStr,
    reason: '',
    status: 'approved',
  });
  const [addBusy, setAddBusy] = useState(false);

  const openAddModal = () => {
    setAddForm({ studentId: '', type: 'morning', date: selectedDate, reason: '', status: 'approved' });
    setAddModalOpen(true);
  };

  const handleAddSubmit = async () => {
    if (!addForm.studentId) { toast.error('학생을 선택해 주세요.'); return; }
    setAddBusy(true);
    try {
      const res = await fetch(`/api/admin/students/${addForm.studentId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addForm.type, date: addForm.date, reason: addForm.reason, status: addForm.status }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStudents((prev) => prev.map((s) => s.id === addForm.studentId ? json.student : s));
        toast.success('수기 신청이 등록됐습니다.');
        setAddModalOpen(false);
      } else {
        toast.error(json.message || '등록 실패');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setAddBusy(false);
    }
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      } else {
        toast.error('학생 데이터를 가져오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        await loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.replace('/admin');
    } catch { /* noop */ }
  };

  // 모든 휴가 신청을 단일 리스트로 가공 (필터링 반영)
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

  // 날짜별 이벤트 매핑
  const eventsByDate = useMemo(() => {
    const map: Record<string, LeaveEvent[]> = {};
    for (const ev of allEvents) {
      const d = ev.request.date;
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [allEvents]);

  // 선택된 날짜의 상담 내역 집계
  const selectedDateConsultations = useMemo(() => {
    const list: { student: Student; log: any }[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const log of s.consultationLogs || []) {
        if (log.date === selectedDate) {
          list.push({ student: s, log });
        }
      }
    }
    return list;
  }, [students, campusFilter, selectedDate]);

  // 선택된 날짜의 벌점/상점 내역 집계
  const selectedDatePenalties = useMemo(() => {
    const list: { student: Student; record: any }[] = [];
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      for (const record of s.penalties || []) {
        if (record.date === selectedDate) {
          list.push({ student: s, record });
        }
      }
    }
    return list;
  }, [students, campusFilter, selectedDate]);

  // 날짜별 활동 종합 매핑 (달력 표시용)
  const activitiesByDate = useMemo(() => {
    const map: Record<string, { leaves: number; consultations: number; penalties: number }> = {};
    
    // 1. 휴가 신청 집계
    for (const ev of allEvents) {
      const d = ev.request.date;
      if (!map[d]) map[d] = { leaves: 0, consultations: 0, penalties: 0 };
      map[d].leaves += 1;
    }
    
    // 2. 상담 및 벌점 집계
    for (const s of students) {
      if (campusFilter !== 'all' && s.campus !== campusFilter) continue;
      
      for (const log of s.consultationLogs || []) {
        const d = log.date;
        if (!map[d]) map[d] = { leaves: 0, consultations: 0, penalties: 0 };
        map[d].consultations += 1;
      }
      
      for (const p of s.penalties || []) {
        const d = p.date;
        if (!map[d]) map[d] = { leaves: 0, consultations: 0, penalties: 0 };
        map[d].penalties += 1;
      }
    }
    
    return map;
  }, [students, allEvents, campusFilter]);

  // 달력 일자 계산
  const calendarDays = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    const days = [];
    
    // 첫 주 시작 요일 전까지 이전 달의 날짜로 채우기 (월요일 시작: Mon=0, ..., Sun=6)
    const startDayOfWeek = (date.getDay() + 6) % 7;
    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDate - i),
        isCurrentMonth: false,
      });
    }
    
    // 이번 달 날짜로 채우기
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= lastDate; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }
    
    // 마지막 주 빈칸을 다음 달 날짜로 채우기 (총 42칸 = 6주 완성)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  }, [currentYear, currentMonth]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(todayStr);
  };

  // 선택된 날짜의 신청 정보들
  const selectedDateEvents = useMemo(() => {
    return eventsByDate[selectedDate] || [];
  }, [eventsByDate, selectedDate]);

  // 신청 정보를 유형별로 그룹화
  const groupedEvents = useMemo(() => {
    const groups: Record<LeaveType, LeaveEvent[]> = {
      morning: [],
      afternoon: [],
      night: [],
      fullday: [],
      personal_halfday: [],
      personal_fullday: [],
      sick: [],
    };
    for (const ev of selectedDateEvents) {
      const type = ev.request.type;
      if (groups[type]) {
        groups[type].push(ev);
      }
    }
    return groups;
  }, [selectedDateEvents]);

  const patchLeave = async (studentId: string, body: Record<string, unknown>, key: string) => {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/leave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) return json;
      toast.error(json.message || '처리에 실패했습니다.');
      return null;
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
      return null;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const reviewRequest = async (ev: LeaveEvent, status: 'approved' | 'rejected') => {
    const key = `rev_${ev.request.id}`;
    const reply = (replyDrafts[ev.request.id] || '').trim();
    const json = await patchLeave(ev.student.id, { requestId: ev.request.id, status, reply }, key);
    if (!json) return;
    
    setStudents((prev) => prev.map((s) => s.id !== ev.student.id ? s : {
      ...s,
      leaveRequests: (s.leaveRequests || []).map((r) => r.id !== ev.request.id ? r : {
        ...r, status, adminReply: reply || r.adminReply, reviewedAt: new Date().toISOString(),
      }),
    }));
    toast.success(status === 'approved' ? '승인했습니다.' : '반려했습니다.');
  };

  const adjustCoupon = async (student: Student, delta: number) => {
    const key = `cp_${student.id}`;
    const json = await patchLeave(student.id, { couponDelta: delta }, key);
    if (!json) return;
    setStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, leaveCoupons: json.leaveCoupons } : s));
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-[#86868B]">휴식반차 조회 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <AdminTopNav
        title="휴식반차 날짜별 현황"
        titleIcon={<CalendarIcon className="w-4 h-4 text-[#0071E3]" />}
        campusOptions={CAMPUS_FILTERS.map((c) => ({ value: c, label: c === 'all' ? '전체' : campusLabel(c) }))}
        campusValue={campusFilter}
        onCampusChange={setCampusFilter}
        onLogout={handleLogout}
        actions={
          <Button size="sm" variant="outline" onClick={loadStudents} className="rounded-2xl border-black/[0.05] text-xs h-9.5 bg-white px-3 shadow-sm" title="새로고침">
            <RefreshCw className="w-4 h-4" />
          </Button>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* 상단 컨트롤 및 필터 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-black/[0.05] shadow-sm">
          {/* 달 변경 */}
          <div className="flex items-center gap-3">
            <Button size="icon" variant="outline" onClick={prevMonth} className="h-9 w-9 rounded-xl border-black/[0.05]">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-base font-black tracking-tight min-w-[100px] text-center">
              {currentYear}년 {currentMonth + 1}월
            </h2>
            <Button size="icon" variant="outline" onClick={nextMonth} className="h-9 w-9 rounded-xl border-black/[0.05]">
              <ChevronRight className="w-5 h-5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={goToday} className="text-xs font-bold text-[#0071E3] hover:bg-[#0071E3]/[0.06] rounded-xl px-3 h-9">
              오늘
            </Button>
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-[#86868B] shrink-0">상태 필터</span>
            <div className="flex items-center bg-[#F5F5F7] p-1 rounded-xl border border-black/[0.04]">
              {([['all', '전체'], ['pending', '대기중'], ['approved', '승인됨'], ['rejected', '반려됨']] as [StatusFilter, string][]).map(([v, label]) => (
                <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'ghost'} onClick={() => setStatusFilter(v)}
                  className={`h-7.5 rounded-lg px-3 text-[11px] font-bold ${statusFilter === v ? 'bg-white text-black shadow-sm' : 'text-[#86868B] hover:text-black'}`}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* 메인 레이아웃 (캘린더 + 상세 패널) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* 달력 영역 */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-black/[0.05] p-5 shadow-sm space-y-4">
            {/* 요일 라벨 */}
            <div className="grid grid-cols-7 text-center text-xs font-black text-[#86868B] pb-2 border-b border-black/[0.04]">
              <div>월</div>
              <div>화</div>
              <div>수</div>
              <div>목</div>
              <div>금</div>
              <div className="text-blue-600">토</div>
              <div className="text-red-500">일</div>
            </div>

            {/* 날짜 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {loading ? (
                <div className="col-span-7 py-32 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
                  <p className="text-xs text-[#86868B]">불러오는 중...</p>
                </div>
              ) : (
                calendarDays.map(({ date, isCurrentMonth }, idx) => {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  const dateStr = `${y}-${m}-${d}`;
                  
                  const isSelected = selectedDate === dateStr;
                  const isToday = dateStr === todayStr;
                  const dayEvents = eventsByDate[dateStr] || [];

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`min-h-[90px] flex flex-col p-1.5 rounded-xl border text-left transition-all relative outline-none focus:ring-1 focus:ring-[#0071E3] ${
                        isSelected 
                          ? 'border-[#0071E3] bg-[#0071E3]/[0.02] shadow-[inset_0_0_0_1px_#0071E3]' 
                          : 'border-black/[0.03] hover:bg-[#F5F5F7]/40'
                      }`}
                    >
                      {/* 날짜 표시 */}
                      <span className={`text-[10px] font-black h-5 w-5 flex items-center justify-center rounded-full mb-1 ${
                        !isCurrentMonth ? 'text-slate-300' :
                        date.getDay() === 0 ? 'text-red-500' :
                        date.getDay() === 6 ? 'text-blue-600' : 'text-[#1D1D1F]'
                      } ${isToday ? 'bg-[#0071E3] text-white font-extrabold' : ''}`}>
                        {date.getDate()}
                      </span>

                      {/* 통합 활동 뱃지 리스트 */}
                      <div className="flex-1 w-full flex flex-col gap-1 overflow-hidden mt-1">
                        {(() => {
                          const act = activitiesByDate[dateStr];
                          if (!act) return null;
                          return (
                            <div className="flex flex-col gap-1">
                              {act.leaves > 0 && (
                                <div className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-100/50 truncate flex items-center gap-1">
                                  <span>🎫</span>
                                  <span>휴가 {act.leaves}</span>
                                </div>
                              )}
                              {act.consultations > 0 && (
                                <div className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-100/50 truncate flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3 shrink-0" />
                                  <span>상담 {act.consultations}</span>
                                </div>
                              )}
                              {act.penalties > 0 && (
                                <div className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-100/50 truncate flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3 shrink-0" />
                                  <span>벌점 {act.penalties}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 상세 패널 영역 */}
          <div className="bg-white rounded-3xl border border-black/[0.05] shadow-sm overflow-hidden">
            {/* 패널 헤더 */}
            <div className="px-5 py-4 border-b border-black/[0.04] bg-[#FAFAFA] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#0071E3] shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-black text-[#1D1D1F] leading-tight">{selectedDate}</p>
                <p className="text-[10px] text-[#86868B] font-semibold mt-0.5">
                  {(() => {
                    const l = selectedDateEvents.length;
                    const c = selectedDateConsultations.length;
                    const p = selectedDatePenalties.length;
                    if (l === 0 && c === 0 && p === 0) return '기록 없음';
                    return `휴가 ${l}건 · 상담 ${c}건 · 벌점 ${p}건`;
                  })()}
                </p>
              </div>
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#0071E3] bg-[#0071E3]/[0.07] hover:bg-[#0071E3]/[0.12] rounded-xl px-3 py-1.5 transition-colors shrink-0"
              >
                <PenLine className="w-3.5 h-3.5" />
                수기 추가
              </button>
            </div>

            {selectedDateEvents.length === 0 && selectedDateConsultations.length === 0 && selectedDatePenalties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <CalendarIcon className="w-8 h-8 text-slate-200" />
                <p className="text-xs font-semibold text-[#86868B]">이 날짜에 기록된 현황이 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.03] max-h-[680px] overflow-y-auto">
                
                {/* 1. 휴식반차 신청 목록 */}
                {selectedDateEvents.length > 0 && (
                  <div className="pb-4">
                    <div className="px-5 py-3 flex items-center gap-2 bg-[#FAFAFA] border-b border-black/[0.02]">
                      <span className="w-1.5 h-5 rounded-full shrink-0 bg-blue-500" />
                      <span className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                        <span>🎫</span>
                        <span>휴식반차 신청</span>
                      </span>
                      <span className="ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200/60">
                        {selectedDateEvents.length}건
                      </span>
                    </div>
                    
                    <div className="px-3 pb-2 pt-2 space-y-1.5">
                      {LEAVE_TYPE_ORDER.map((type) => {
                        const typeEvents = groupedEvents[type];
                        if (typeEvents.length === 0) return null;
                        
                        const typeInfo = LEAVE_TYPES[type];
                        const typeAccent: Record<LeaveType, string> = {
                          morning:   'bg-sky-500',
                          afternoon: 'bg-orange-400',
                          night:     'bg-emerald-500',
                          fullday:   'bg-slate-500',
                          personal_halfday: 'bg-sky-400',
                          personal_fullday: 'bg-slate-400',
                          sick:      'bg-rose-500',
                        };
                        const typeChip: Record<LeaveType, string> = {
                          morning:   'bg-sky-50 text-sky-700 border-sky-200/60',
                          afternoon: 'bg-orange-50 text-orange-700 border-orange-200/60',
                          night:     'bg-emerald-50 text-emerald-700 border-emerald-200/60',
                          fullday:   'bg-slate-50 text-slate-700 border-slate-200/60',
                          personal_halfday: 'bg-sky-50 text-sky-600 border-sky-200/40',
                          personal_fullday: 'bg-slate-50 text-slate-600 border-slate-200/40',
                          sick:      'bg-rose-50 text-rose-700 border-rose-200/60',
                        };

                        return (
                          <div key={type} className="space-y-1.5">
                            <div className="px-2 py-1 text-[10px] font-black text-slate-400 flex items-center gap-1.5">
                              <span>{typeInfo?.icon}</span>
                              <span>{getLeaveTypeLabel(type)} ({typeEvents.length}명)</span>
                            </div>
                            
                            {typeEvents.map((ev) => {
                              const isExpanded = expandedRequestId === ev.request.id;
                              const revKey = `rev_${ev.request.id}`;
                              const cpKey = `cp_${ev.student.id}`;
                              const statusBar =
                                ev.request.status === 'approved' ? 'border-l-emerald-400' :
                                ev.request.status === 'rejected' ? 'border-l-red-400' :
                                'border-l-amber-400';
                              const statusLabel =
                                ev.request.status === 'approved'
                                  ? <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />승인</span>
                                  : ev.request.status === 'rejected'
                                  ? <span className="flex items-center gap-1 text-[10px] font-black text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />반려</span>
                                  : <span className="flex items-center gap-1 text-[10px] font-black text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />대기</span>;

                              return (
                                <div key={ev.request.id} className={`rounded-xl border border-black/[0.05] border-l-[3px] overflow-hidden bg-white shadow-sm transition-all duration-200 ${statusBar}`}>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRequestId(isExpanded ? null : ev.request.id)}
                                    className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#F8F9FA] transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="font-extrabold text-[13px] text-[#1D1D1F] truncate block">{ev.student.name}</span>
                                      <span className="text-[10px] text-[#86868B] font-medium">{campusLabel(ev.student.campus)} · {ev.student.manager || '담당 없음'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {statusLabel}
                                      <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                  </button>

                                  {isExpanded && (
                                    <div className="border-t border-black/[0.04] bg-[#F8F9FA] px-3.5 pb-3.5 pt-2.5 space-y-3">
                                      {ev.request.reason && (
                                        <div className="rounded-xl bg-white border border-black/[0.05] px-3 py-2.5">
                                          <p className="text-[9px] font-extrabold text-[#86868B] uppercase tracking-wide mb-1">신청 사유</p>
                                          <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed break-all">{ev.request.reason}</p>
                                        </div>
                                      )}

                                      {ev.request.adminReply && (
                                        <div className="rounded-xl bg-[#0071E3]/[0.04] border border-[#0071E3]/15 px-3 py-2.5">
                                          <p className="text-[9px] font-extrabold text-[#0071E3] uppercase tracking-wide mb-1">답변</p>
                                          <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed">{ev.request.adminReply}</p>
                                        </div>
                                      )}

                                      {ev.request.status === 'pending' && (
                                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            value={replyDrafts[ev.request.id] ?? ''}
                                            onChange={(e) => setReplyDrafts((d) => ({ ...d, [ev.request.id]: e.target.value }))}
                                            placeholder="답변 코멘트 입력 (선택)"
                                            className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[11px] font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                                          />
                                          <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'approved')}
                                              className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">
                                              <Check className="w-3.5 h-3.5 mr-1" /> 승인
                                            </Button>
                                            <Button size="sm" variant="outline" disabled={busy[revKey]} onClick={() => reviewRequest(ev, 'rejected')}
                                              className="h-9 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold">
                                              <X className="w-3.5 h-3.5 mr-1" /> 반려
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex items-center justify-between rounded-xl bg-white border border-black/[0.05] px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#1D1D1F]">
                                          <Ticket className="w-3 h-3 text-[#86868B]" />
                                          쿠폰 <b className="text-[#0071E3]">{ev.student.leaveCoupons ?? 0}</b>개
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, -1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="차감">
                                            <Minus className="w-3 h-3" />
                                          </Button>
                                          <Button size="icon" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, 1)} className="h-7 w-7 rounded-lg border-black/[0.08]" title="지급">
                                            <Plus className="w-3 h-3" />
                                          </Button>
                                          <Button size="sm" variant="outline" disabled={busy[cpKey]} onClick={() => adjustCoupon(ev.student, COUPONS_PER_EXTRA_HALFDAY)} className="h-7 rounded-lg border-black/[0.08] text-[10px] px-2 font-bold" title={`+${COUPONS_PER_EXTRA_HALFDAY}개`}>
                                            +{COUPONS_PER_EXTRA_HALFDAY}
                                          </Button>
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

                {/* 2. 상담 일지 내역 */}
                {selectedDateConsultations.length > 0 && (
                  <div className="py-4 border-t border-black/[0.03]">
                    <div className="px-5 py-3 flex items-center gap-2 bg-[#FAFAFA] border-b border-black/[0.02]">
                      <span className="w-1.5 h-5 rounded-full shrink-0 bg-emerald-500" />
                      <span className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>당일 상담 진행 내역</span>
                      </span>
                      <span className="ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200/60">
                        {selectedDateConsultations.length}건
                      </span>
                    </div>

                    <div className="px-3 pt-2 space-y-2">
                      {selectedDateConsultations.map(({ student, log }) => (
                        <div
                          key={log.id}
                          onClick={() => openStudent(student, {
                            onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
                            onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
                            allStudents: students,
                            defaultTab: 'info',
                          })}
                          className="rounded-xl border border-black/[0.05] border-l-[3px] border-l-emerald-500 overflow-hidden bg-white shadow-sm hover:bg-[#F8F9FA] transition-all duration-200 cursor-pointer p-3.5 space-y-2 hover:scale-[1.01]"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-extrabold text-[13px] text-[#1D1D1F]">{student.name}</span>
                              <span className="text-[10px] text-[#86868B] font-medium ml-2">{campusLabel(student.campus)} · 코치 {student.manager || '없음'}</span>
                            </div>
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">코치 {log.manager}</span>
                          </div>
                          <div className="rounded-lg bg-emerald-50/[0.2] border border-emerald-100/30 p-2.5">
                            <p className="text-[11px] font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap break-all">
                              {log.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. 벌점/상점 부여 내역 */}
                {selectedDatePenalties.length > 0 && (
                  <div className="py-4 border-t border-black/[0.03]">
                    <div className="px-5 py-3 flex items-center gap-2 bg-[#FAFAFA] border-b border-black/[0.02]">
                      <span className="w-1.5 h-5 rounded-full shrink-0 bg-amber-500" />
                      <span className="text-xs font-black text-[#1D1D1F] flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        <span>당일 벌점·상점 부여 내역</span>
                      </span>
                      <span className="ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200/60">
                        {selectedDatePenalties.length}건
                      </span>
                    </div>

                    <div className="px-3 pt-2 space-y-2">
                      {selectedDatePenalties.map(({ student, record }) => {
                        const isPenalty = record.type === 'penalty';
                        const badgeColor = isPenalty ? 'bg-red-50 text-red-700 border-red-100/50' : 'bg-emerald-50 text-emerald-700 border-emerald-100/50';
                        return (
                          <div
                            key={record.id}
                            onClick={() => openStudent(student, {
                              onUpdate: (updated) => setStudents((prev) => prev.map((s) => s.id === updated.id ? updated : s)),
                              onDelete: (id) => setStudents((prev) => prev.filter((s) => s.id !== id)),
                              allStudents: students,
                              defaultTab: 'info',
                            })}
                            className={`rounded-xl border border-black/[0.05] border-l-[3px] overflow-hidden bg-white shadow-sm hover:bg-[#F8F9FA] transition-all duration-200 cursor-pointer p-3.5 space-y-2 hover:scale-[1.01] ${isPenalty ? 'border-l-red-500' : 'border-l-emerald-500'}`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-extrabold text-[13px] text-[#1D1D1F]">{student.name}</span>
                                <span className="text-[10px] text-[#86868B] font-medium ml-2">{campusLabel(student.campus)}</span>
                              </div>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${badgeColor}`}>
                                {isPenalty ? '벌점' : '상점'} {record.points}점
                              </span>
                            </div>
                            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                              <p className="text-[11px] font-semibold text-[#1D1D1F] leading-relaxed break-all">
                                {record.reason}
                              </p>
                            </div>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold">
                              <span>부여인: {record.awardedBy || '시스템'}</span>
                              <span>{new Date(record.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 수기 추가 모달 */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <PenLine className="w-4 h-4 text-[#0071E3]" />
              반차/휴가 수기 등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* 학생 선택 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-[#1D1D1F]">학생</Label>
              <select
                value={addForm.studentId}
                onChange={(e) => setAddForm((f) => ({ ...f, studentId: e.target.value }))}
                className="w-full rounded-xl border border-black/[0.08] text-sm h-10 bg-white px-3 focus:outline-none focus:border-[#0071E3]"
              >
                <option value="">-- 학생 선택 --</option>
                {[...students].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({campusLabel(s.campus)})</option>
                ))}
              </select>
            </div>

            {/* 유형 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-[#1D1D1F]">유형</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.entries(LEAVE_TYPES) as [LeaveType, typeof LEAVE_TYPES[LeaveType]][]).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, type: key }))}
                    className={`rounded-xl border px-2 py-2 text-[11px] font-extrabold flex flex-col items-center gap-0.5 transition-all ${
                      addForm.type === key
                        ? 'bg-[#0071E3] text-white border-[#0071E3]'
                        : 'bg-white text-[#1D1D1F] border-black/[0.08] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <span>{info.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 날짜 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-[#1D1D1F]">날짜</Label>
              <input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-xl border border-black/[0.08] text-sm h-10 bg-white px-3 focus:outline-none focus:border-[#0071E3]"
              />
            </div>

            {/* 사유 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-[#1D1D1F]">사유 <span className="text-[#86868B] font-medium">(선택)</span></Label>
              <textarea
                value={addForm.reason}
                onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="관리자 수기 등록"
                rows={2}
                className="w-full rounded-xl border border-black/[0.08] text-sm bg-white px-3 py-2 focus:outline-none focus:border-[#0071E3] resize-none"
              />
            </div>

            {/* 상태 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold text-[#1D1D1F]">등록 상태</Label>
              <div className="flex gap-2">
                {([['approved', '✅ 바로 승인'], ['pending', '⏳ 대기 중']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, status: val }))}
                    className={`flex-1 rounded-xl border py-2 text-[11px] font-extrabold transition-all ${
                      addForm.status === val
                        ? val === 'approved' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-[#1D1D1F] border-black/[0.08] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 제출 */}
            <Button
              onClick={handleAddSubmit}
              disabled={addBusy || !addForm.studentId}
              className="w-full h-11 rounded-xl bg-[#1D1D1F] hover:bg-[#323236] text-white font-extrabold text-sm"
            >
              {addBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : '등록하기'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
