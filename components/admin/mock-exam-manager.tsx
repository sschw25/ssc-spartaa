'use client';

import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, HelpCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Student, MockExam, MockExamParticipation } from '@/lib/types/student';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];
const getCampusLabel = (c: string) => ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' }[c] ?? '기타');

type Status = MockExamParticipation['status'];

const STATUS_CONFIG: Record<'attending' | 'absent' | 'undecided', { label: string; cls: string; icon: React.ReactNode }> = {
  attending: { label: '참여', cls: 'bg-emerald-600 text-white border-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  absent: { label: '불참', cls: 'bg-red-500 text-white border-red-500', icon: <XCircle className="w-3.5 h-3.5" /> },
  undecided: { label: '미정', cls: 'bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10', icon: <HelpCircle className="w-3.5 h-3.5" /> },
};

interface MockExamManagerProps {
  exam: MockExam;
  students: Student[];
  onStudentsChange: (updater: (prev: Student[]) => Student[]) => void;
  adminCampus?: string;
}

// 모의고사 참여/성적 관리 뷰 — 단독 페이지(/admin/mock-exam)와 캘린더 모달에서 공용.
export function MockExamManager({ exam, students, onStudentsChange, adminCampus }: MockExamManagerProps) {
  const [campusFilter, setCampusFilter] = useState(adminCampus && adminCampus !== 'all' ? adminCampus : 'all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifying, setNotifying] = useState(false);

  const getStatus = (student: Student): Status =>
    (student.mockExams || []).find((e) => e.examId === exam.id)?.status ?? 'undecided';

  const scopedStudents = useMemo(() => students.filter((s) => {
    if (campusFilter !== 'all' && s.campus !== campusFilter) return false;
    if (exam.targetExamTypes?.length) return exam.targetExamTypes.some((t) => s.contact?.includes(t));
    return true;
  }), [students, campusFilter, exam.targetExamTypes]);

  const stats = {
    attending: scopedStudents.filter((s) => getStatus(s) === 'attending').length,
    absent: scopedStudents.filter((s) => getStatus(s) === 'absent').length,
    pending: scopedStudents.filter((s) => getStatus(s) === 'absent_requested').length,
    undecided: scopedStudents.filter((s) => getStatus(s) === 'undecided').length,
  };

  const setStatus = async (studentId: string, status: Status) => {
    const key = `${studentId}-${exam.id}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/mock-exam`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: exam.id, status }),
      });
      const json = await res.json();
      if (json.success) {
        onStudentsChange((prev) => prev.map((s) => {
          if (s.id !== studentId) return s;
          const existing = (s.mockExams || []).filter((e) => e.examId !== exam.id);
          return { ...s, mockExams: [...existing, json.entry] };
        }));
      } else { toast.error(json.message || '상태 변경 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setUpdating(null); }
  };

  const notifyAbsent = async () => {
    const absentStudents = scopedStudents.filter((s) => getStatus(s) === 'absent');
    if (absentStudents.length === 0) { toast.error('불참 학생이 없습니다.'); return; }
    if (!notifyMsg.trim()) { toast.error('발송할 메시지를 입력해 주세요.'); return; }
    setNotifying(true);
    try {
      const res = await fetch('/api/admin/messages/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: absentStudents.map((s) => s.id), message: notifyMsg.trim(), targets: ['parent'], sentBy: '관리자' }),
      });
      const json = await res.json();
      if (json.success) { toast.success(`${json.totalSent}건 발송 완료`); setNotifyMsg(''); }
      else { toast.error(json.message || '발송 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setNotifying(false); }
  };

  return (
    <div className="space-y-4">
      {/* 통계 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['참여', 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-400', stats.attending],
          ['불참 승인대기', 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/70 dark:border-amber-500/20 text-amber-800 dark:text-amber-400', stats.pending],
          ['불참(승인)', 'bg-red-50 dark:bg-red-500/10 border-red-200/70 dark:border-red-500/20 text-red-800 dark:text-red-400', stats.absent],
          ['미정', 'bg-slate-50 dark:bg-white/5 border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-400', stats.undecided],
        ] as [string, string, number][]).map(([label, cls, count]) => (
          <div key={label} className={`rounded-2xl border px-4 py-3 ${cls}`}>
            <p className="text-[18px] font-semibold tracking-tight">{count}</p>
            <p className="text-[11px] font-bold opacity-70 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 불참자 알림 */}
      {stats.absent > 0 && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200/60 dark:border-red-500/20 p-4 space-y-3">
          <p className="text-xs font-black text-red-700 dark:text-red-400 flex items-center gap-2">
            <Send className="w-3.5 h-3.5" /> 불참 {stats.absent}명 학부모 알림 발송
          </p>
          <div className="flex gap-2">
            <input value={notifyMsg} onChange={(e) => setNotifyMsg(e.target.value)}
              placeholder={`[SSC스파르타] ${exam.name} 불참 안내 메시지`}
              className="flex-1 rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-[#1c1c1e] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-red-400" />
            <Button onClick={notifyAbsent} disabled={notifying || !notifyMsg.trim()}
              className="rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black h-9 px-3 shrink-0">
              {notifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '발송'}
            </Button>
          </div>
        </div>
      )}

      {/* 캠퍼스 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {CAMPUS_FILTERS.map((c) => (
          <button key={c} onClick={() => setCampusFilter(c)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
              campusFilter === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
            }`}>
            {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
          </button>
        ))}
      </div>

      {/* 학생 체크리스트 */}
      <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-semibold text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50/80 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">학생</th>
                <th className="px-4 py-4">목표 시험</th>
                <th className="px-4 py-4">참여여부</th>
                <th className="px-4 py-4">점수 (학생 입력)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-white/10">
              {scopedStudents.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-xs font-bold text-slate-400">대상 학생이 없습니다.</td></tr>
              )}
              {scopedStudents.map((s) => {
                const status = getStatus(s);
                const key = `${s.id}-${exam.id}`;
                const isUpdating = updating === key;
                const participation = (s.mockExams || []).find((e) => e.examId === exam.id);
                const absentReason = (status === 'absent' || status === 'absent_requested') ? participation?.reason : undefined;
                const selfResponded = participation?.respondedBy === 'student';
                const pendingAbsence = status === 'absent_requested';
                const score = participation?.score;
                const subjectScores = participation?.subjectScores;
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800 dark:text-slate-200">{s.name}</span>
                        <Badge className="bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 border-none font-bold rounded-lg px-2 py-0.5 text-[9px]">
                          {getCampusLabel(s.campus)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{s.contact || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(['attending', 'absent', 'undecided'] as Array<'attending' | 'absent' | 'undecided'>).map((st) => {
                          const cfg = STATUS_CONFIG[st];
                          const active = status === st;
                          return (
                            <button key={st} type="button" disabled={isUpdating} onClick={() => setStatus(s.id, st)}
                              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 ${
                                active ? cfg.cls : 'bg-white dark:bg-[#1c1c1e] text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300'
                              }`}>
                              {isUpdating && active ? <Loader2 className="w-3 h-3 animate-spin" /> : cfg.icon}
                              {cfg.label}
                            </button>
                          );
                        })}
                        {pendingAbsence && (
                          <span className="rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-1 text-[10px] font-black animate-pulse">불참 승인대기</span>
                        )}
                        {selfResponded && !pendingAbsence && (
                          <span className="rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 px-2 py-1 text-[10px] font-black">학생응답</span>
                        )}
                      </div>
                      {absentReason && <p className="mt-1 text-[11px] font-semibold text-slate-400">{absentReason}</p>}
                      {pendingAbsence && (
                        <div className="mt-1.5 flex gap-1.5">
                          <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'absent')}
                            className="flex items-center gap-1 rounded-lg bg-red-500 text-white px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 disabled:opacity-50">
                            <XCircle className="w-3 h-3" /> 불참 승인
                          </button>
                          <button type="button" disabled={isUpdating} onClick={() => setStatus(s.id, 'undecided')}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 hover:border-slate-300 disabled:opacity-50">
                            반려
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'attending' ? (
                        <div className="space-y-0.5">
                          {score != null ? (
                            <span className="text-sm font-black text-slate-900 dark:text-slate-100">{score}점</span>
                          ) : (
                            <span className="text-[11px] font-semibold text-slate-300 dark:text-slate-600">미입력</span>
                          )}
                          {subjectScores && Object.keys(subjectScores).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {Object.entries(subjectScores).map(([subj, sc]) => (
                                <span key={subj} className="text-[9px] font-bold bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-slate-500 dark:text-slate-400">
                                  {subj} {sc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-200 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
