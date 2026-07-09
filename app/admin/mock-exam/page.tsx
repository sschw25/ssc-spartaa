'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ClipboardCheck, Loader2, Plus, Trash2,
  XCircle, Bell, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, MockExam } from '@/lib/types/student';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { AdminNavActions } from '@/components/admin/admin-nav-actions';
import { RecipientPickerModal } from '@/components/admin/recipient-picker-modal';
import { MockExamManager } from '@/components/admin/mock-exam-manager';
import { useConfirm } from '@/components/ui/confirm-dialog';

const getCampusLabel = (c: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

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
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // 관리자 센터 (범위 관리자는 자동 고정)
  const [adminCampus, setAdminCampus] = useState<string>('all');

  // 새 일정 등록 폼
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTargetTypes, setNewTargetTypes] = useState<string[]>([]);
  const [newCampus, setNewCampus] = useState<string>('all'); // 'all'=전체 센터
  const [adding, setAdding] = useState(false);

  // 학생에게 참여 확인 알림 발송
  const [notifyingExamId, setNotifyingExamId] = useState<string | null>(null);
  const [pickerExam, setPickerExam] = useState<MockExam | null>(null);

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

  const cancelNotify = async (examId: string) => {
    if (notifyingExamId) return;
    if (!(await confirm({ title: '발송된 모의고사 참여 알림을 취소할까요?', description: '학생 화면에서 사라지고, 다시 발송할 수 있습니다.', tone: 'danger', confirmText: '취소' }))) return;
    setNotifyingExamId(examId);
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, action: 'cancel' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('모의고사 참여 알림을 취소했습니다.');
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

  // 수신자 체크리스트에서 확정한 학생에게만 발송
  const sendNotify = async (examId: string, studentIds: string[]) => {
    if (notifyingExamId) return;
    setNotifyingExamId(examId);
    try {
      const res = await fetch('/api/admin/mock-exams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId, action: 'send', studentIds }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`참여 확인 알림을 ${studentIds.length}명에게 발송했습니다.`);
        setExams((prev) => prev.map((e) => (e.id === examId ? json.exam : e)));
        setPickerExam(null);
      } else {
        toast.error(json.message || '처리 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setNotifyingExamId(null);
    }
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  // 학생 목표시험 목록 (중복 제거) — 생성 폼의 대상 직렬 토글용
  const uniqueExamTypes = [...new Set(students.map((s) => s.contact).filter((c): c is string => Boolean(c)))].sort();

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0b0b0c] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen text-slate-900 dark:text-slate-100 font-sans">
      <AdminTopNav title="모의고사 참여 체크" onLogout={handleLogout} actions={<AdminNavActions onRefresh={loadAll} loading={loading} onLogout={handleLogout} />} />

      <main className="stagger-children mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] hover:bg-slate-50 dark:hover:bg-white/5 transition active:scale-95 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#0071E3]" />
              모의고사 참여 체크
            </h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-400 mt-0.5">
              일정을 선택하고 학생별 참여/불참 여부를 기록합니다.
            </p>
          </div>
        </div>

        {/* 일정 등록 */}
        <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-100 dark:border-white/10 shadow-sm p-5 space-y-3">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300">모의고사 일정 등록</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="시험명 (예: 6월 모의고사)"
              className="flex-1 min-w-40 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none"
            />
            <select
              value={newCampus}
              onChange={(e) => setNewCampus(e.target.value)}
              disabled={adminCampus !== 'all'}
              title={adminCampus !== 'all' ? '담당 센터로 자동 지정됩니다' : '대상 센터 선택'}
              className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:border-[#0071E3] focus:outline-none disabled:opacity-70"
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
              <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">
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
                        : 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-400'
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
                  selectedExamId === exam.id ? 'border-[#0071E3]/30 bg-[#0071E3]/5 dark:bg-[#0071E3]/15' : 'border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5'
                }`}>
                  <button
                    type="button"
                    onClick={() => setSelectedExamId(exam.id)}
                    className="flex-1 flex items-start gap-2 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black ${selectedExamId === exam.id ? 'text-[#0071E3]' : 'text-slate-700 dark:text-slate-300'}`}>
                          {exam.name}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">{exam.date}</span>
                        <span className="rounded-lg bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[9px] font-black">
                          {exam.campus && exam.campus !== 'all' ? getCampusLabel(exam.campus) : '전체 센터'}
                        </span>
                        {exam.notifiedAt && (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 text-[9px] font-black">
                            <Bell className="w-2 h-2" /> 알림됨
                          </span>
                        )}
                      </div>
                      {exam.targetExamTypes && exam.targetExamTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exam.targetExamTypes.map((t) => (
                            <span key={t} className="rounded-md bg-[#0071E3]/[0.08] dark:bg-[#0071E3]/15 text-[#0071E3] px-1.5 py-0.5 text-[9px] font-black">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={!!notifyingExamId}
                    onClick={() => (exam.notifiedAt ? cancelNotify(exam.id) : setPickerExam(exam))}
                    title={exam.notifiedAt ? `발송: ${new Date(exam.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '수신 대상 선택 후 발송'}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 shrink-0 ${
                      exam.notifiedAt
                        ? 'border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 hover:bg-red-100'
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
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition shrink-0"
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
          <MockExamManager exam={selectedExam} students={students} onStudentsChange={setStudents} adminCampus={adminCampus} />
        )}

        {!selectedExam && !(loading && students.length === 0) && (
          <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-slate-100 dark:border-white/10 p-12 text-center">
            <ClipboardCheck className="w-10 h-10 text-slate-200 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">모의고사 일정을 먼저 등록해 주세요.</p>
          </div>
        )}
      </main>

      {pickerExam && (
        <RecipientPickerModal
          key={pickerExam.id}
          eventName={pickerExam.name}
          kindLabel="모의고사"
          students={students}
          campus={pickerExam.campus}
          targetExamTypes={pickerExam.targetExamTypes}
          sending={!!notifyingExamId}
          onCancel={() => setPickerExam(null)}
          onSend={(ids) => sendNotify(pickerExam.id, ids)}
        />
      )}
    </div>
  );
}
