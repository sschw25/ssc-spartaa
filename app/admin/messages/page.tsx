'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, MessageSquare, Search, RefreshCw, Loader2,
  Send, CheckSquare, Square, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student } from '@/lib/types/student';
import { isWeeklyGradeMissing } from '@/lib/student-flags';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

type FilterMode = 'all' | 'grades-missing' | 'no-phone';

export default function MessagesPage() {
  const router = useRouter();

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/admin');
  };

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [targets, setTargets] = useState<Array<'parent' | 'student'>>(['parent']);
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState('관리자');

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        const json = await res.json();
        setAdminId(json.userId || json.username || '관리자');
        loadStudents();
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    verifyAuth();
  }, [router]);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStudents(json.data || []);
      } else {
        toast.error('학생 데이터를 가져오는 데 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = students
    .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
    .filter((s) => {
      if (filterMode === 'grades-missing') return isWeeklyGradeMissing(s);
      if (filterMode === 'no-phone') return !s.parentPhone && !s.studentPhone;
      return true;
    })
    .filter((s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.manager || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

  const allSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredStudents.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTarget = (t: 'parent' | 'student') => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const sendMessages = async () => {
    if (selectedIds.size === 0) { toast.error('발송 대상을 선택해주세요.'); return; }
    if (!message.trim()) { toast.error('메시지 내용을 입력해주세요.'); return; }
    if (targets.length === 0) { toast.error('발송 대상(학부모/학생)을 선택해주세요.'); return; }

    setSending(true);
    try {
      const res = await fetch('/api/admin/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          message: message.trim(),
          targets,
          sentBy: adminId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.totalSent}건 발송 완료${json.failedCount > 0 ? ` (${json.failedCount}건 실패)` : ''}`);
        setSelectedIds(new Set());
        setMessage('');
      } else {
        toast.error(json.message || '발송에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1D1D1F] font-sans">
      <AdminTopNav title="학생 메시지 발송" onLogout={handleLogout} />

      <main className="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                <MessageSquare className="w-5 h-5 text-blue-500" />
                학생 메시지 발송
              </h1>
              <p className="text-xs font-bold text-slate-400 mt-0.5">
                대상을 선택하고 메시지를 입력한 뒤 발송합니다.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStudents}
            className="shrink-0 rounded-xl text-xs h-9 bg-white border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>

        {/* 발송 폼 */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
          <p className="text-sm font-black text-slate-700">메시지 작성</p>
          <div className="flex flex-wrap gap-2">
            <p className="text-xs font-bold text-slate-500 w-full">발송 대상</p>
            {(['parent', 'student'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTarget(t)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                  targets.includes(t)
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {t === 'parent' ? '학부모' : '학생 본인'}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="[SSC스파르타] 로 시작하는 메시지를 작성하세요. (최대 80자 권장)"
            rows={3}
            maxLength={200}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none resize-none transition"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-400">{message.length}/200자</p>
            <Button
              onClick={sendMessages}
              disabled={sending || selectedIds.size === 0 || !message.trim()}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black h-9 px-4 flex items-center gap-2 disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {selectedIds.size > 0 ? `${selectedIds.size}명에게 발송` : '발송'}
            </Button>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
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
                {c === 'all' ? '전체' : getCampusLabel(c)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', '전체'],
              ['grades-missing', '성적 미입력'],
              ['no-phone', '연락처 없음'],
            ] as [FilterMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                  filterMode === mode
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="원생명 또는 코치 검색"
            className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none transition-all"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* 선택 요약 */}
        {selectedIds.size > 0 && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200/60 px-5 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-xs font-black text-blue-700">
              {selectedIds.size}명 선택됨 — 메시지 작성 후 발송 버튼을 누르세요.
            </p>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-[11px] font-bold text-blue-500 hover:text-blue-700"
            >
              선택 취소
            </button>
          </div>
        )}

        {/* 학생 목록 */}
        <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
              <p className="text-xs font-bold text-slate-400">데이터를 불러오는 중...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-20 text-center text-sm font-bold text-slate-400">
              해당 조건의 원생이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600">
                <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-4 w-10">
                      <button type="button" onClick={toggleAll}>
                        {allSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-500" />
                          : <Square className="w-4 h-4 text-slate-300" />}
                      </button>
                    </th>
                    <th className="px-4 py-4">원생</th>
                    <th className="px-4 py-4">담당 코치</th>
                    <th className="px-4 py-4">연락처</th>
                    <th className="px-4 py-4">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {filteredStudents.map((s) => {
                    const checked = selectedIds.has(s.id);
                    const noPhone = !s.parentPhone && !s.studentPhone;
                    const gradesMissing = isWeeklyGradeMissing(s);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => toggleOne(s.id)}
                        className={`cursor-pointer transition-colors ${
                          checked ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="px-4 py-4">
                          {checked
                            ? <CheckSquare className="w-4 h-4 text-blue-500" />
                            : <Square className="w-4 h-4 text-slate-300" />}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800">{s.name}</span>
                            <Badge className="bg-slate-100 text-slate-500 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">
                              {getCampusLabel(s.campus)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-500">{s.manager || '미지정'}</td>
                        <td className="px-4 py-4">
                          {noPhone ? (
                            <span className="text-red-400 font-bold">연락처 없음</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {s.parentPhone && <span className="text-slate-500">학부모: {s.parentPhone}</span>}
                              {s.studentPhone && <span className="text-slate-500">학생: {s.studentPhone}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-1">
                            {gradesMissing && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                <AlertTriangle className="w-3 h-3" /> 성적 미입력
                              </span>
                            )}
                            {noPhone && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                                연락처 없음
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
