'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Inbox, Calendar, MessageSquare, AlertCircle, CheckCircle2,
  Clock, ArrowLeft, RefreshCw, LogOut, Check, X, ShieldAlert, Loader2,
  Target, BookOpen, Tv, User
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, LeaveType, ProposedGoal } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { getLeaveTypeLabel } from '@/lib/leave';
import { getRequestTypeLabel } from '@/lib/student-requests';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';

type InboxCategory = 'all' | 'living' | 'counsel' | 'facility';
type TimelineTone = 'amber' | 'blue' | 'emerald';

interface InboxItem {
  id: string;
  studentId: string;
  studentName: string;
  campus: string;
  type: 'leave' | 'request' | 'suggestion' | 'ot_absence' | 'mock_absence';
  category: 'living' | 'counsel' | 'facility';
  title: string;
  content: string;
  date: string;
  status: string;
  statusText: '접수중' | '처리중' | '완료';
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

export default function AdminInboxPage() {
  const router = useRouter();
  const { openStudent } = useAdminGlobalSheet();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<InboxCategory>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [inboxSortField, setInboxSortField] = useState<'status' | 'date' | 'name'>('status');
  const [inboxSortOrder, setInboxSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [processing, setProcessing] = useState(false);
  // 다중 선택 일괄 승인
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // OT/모의고사 일정 이름 매핑 (불참 신청 표시용)
  const [eventNames, setEventNames] = useState<Record<string, { name: string; date: string }>>({});

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
  const loadStudents = async () => {
    setLoading(true);
    try {
      const [res, otRes, mockRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store' }),
        fetch('/api/admin/ot-events', { cache: 'no-store' }).catch(() => null),
        fetch('/api/admin/mock-exams', { cache: 'no-store' }).catch(() => null),
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

  const getGoalTypeLabel = (goalType: string) => {
    if (goalType === 'weeks') return '기간 지정';
    if (goalType === 'weeklyAmount') return '주당 분량';
    if (goalType === 'dailyAmount') return '일일 분량';
    return goalType;
  };

  // 모든 신청건 통합 변환 가공
  const inboxItems = React.useMemo(() => {
    const items: InboxItem[] = [];
    students.forEach((student) => {
      // 1) 휴가/반차/병가 신청
      if (student.leaveRequests) {
        student.leaveRequests.forEach((r) => {
          let statusText: '접수중' | '처리중' | '완료' = '접수중';
          let tone: TimelineTone = 'amber';
          if (r.status === 'approved' || r.status === 'rejected') {
            statusText = '완료';
            tone = 'emerald';
          } else if (r.status === 'pending' && r.adminReply) {
            statusText = '처리중';
            tone = 'blue';
          }

          items.push({
            id: r.id,
            studentId: student.id,
            studentName: student.name,
            campus: student.campus,
            type: 'leave',
            category: 'living',
            title: `반차/휴가 신청: ${getLeaveTypeLabel(r.type)}`,
            content: r.reason || '(사유 없음)',
            date: r.date,
            status: r.status,
            statusText,
            tone,
            adminReply: r.adminReply || '',
            createdAt: r.createdAt || r.date,
            rawItem: r,
          });
        });
      }

      // 2) 학습 변경 신청 (type === 'request')
      const requests = (student.consultationLogs || []).filter((l) => l.type === 'request');
      requests.forEach((r) => {
        let statusText: '접수중' | '처리중' | '완료' = '접수중';
        let tone: TimelineTone = 'amber';
        if (r.status === 'resolved') {
          statusText = '완료';
          tone = 'emerald';
        } else if (r.status === 'pending' && r.adminReply) {
          statusText = '처리중';
          tone = 'blue';
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
        if (r.status === 'resolved') {
          statusText = '완료';
          tone = 'emerald';
        } else if (r.status === 'pending' && r.adminReply) {
          statusText = '처리중';
          tone = 'blue';
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
          tone: 'amber',
          adminReply: '',
          createdAt: e.updatedAt || '',
          rawItem: { examId: e.examId },
        });
      });
    });

    // 최신 신청일자 순 정렬
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [students, eventNames]);

  // 카테고리 필터링 반영
  const filteredItems = React.useMemo(() => {
    return inboxItems.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (hideCompleted && item.tone === 'emerald') return false;
      return true;
    });
  }, [inboxItems, activeCategory, hideCompleted]);

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

    let apiUrl = `/api/admin/students/${item.studentId}`;
    let body: any = {};

    if (item.type === 'leave') {
      apiUrl += '/leave';
      body = { requestId: item.id, status: actionStatus === 'resolved' ? 'approved' : actionStatus, reply: reply?.trim() || null };
    } else if (item.type === 'request') {
      apiUrl += '/requests';
      body = { requestId: item.id, status: actionStatus === 'approved' ? 'resolved' : actionStatus, reply: reply?.trim() || null };
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

  const handleProcessRequest = async (actionStatus: 'approved' | 'rejected' | 'resolved' | 'pending') => {
    if (!selectedItem) return;
    setProcessing(true);
    try {
      await processRequestItem(selectedItem, actionStatus, replyText);
      toast.success('신청이 성공적으로 처리되었습니다.');
      await loadStudents();
      setSelectedItem(null);
      setReplyText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 에러가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  // 다중 선택 일괄 승인 (완료되지 않은 건만 대상)
  const handleBulkApprove = async () => {
    const targets = inboxItems.filter((i) => selectedIds.has(i.id) && i.statusText !== '완료');
    if (targets.length === 0) return;
    if (!confirm(`선택한 ${targets.length}건을 일괄 승인 처리할까요?`)) return;
    setBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    for (const item of targets) {
      try {
        await processRequestItem(item, 'approved');
        ok++;
      } catch {
        fail++;
      }
    }
    await loadStudents();
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

  // 선택 변경 시 폼 바인딩 (초안 유실 경고)
  const handleSelectItem = (item: InboxItem) => {
    if (
      selectedItem &&
      selectedItem.id !== item.id &&
      replyText.trim() !== selectedItem.adminReply.trim()
    ) {
      if (!window.confirm('작성 중인 답변이 저장되지 않습니다. 항목을 전환할까요?')) return;
    }
    setSelectedItem(item);
    setReplyText(item.adminReply);
  };

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-[#1D1D1F] font-sans transition-all">
      <AdminTopNav
        title="통합 신청 & 건의 인박스"
        onLogout={handleLogout}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={loadStudents}
            className="rounded-2xl border-black/[0.05] hover:bg-[#F5F5F7] text-xs h-9.5 bg-white px-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-premium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        }
      />

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* 좌측: 카테고리 필터 및 요청 목록 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-1.5 bg-[#F5F5F7] p-1 rounded-2xl border border-black/[0.02]">
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
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-white/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* 정렬 셀렉터 */}
            <div className="flex items-center gap-1 bg-[#F5F5F7] p-0.5 rounded-xl border border-black/[0.02]">
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
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
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
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
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
                    ? 'bg-white text-black shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
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
                  : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              처리됨 제외
            </button>
          </div>

          {/* 일괄 승인 바 — 미처리(완료 아님) 건이 있을 때만 */}
          {!loading && sortedInboxItems.some((i) => i.statusText !== '완료') && (() => {
            const approvable = sortedInboxItems.filter((i) => i.statusText !== '완료');
            const selCount = approvable.filter((i) => selectedIds.has(i.id)).length;
            const allSel = approvable.length > 0 && selCount === approvable.length;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={() => setSelectedIds(allSel ? new Set() : new Set(approvable.map((i) => i.id)))}
                    className="h-4 w-4 rounded border-slate-300 accent-[#0071E3] cursor-pointer"
                  />
                  미처리 전체 선택 <span className="text-slate-400 font-semibold">({selCount}/{approvable.length})</span>
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
            {loading ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0071E3]" />
                <p className="text-xs text-slate-400 font-bold">요청 목록을 동기화하는 중...</p>
              </div>
            ) : sortedInboxItems.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                <Inbox className="w-8 h-8 text-slate-300" />
                <p className="text-xs text-slate-400 font-bold">조회 대상 요청이 없습니다.</p>
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
                        ? 'border-[#0071E3] bg-[#0071E3]/[0.02] ring-2 ring-[#0071E3]/15'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {item.statusText !== '완료' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelectOne(item.id)}
                            className="h-4 w-4 rounded border-slate-300 accent-[#0071E3] cursor-pointer shrink-0"
                          />
                        )}
                        <span className="font-black text-sm text-slate-800">{item.studentName}</span>
                        <Badge className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-[#86868B]">
                          {getCampusLabel(item.campus)}
                        </Badge>
                        <span className="text-[10px] font-semibold text-slate-400">{item.date}</span>
                      </span>

                      {/* 상태 타임라인 뱃지 */}
                      <span className="flex items-center gap-1 shrink-0">
                        {item.tone === 'amber' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            접수중
                          </span>
                        )}
                        {item.tone === 'blue' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 px-2.5 py-0.5 text-[10px] font-black text-[#0071E3]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
                            처리중
                          </span>
                        )}
                        {item.tone === 'emerald' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            완료
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-xs font-black text-slate-700">{item.title}</h4>
                      <p className="text-xs font-semibold text-slate-500 whitespace-pre-wrap leading-relaxed break-words bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100/50">
                        {item.content}
                      </p>
                    </div>

                    {item.adminReply && (
                      <div className="text-[11px] font-bold text-[#0071E3] bg-[#0071E3]/[0.04] border border-[#0071E3]/10 p-3 rounded-2xl flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-black text-[10px] text-[#0071E3]/80 uppercase tracking-wider">코치 답변 완료</p>
                          <p className="mt-1 font-semibold whitespace-pre-wrap leading-normal text-slate-600">{item.adminReply}</p>
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
          <Card className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-3 flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-[#0071E3]" />
              요청 상세 및 실시간 피드백 처리
            </h3>

            {selectedItem ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center font-black text-slate-700 border-b border-slate-200/50 pb-2">
                    <span>{selectedItem.studentName} ({getCampusLabel(selectedItem.campus)})</span>
                    <span className="text-[10px] text-slate-400">{selectedItem.date}</span>
                  </div>
                  <p className="font-extrabold text-slate-600 text-[11px] mt-1">{selectedItem.title}</p>
                  <p className="text-slate-500 font-semibold mt-1 whitespace-pre-wrap leading-relaxed break-all bg-white p-2.5 rounded-xl border border-slate-100">
                    {selectedItem.content}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const student = students.find(s => s.id === selectedItem.studentId);
                    if (student) {
                      openStudent(student, {
                        onUpdate: updated => setStudents(prev => prev.map(s => s.id === updated.id ? updated : s)),
                        onDelete: id => setStudents(prev => prev.filter(s => s.id !== id)),
                        allStudents: students,
                      });
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#F5F5F7] text-xs font-bold text-slate-600 py-2.5 transition-all active:scale-[0.98]"
                >
                  <User className="w-3.5 h-3.5 text-[#0071E3]" />
                  원생 상세 시트 열기
                </button>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-wider block">코치 피드백 답변 작성</label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="원생에게 보여질 실시간 코치 코멘트를 입력하세요..."
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-semibold text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:ring-offset-0 transition-all"
                  />
                  <p className="text-[9px] font-bold text-slate-400">답변을 입력하면 실시간으로 '처리중' 또는 '완료' 상태로 학생 화면에 표시됩니다.</p>
                </div>

                {/* proposedGoal 제안 계획 표시 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedGoal && (() => {
                  const pg: ProposedGoal = selectedItem.rawItem.proposedGoal;
                  const cg = pg.currentGoal;
                  const materialTitle = getMaterialTitle(selectedItem.studentId, pg);
                  const isBook = pg.materialType === 'book';
                  const unitFor = (gt?: string) => gt === 'weeks' ? '주' : gt === 'weeklyAmount' ? (isBook ? 'p/주' : '강/주') : (isBook ? 'p/일' : '강/일');
                  return (
                    <div className="rounded-2xl border border-[#0071E3]/20 bg-[#0071E3]/[0.03] p-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
                        <Target className="w-3.5 h-3.5" />
                        학생 제안 변경 내역
                      </div>

                      {/* 교재/인강 제목 */}
                      <div className="flex items-center gap-2 text-[11px]">
                        {isBook
                          ? <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          : <Tv className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className="font-black text-slate-700 truncate">{materialTitle}</span>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0">{isBook ? '교재' : '인강'}</span>
                      </div>

                      {/* 변경 전/후 비교 */}
                      {cg ? (
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5">
                            <p className="font-black text-slate-400 uppercase tracking-wider text-[9px]">변경 전 (현재)</p>
                            {cg.goalType && cg.goalValue ? (
                              <span className="inline-block bg-slate-100 rounded-md px-2 py-0.5 font-bold text-slate-600">
                                {getGoalTypeLabel(cg.goalType)}: {cg.goalValue}{unitFor(cg.goalType)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold">미설정</span>
                            )}
                            {cg.speedMultiplier && cg.speedMultiplier !== 1.0 && (
                              <span className="inline-block ml-1 bg-slate-100 rounded-md px-2 py-0.5 font-bold text-slate-600">
                                {cg.speedMultiplier}×
                              </span>
                            )}
                          </div>
                          <div className="rounded-xl border border-[#0071E3]/30 bg-[#0071E3]/[0.04] p-2.5 space-y-1.5">
                            <p className="font-black text-[#0071E3]/70 uppercase tracking-wider text-[9px]">변경 후 (신청)</p>
                            <span className="inline-block bg-[#0071E3]/10 rounded-md px-2 py-0.5 font-black text-[#0071E3]">
                              {getGoalTypeLabel(pg.goalType)}: {pg.goalValue}{unitFor(pg.goalType)}
                            </span>
                            {pg.speedMultiplier && pg.speedMultiplier !== 1.0 && (
                              <span className="inline-block ml-1 bg-[#0071E3]/10 rounded-md px-2 py-0.5 font-black text-[#0071E3]">
                                {pg.speedMultiplier}×
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <span className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {getGoalTypeLabel(pg.goalType)}: {pg.goalValue}{unitFor(pg.goalType)}
                          </span>
                          {pg.speedMultiplier && pg.speedMultiplier !== 1.0 && (
                            <span className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              배속 {pg.speedMultiplier}×
                            </span>
                          )}
                        </div>
                      )}

                      {pg.proposedWeekNumber && pg.proposedRangeText && (
                        <span className="inline-block bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {pg.proposedWeekNumber}주차: {pg.proposedRangeText}
                        </span>
                      )}

                      <p className="text-[9px] font-bold text-[#0071E3]/70">
                        ✅ 승인 시 해당 교재/인강에 제안 계획이 자동 반영됩니다.
                      </p>
                    </div>
                  );
                })()}

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  {selectedItem.type === 'ot_absence' || selectedItem.type === 'mock_absence' ? (
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
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
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
                        className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {selectedItem.rawItem?.proposedGoal ? '승인 및 계획 자동 반영' : '해결/처리 완료'}
                      </Button>
                      <Button
                        disabled={processing}
                        onClick={() => handleProcessRequest('pending')}
                        className="w-full rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        <Clock className="w-3.5 h-3.5 mr-1" /> 처리중 상태로 전환
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2.5">
                <Inbox className="w-6 h-6 text-slate-300" />
                <p className="text-[11px] font-bold text-slate-400">요청을 선택하세요</p>
                <p className="text-[9px] text-slate-400/80 font-semibold">좌측 목록에서 신청건을 클릭하면 상세 내용 확인 및 답변 처리를 진행할 수 있습니다.</p>
              </div>
            )}
          </Card>
        </div>

      </main>
    </div>
  );
}
