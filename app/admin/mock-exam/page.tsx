'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ClipboardCheck, RefreshCw, Loader2, Plus, Trash2,
  CheckCircle2, XCircle, HelpCircle, Send, Bell, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, MockExam, MockExamParticipation } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { useConfirm } from '@/components/ui/confirm-dialog';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

type Status = MockExamParticipation['status'];

const STATUS_CONFIG: Record<'attending' | 'absent' | 'undecided', { label: string; cls: string; icon: React.ReactNode }> = {
  attending: {
    label: '참여',
    cls: 'bg-emerald-600 text-white border-emerald-600',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  absent: {
    label: '불참',
    cls: 'bg-red-500 text-white border-red-500',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  undecided: {
    label: '미정',
    cls: 'bg-white text-slate-500 border-slate-200',
    icon: <HelpCircle className="w-3.5 h-3.5" />,
  },
};

export default function MockExamPage() {
  const router = useRouter();
  const confirm = useConfirm();

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/admin');
  };

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [exams, setExams] = useState<MockExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // 관리자 센터 (범위 관리자는 자동 고정)
  const [adminCampus, setAdminCampus] = useState<string>('all');

  // 새 일정 등록 폼
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTargetTypes, setNewTargetTypes] = useState<string[]>([]);
  const [newCampus, setNewCampus] = useState<string>('all'); // 'all'=전체 센터
  const [adding, setAdding] = useState(false);

  // 불참자 알림 발송
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifying, setNotifying] = useState(false);

  // 학생에게 참여 확인 알림 발송
  const [notifyingExamId, setNotifyingExamId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, examRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/mock-exams', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (stuRes.ok) {
        const json = await stuRes.json();
        if (json.success) setStudents(json.data || []);
      }
      if (examRes.ok) {
        const json = await examRes.json();
        if (json.success) {
          setExams(json.exams || []);
          setSelectedExamId((current) => current || json.exams?.[0]?.id || null);
        }
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        try {
          const me = await res.json();
          if (me?.campus && me.campus !== 'all') {
            setAdminCampus(me.campus);
            setNewCampus(me.campus);
          }
        } catch { /* noop */ }
        loadAll();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router, loadAll]);

  const addExam = async () => {
    if (!newName.trim() || !newDate) { toast.error('시험명과 날짜를 입력해 주세요.'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), date: newDate, targetExamTypes: newTargetTypes, campus: newCampus }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('모의고사 일정이 등록되었습니다.');
        setExams((prev) => [json.exam, ...prev]);
        setSelectedExamId(json.exam.id);
        setNewName('');
        setNewDate('');
        setNewTargetTypes([]);
      } else {
        toast.error(json.message || '등록 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setAdding(false);
    }
  };

  const deleteExam = async (examId: string) => {
    if (!(await confirm({ title: '이 모의고사 일정을 삭제할까요?', tone: 'danger', confirmText: '삭제' }))) return;
    try {
      const res = await fetch(`/api/admin/mock-exams?examId=${encodeURIComponent(examId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('삭제되었습니다.');
        setExams((prev) => prev.filter((e) => e.id !== examId));
        if (selectedExamId === examId) setSelectedExamId(null);
      } else {
        toast.error(json.message || '삭제 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    }
  };

  const notifyExamToStudents = async (examId: string, action: 'send' | 'cancel' = 'send') => {
    if (notifyingExamId) return;
    if (action === 'cancel' && !(await confirm({ title: '발송된 모의고사 참여 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    setNotifyingExamId(examId);
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === 'cancel' ? '모의고사 참여 알림을 취소했습니다.' : '학생들에게 참여 확인 알림을 발송했습니다.');
        setExams((prev) => prev.map((e) => (e.id === examId ? json.exam : e)));
      } else {
        toast.error(json.message || '처리 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setNotifyingExamId(null);
    }
  };

  const setStatus = async (studentId: string, status: Status) => {
    if (!selectedExamId) return;
    const key = `${studentId}-${selectedExamId}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/mock-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: selectedExamId, status }),
      });
      const json = await res.json();
      if (json.success) {
        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            const existing = (s.mockExams || []).filter((e) => e.examId !== selectedExamId);
            return { ...s, mockExams: [...existing, json.entry] };
          })
        );
      } else {
        toast.error(json.message || '상태 변경 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setUpdating(null);
    }
  };

  const notifyAbsent = async () => {
    if (!selectedExamId) return;
    const absentStudents = scopedStudents.filter((s) => getStatus(s) === 'absent');
    if (absentStudents.length === 0) { toast.error('불참 학생이 없습니다.'); return; }
    if (!notifyMsg.trim()) { toast.error('발송할 메시지를 입력해 주세요.'); return; }

    setNotifying(true);
    try {
      const res = await fetch('/api/admin/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: absentStudents.map((s) => s.id),
          message: notifyMsg.trim(),
          targets: ['parent'],
          sentBy: '관리자',
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.totalSent}건 발송 완료`);
        setNotifyMsg('');
      } else {
        toast.error(json.message || '발송 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setNotifying(false);
    }
  };

  const getStatus = (student: Student): Status => {
    if (!selectedExamId) return 'undecided';
    return (
      (student.mockExams || []).find((e) => e.examId === selectedExamId)?.status ?? 'undecided'
    );
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  // 학생 목표시험 목록 (중복 제거)
  const uniqueExamTypes = [...new Set(students.map((s) => s.contact).filter((c): c is string => Boolean(c)))].sort();

  // 선택된 시험의 대상 시험 유형으로 필터링
  const scopedStudents = students.filter((s) => {
    if (campusFilter !== 'all' && s.campus !== campusFilter) return false;
    if (selectedExam?.targetExamTypes?.length) {
      return selectedExam.targetExamTypes.some((t) => s.contact?.includes(t));
    }
    return true;
  });

  const stats = {
    attending: scopedStudents.filter((s) => getStatus(s) === 'attending').length,
    absent: scopedStudents.filter((s) => getStatus(s) === 'absent').length,
    pending: scopedStudents.filter((s) => getStatus(s) === 'absent_requested').length,
    undecided: scopedStudents.filter((s) => getStatus(s) === 'undecided').length,
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 font-sans">
      <AdminTopNav title="모의고사 참여 체크" onLogout={handleLogout} />

      <main className="stagger-children mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition active:scale-95 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#0071E3]" />
              모의고사 참여 체크
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              일정을 선택하고 학생별 참여/불참 여부를 기록합니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            className="ml-auto shrink-0 rounded-xl text-xs h-9 bg-white border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>

        {/* 일정 등록 */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-black text-slate-700">모의고사 일정 등록</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="시험명 (예: 6월 모의고사)"
              className="flex-1 min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none"
            />
            <select
              value={newCampus}
              onChange={(e) => setNewCampus(e.target.value)}
              disabled={adminCampus !== 'all'}
              title={adminCampus !== 'all' ? '담당 센터로 자동 지정됩니다' : '대상 센터 선택'}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none disabled:opacity-70"
            >
              <option value="all">전체 센터</option>
              <option value="wonju">원주</option>
              <option value="chuncheon">춘천</option>
              <option value="chungju">충주</option>
            </select>
            <Button
              onClick={addExam}
              disabled={adding}
              className="rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white text-xs font-black h-10 px-4"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              등록
            </Button>
          </div>
          {/* 대상 목표시험 유형 선택 */}
          {uniqueExamTypes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-black text-slate-500">
                알림 대상 (선택 안 하면 전체 학생)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {uniqueExamTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setNewTargetTypes((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    className={`rounded-xl px-3 py-1 text-[11px] font-black border transition active:scale-95 ${
                      newTargetTypes.includes(t)
                        ? 'bg-[#0071E3] text-white border-[#0071E3]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {newTargetTypes.length > 0 && (
                <p className="text-[10px] text-[#0071E3] font-semibold">
                  선택: {newTargetTypes.join(', ')} 목표 학생에게만 알림 발송
                </p>
              )}
            </div>
          )}

          {/* 일정 목록 */}
          {exams.length > 0 && (
            <div className="space-y-2 pt-1">
              {exams.map((exam) => (
                <div key={exam.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                  selectedExamId === exam.id ? 'border-[#0071E3]/30 bg-[#0071E3]/5' : 'border-slate-100 bg-slate-50/60'
                }`}>
                  <button
                    type="button"
                    onClick={() => setSelectedExamId(exam.id)}
                    className="flex-1 flex items-start gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${selectedExamId === exam.id ? 'text-[#0071E3]' : 'text-slate-700'}`}>
                          {exam.name}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">{exam.date}</span>
                        <span className="rounded-lg bg-slate-200/70 text-slate-600 px-1.5 py-0.5 text-[9px] font-black">
                          {exam.campus && exam.campus !== 'all' ? getCampusLabel(exam.campus) : '전체 센터'}
                        </span>
                        {exam.notifiedAt && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-black">
                            <Bell className="w-2 h-2" /> 알림됨
                          </span>
                        )}
                      </div>
                      {exam.targetExamTypes && exam.targetExamTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exam.targetExamTypes.map((t) => (
                            <span key={t} className="rounded-md bg-[#0071E3]/[0.08] text-[#0071E3] px-1.5 py-0.5 text-[9px] font-black">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={!!notifyingExamId}
                    onClick={() => notifyExamToStudents(exam.id, exam.notifiedAt ? 'cancel' : 'send')}
                    title={exam.notifiedAt ? `발송: ${new Date(exam.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '학생에게 참여 확인 알림 발송'}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 shrink-0 ${
                      exam.notifiedAt
                        ? 'border border-red-100 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {notifyingExamId === exam.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : exam.notifiedAt ? <XCircle className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                    {exam.notifiedAt ? '알림 취소' : '학생 알림'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteExam(exam.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition shrink-0"
                    title="삭제"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedExam && (
          <>
            {/* 통계 요약 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ['참여', 'bg-emerald-50 border-emerald-200/70 text-emerald-800', stats.attending],
                ['불참 승인대기', 'bg-amber-50 border-amber-200/70 text-amber-800', stats.pending],
                ['불참(승인)', 'bg-red-50 border-red-200/70 text-red-800', stats.absent],
                ['미정', 'bg-slate-50 border-slate-200/70 text-slate-600', stats.undecided],
              ] as [string, string, number][]).map(([label, cls, count]) => (
                <div key={label} className={`rounded-2xl border px-4 py-3 ${cls}`}>
                  <p className="text-[18px] font-semibold tracking-tight">{count}</p>
                  <p className="text-[11px] font-bold opacity-70 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* 불참자 알림 */}
            {stats.absent > 0 && (
              <div className="rounded-2xl bg-red-50 border border-red-200/60 p-4 space-y-3">
                <p className="text-xs font-black text-red-700 flex items-center gap-2">
                  <Send className="w-3.5 h-3.5" />
                  불참 {stats.absent}명 학부모 알림 발송
                </p>
                <div className="flex gap-2">
                  <input
                    value={notifyMsg}
                    onChange={(e) => setNotifyMsg(e.target.value)}
                    placeholder={`[SSC스파르타] ${selectedExam.name} 불참 안내 메시지`}
                    className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-red-400"
                  />
                  <Button
                    onClick={notifyAbsent}
                    disabled={notifying || !notifyMsg.trim()}
                    className="rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black h-9 px-3 shrink-0"
                  >
                    {notifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '발송'}
                  </Button>
                </div>
              </div>
            )}

            {/* 캠퍼스 필터 */}
            <div className="flex flex-wrap gap-1.5">
              {CAMPUS_FILTERS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCampusFilter(c)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                    campusFilter === c
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
                </button>
              ))}
            </div>

            {/* 학생 체크리스트 */}
            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              {loading && students.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                    <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-4">학생</th>
                        <th className="px-4 py-4">목표 시험</th>
                        <th className="px-4 py-4">참여여부</th>
                        <th className="px-4 py-4">점수 (학생 입력)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60">
                      {scopedStudents.map((s) => {
                        const status = getStatus(s);
                        const key = `${s.id}-${selectedExamId}`;
                        const isUpdating = updating === key;
                        const participation = selectedExamId
                          ? (s.mockExams || []).find((e) => e.examId === selectedExamId)
                          : undefined;
                        const absentReason = (status === 'absent' || status === 'absent_requested') ? participation?.reason : undefined;
                        const selfResponded = participation?.respondedBy === 'student';
                        const pendingAbsence = status === 'absent_requested';
                        const score = participation?.score;
                        const subjectScores = participation?.subjectScores;
                        return (
                          <tr key={s.id}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-800">{s.name}</span>
                                <Badge className="bg-slate-100 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">
                                  {getCampusLabel(s.campus)}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-semibold text-slate-500">{s.contact || '—'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5 items-center">
                                {(['attending', 'absent', 'undecided'] as Array<'attending' | 'absent' | 'undecided'>).map((st) => {
                                  const cfg = STATUS_CONFIG[st];
                                  const active = status === st;
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      disabled={isUpdating}
                                      onClick={() => setStatus(s.id, st)}
                                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${
                                        active ? cfg.cls : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      {isUpdating && active ? <Loader2 className="w-3 h-3 animate-spin" /> : cfg.icon}
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                                {pendingAbsence && (
                                  <span className="rounded-lg bg-amber-100 text-amber-700 px-2 py-1 text-[10px] font-black animate-pulse">불참 승인대기</span>
                                )}
                                {selfResponded && !pendingAbsence && (
                                  <span className="rounded-lg bg-blue-50 text-blue-600 px-2 py-1 text-[10px] font-black">학생응답</span>
                                )}
                              </div>
                              {absentReason && (
                                <p className="mt-1 text-[11px] font-semibold text-slate-400">{absentReason}</p>
                              )}
                              {pendingAbsence && (
                                <div className="mt-1.5 flex gap-1.5">
                                  <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'absent')}
                                    className="flex items-center gap-1 rounded-lg bg-red-500 text-white px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 disabled:opacity-50">
                                    <XCircle className="w-3 h-3" /> 불참 승인
                                  </button>
                                  <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'undecided')}
                                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white text-slate-600 px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 hover:border-slate-300 disabled:opacity-50">
                                    반려
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {status === 'attending' ? (
                                <div className="space-y-0.5">
                                  {score != null ? (
                                    <span className="text-sm font-black text-slate-900">{score}점</span>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-slate-300">미입력</span>
                                  )}
                                  {subjectScores && Object.keys(subjectScores).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {Object.entries(subjectScores).map(([subj, sc]) => (
                                        <span key={subj} className="text-[9px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">
                                          {subj} {sc}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-200">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!selectedExam && !(loading && students.length === 0) && (
          <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">모의고사 일정을 먼저 등록해 주세요.</p>
          </div>
        )}
      </main>
    </div>
  );
}
