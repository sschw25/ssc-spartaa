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
  type: 'leave' | 'request' | 'suggestion';
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
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [processing, setProcessing] = useState(false);

  // 1. 관리자 인증 확인
  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) {
          router.replace('/admin');
          return;
        }
        loadStudents();
      } catch (err) {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router]);

  // 2. 학생 데이터 및 신청 내역 수집
  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStudents(json.data || []);
        }
      } else {
        toast.error('원생 정보를 불러오지 못했습니다.');
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
    });

    // 최신 신청일자 순 정렬
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [students]);

  // 카테고리 필터링 반영
  const filteredItems = React.useMemo(() => {
    return inboxItems.filter((item) => activeCategory === 'all' || item.category === activeCategory);
  }, [inboxItems, activeCategory]);

  // 3. 통합 요청 해결 PATCH API 호출
  const handleProcessRequest = async (actionStatus: 'approved' | 'rejected' | 'resolved' | 'pending') => {
    if (!selectedItem) return;
    setProcessing(true);

    let apiUrl = `/api/admin/students/${selectedItem.studentId}`;
    let body: any = {};

    if (selectedItem.type === 'leave') {
      apiUrl += '/leave';
      body = {
        requestId: selectedItem.id,
        status: actionStatus === 'resolved' ? 'approved' : actionStatus,
        reply: replyText.trim() || null,
      };
    } else if (selectedItem.type === 'request') {
      apiUrl += '/requests';
      body = {
        requestId: selectedItem.id,
        status: actionStatus === 'approved' ? 'resolved' : actionStatus,
        reply: replyText.trim() || null,
      };
    } else if (selectedItem.type === 'suggestion') {
      apiUrl += '/suggestions';
      body = {
        suggestionId: selectedItem.id,
        status: actionStatus === 'approved' ? 'resolved' : actionStatus,
        reply: replyText.trim() || null,
      };
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('신청이 성공적으로 처리되었습니다.');
        // 목록 새로고침 및 선택 해제
        await loadStudents();
        setSelectedItem(null);
        setReplyText('');
      } else {
        toast.error(json.message || '요청 처리 실패');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  // 선택 변경 시 폼 바인딩
  const handleSelectItem = (item: InboxItem) => {
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
    <div className="min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans transition-all">
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

          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#0071E3]" />
                <p className="text-xs text-slate-400 font-bold">요청 목록을 동기화하는 중...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                <Inbox className="w-8 h-8 text-slate-300" />
                <p className="text-xs text-slate-400 font-bold">조회 대상 요청이 없습니다.</p>
              </div>
            ) : (
              filteredItems.map((item) => {
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
                  <p className="text-[9px] font-bold text-slate-400">답변을 입력하면 실시간으로 '처리중🔵' 또는 '완료🟢' 상태로 학생 화면에 표시됩니다.</p>
                </div>

                {/* proposedGoal 제안 계획 표시 */}
                {selectedItem.type === 'request' && selectedItem.rawItem?.proposedGoal && (() => {
                  const pg: ProposedGoal = selectedItem.rawItem.proposedGoal;
                  const materialTitle = getMaterialTitle(selectedItem.studentId, pg);
                  const isBook = pg.materialType === 'book';
                  const goalUnit = pg.goalType === 'weeks' ? '주' : pg.goalType === 'weeklyAmount' ? (isBook ? 'p/주' : '강/주') : (isBook ? 'p/일' : '강/일');
                  return (
                    <div className="rounded-2xl border border-[#0071E3]/20 bg-[#0071E3]/[0.03] p-4 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0071E3] uppercase tracking-wider">
                        <Target className="w-3.5 h-3.5" />
                        학생 제안 증진계획
                      </div>
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex items-center gap-2">
                          {isBook
                            ? <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            : <Tv className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <span className="font-black text-slate-700 truncate">{materialTitle}</span>
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">{isBook ? '교재' : '인강'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pl-5">
                          <span className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {getGoalTypeLabel(pg.goalType)}: {pg.goalValue}{goalUnit}
                          </span>
                          {pg.speedMultiplier && pg.speedMultiplier !== 1.0 && (
                            <span className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              배속 {pg.speedMultiplier}×
                            </span>
                          )}
                          {pg.proposedWeekNumber && pg.proposedRangeText && (
                            <span className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {pg.proposedWeekNumber}주차: {pg.proposedRangeText}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] font-bold text-[#0071E3]/70 pl-0.5">
                        ✅ 승인 시 해당 교재/인강에 제안 계획이 자동 반영됩니다.
                      </p>
                    </div>
                  );
                })()}

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  {selectedItem.type === 'leave' ? (
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
