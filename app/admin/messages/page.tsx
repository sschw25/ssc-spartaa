'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, MessageSquare, Search, RefreshCw, Loader2,
  Send, CheckSquare, Square, AlertTriangle, CheckCircle2, Bookmark, BookmarkPlus, X, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import { Student } from '@/lib/types/student';
import { isWeeklyGradeMissing } from '@/lib/student-flags';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

type FilterMode = 'all' | 'grades-missing' | 'no-phone';

interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  createdBy?: string;
  createdAt: string;
}

export default function MessagesPage() {
  const confirm = useConfirm();
  const prompt = usePrompt();
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

  // 자주 쓰는 문자 템플릿 (관리자 공유)
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        const json = await res.json();
        setAdminId(json.userId || json.username || '관리자');
        loadStudents();
        loadTemplates();
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
        toast.error('학생 정보를 불러오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/admin/message-templates', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setTemplates(json.templates || []);
      }
    } catch {}
  }

  const saveCurrentAsTemplate = async () => {
    if (!message.trim()) { toast.error('저장할 메시지 내용을 먼저 작성하세요.'); return; }
    const title = await prompt({
      title: '템플릿 이름',
      placeholder: '예: 주간 성적 안내',
      confirmText: '저장',
    });
    if (!title || !title.trim()) return;
    setSavingTpl(true);
    try {
      const res = await fetch('/api/admin/message-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: message.trim() }),
      });
      const json = await res.json();
      if (json.success) { setTemplates(json.templates || []); toast.success('템플릿으로 저장했습니다.'); }
      else toast.error(json.message || '저장 실패');
    } catch { toast.error('네트워크 에러'); } finally { setSavingTpl(false); }
  };

  const deleteTemplate = async (id: string) => {
    if (!(await confirm({ title: '이 템플릿을 삭제할까요?', description: '모든 관리자에게 적용됩니다.', tone: 'danger', confirmText: '삭제' }))) return;
    try {
      const res = await fetch(`/api/admin/message-templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { setTemplates(json.templates || []); toast.success('삭제했습니다.'); }
      else toast.error(json.message || '삭제 실패');
    } catch { toast.error('네트워크 에러'); }
  };

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTarget = (t: 'parent' | 'student') => {
    setTargets((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const sendMessages = async () => {
    if (selectedIds.size === 0) { toast.error('발송 대상을 선택해 주세요.'); return; }
    if (!message.trim()) { toast.error('메시지 내용을 입력해 주세요.'); return; }
    if (targets.length === 0) { toast.error('발송 대상(학부모/학생)을 선택해 주세요.'); return; }

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
    <div className="ios-app-bg min-h-screen text-slate-900 font-sans">
      <AdminTopNav title="학생 메시지 발송" onLogout={handleLogout} />

      <main className="stagger-children mx-auto max-w-4xl px-4 pt-6 pb-40 sm:px-6 space-y-6">
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
                ① 발송할 학생을 먼저 선택하고 ② 아래에서 메시지를 작성해 발송합니다.
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

        {/* STEP 1 — 대상 선택 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black">1</span>
            <p className="text-sm font-black text-slate-700">발송 대상 선택</p>
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
              placeholder="학생명 또는 코멘터 검색"
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-4 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 학생 목록 */}
          <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            {loading && students.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
                <p className="text-xs font-bold text-slate-400">데이터를 불러오는 중...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-20 text-center text-sm font-bold text-slate-400">
                해당 조건의 학생이 없습니다.
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
                      <th className="px-4 py-4">학생</th>
                      <th className="px-4 py-4">담당 코멘터</th>
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
        </div>

        {/* STEP 2 — 메시지 작성 (대상 선택 후 활성) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`grid place-items-center w-6 h-6 rounded-full text-xs font-black ${selectedIds.size > 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>2</span>
            <p className={`text-sm font-black ${selectedIds.size > 0 ? 'text-slate-700' : 'text-slate-400'}`}>메시지 작성</p>
          </div>

          {selectedIds.size === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
              <Users className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400">위에서 발송할 학생을 먼저 선택하세요.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
              {/* 선택 요약 */}
              <div className="rounded-xl bg-blue-50 border border-blue-200/60 px-4 py-2.5 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-xs font-black text-blue-700">{selectedIds.size}명에게 발송합니다.</p>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-[11px] font-bold text-blue-500 hover:text-blue-700">선택 취소</button>
              </div>

              {/* 발송 대상 */}
              <div className="flex flex-wrap gap-2">
                <p className="text-xs font-bold text-slate-500 w-full">받는 사람</p>
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

              {/* 자주 쓰는 문자 템플릿 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs font-bold text-slate-500">자주 쓰는 문자 <span className="text-slate-300 font-medium">(관리자 공유)</span></p>
                </div>
                {templates.length === 0 ? (
                  <p className="text-[11px] font-semibold text-slate-300">저장된 템플릿이 없습니다. 아래에서 작성 후 "템플릿 저장"을 눌러보세요.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map((t) => (
                      <div key={t.id} className="group inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 transition overflow-hidden">
                        <button type="button" onClick={() => setMessage(t.body)} title={t.body}
                          className="px-2.5 py-1.5 text-[11px] font-black text-slate-600 group-hover:text-blue-600 max-w-[160px] truncate">
                          {t.title}
                        </button>
                        <button type="button" onClick={() => deleteTemplate(t.id)} title="템플릿 삭제"
                          className="px-1.5 py-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 border-l border-slate-200">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 메시지 입력 */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="[SSC스파르타] 로 시작하는 메시지를 작성하세요. (최대 80자 권장)"
                rows={4}
                maxLength={200}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none resize-none transition"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-slate-400">{message.length}/200자</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={saveCurrentAsTemplate}
                    disabled={savingTpl || !message.trim()}
                    className="rounded-xl text-xs font-black h-9 px-3 bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {savingTpl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5 mr-1" />}
                    템플릿 저장
                  </Button>
                  <Button
                    onClick={sendMessages}
                    disabled={sending || selectedIds.size === 0 || !message.trim()}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black h-9 px-4 flex items-center gap-2 disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {selectedIds.size}명에게 발송
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
