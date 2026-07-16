'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, Check, ImageIcon, MonitorPlay, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import type { Student, WrongNote } from '@/lib/types/student';
import { WrongNoteBody } from '@/components/report/wrong-note-markup';

// 오답 사유 태그 라벨/색 — 학생 오답노트 탭과 동일한 의미 색.
const TAG_LABEL: Record<string, string> = {
  calculation_error: '연산',
  time_limit: '시간',
  misread_condition: '오독',
  concept_leak: '개념',
};
const TAG_CLS: Record<string, string> = {
  calculation_error: 'bg-red-50 dark:bg-red-500/10 text-red-600',
  time_limit: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
  misread_condition: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600',
  concept_leak: 'bg-blue-50 dark:bg-[#0071E3]/15 text-[#0071E3]',
};

interface BookNotes {
  subjectName: string;
  materialId: string;
  materialTitle: string;
  materialType: 'book' | 'lecture';
  notes: WrongNote[];
}

// 관리자: 학생이 남긴 오답 문제(텍스트/사진)를 자료(교재/인강)별로 검토하고 '확인' 처리한다.
export function WrongNoteReview({ student }: { student: Student }) {
  // 로컬 오버레이 — 확인 처리 시 resolvedAt 을 즉시 반영(서버 저장은 전용 라우트).
  const [resolvedOverlay, setResolvedOverlay] = useState<Record<string, string | undefined>>({});
  const [busyId, setBusyId] = useState('');
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState('');

  const bookNotes = useMemo<BookNotes[]>(() => {
    const out: BookNotes[] = [];
    (student.subjects || []).forEach((s) => {
      (s.books || []).forEach((b) => {
        const notes = b.wrongNotes || [];
        if (notes.length > 0) out.push({ subjectName: s.name, materialId: b.id, materialTitle: b.title, materialType: 'book', notes });
      });
      // 인강 오답노트 — 노트가 있으면 useWrongNotes 를 껐더라도 검토 목록에는 표시(기록 보존).
      (s.lectures || []).forEach((l) => {
        const notes = l.wrongNotes || [];
        if (notes.length > 0) out.push({ subjectName: s.name, materialId: l.id, materialTitle: l.name, materialType: 'lecture', notes });
      });
    });
    return out;
  }, [student.subjects]);

  const isResolved = (note: WrongNote) => (note.id in resolvedOverlay ? Boolean(resolvedOverlay[note.id]) : Boolean(note.resolvedAt));

  const unresolvedCount = bookNotes.reduce((sum, bn) => sum + bn.notes.filter((n) => !isResolved(n)).length, 0);

  const toggleResolve = async (materialId: string, note: WrongNote) => {
    if (busyId) return;
    const next = !isResolved(note);
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/wrong-note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialId, noteId: note.id, resolved: next }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setResolvedOverlay((prev) => ({ ...prev, [note.id]: next ? (json.resolvedAt || new Date().toISOString()) : undefined }));
      } else {
        toast.error(json.message || '처리에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setBusyId('');
    }
  };

  const loadImage = async (materialId: string, note: WrongNote) => {
    if (!note.imagePath || imgUrls[note.id] || loadingImg) return;
    setLoadingImg(note.id);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/wrong-note?materialId=${encodeURIComponent(materialId)}&noteId=${encodeURIComponent(note.id)}`, {
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (res.ok && json.success && json.url) setImgUrls((prev) => ({ ...prev, [note.id]: json.url }));
      else toast.error(json.message || '사진을 불러오지 못했습니다.');
    } catch {
      toast.error('사진 열람 중 오류가 발생했습니다.');
    } finally {
      setLoadingImg('');
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (bookNotes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/5 p-8 text-center">
        <NotebookPen className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">등록된 오답노트가 없습니다.</p>
        <p className="mt-1 text-xs font-medium text-slate-400">학생이 오답 문제를 남기면 여기에서 확인할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">오답노트 검토</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${unresolvedCount > 0 ? 'bg-[#0071E3]/10 text-[#0071E3]' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'}`}>
          {unresolvedCount > 0 ? `미확인 ${unresolvedCount}건` : '모두 확인됨'}
        </span>
      </div>

      {bookNotes.map(({ subjectName, materialId, materialTitle, materialType, notes }) => (
        <div key={materialId} className="rounded-2xl border border-black/[0.05] dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
          <div className="mb-3">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#0071E3]">
              {subjectName || '과목'}
              {materialType === 'lecture' && (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 dark:bg-white/10 px-1 py-0.5 text-[9px] font-bold normal-case tracking-normal text-slate-500 dark:text-slate-400">
                  <MonitorPlay className="h-2.5 w-2.5" /> 인강
                </span>
              )}
            </p>
            <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{materialTitle}</h4>
          </div>
          <ul className="space-y-2.5">
            {notes.map((note) => {
              const resolved = isResolved(note);
              const busy = busyId === note.id;
              const url = imgUrls[note.id];
              return (
                <li key={note.id} className={`rounded-xl border p-2.5 transition ${resolved ? 'border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/[0.06]' : 'border-black/[0.06] dark:border-white/10 bg-black/[0.02] dark:bg-white/5'}`}>
                  <div className="flex gap-2.5">
                    {note.imagePath && (
                      url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="오답 사진" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => loadImage(materialId, note)}
                          className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/10 text-slate-400 hover:text-[#0071E3]"
                        >
                          {loadingImg === note.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        </button>
                      )
                    )}
                    <div className="min-w-0 flex-1">
                      <WrongNoteBody note={note} />
                      {note.tags && note.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {note.tags.map((k) => (
                            <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${TAG_CLS[k] || 'bg-slate-100 text-slate-500'}`}>{TAG_LABEL[k] || k}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[10px] font-medium text-slate-400">{fmtDate(note.createdAt)}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleResolve(materialId, note)}
                          className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${resolved ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-[#0071E3] text-white hover:bg-[#0060c0]'}`}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          {resolved ? '확인 취소' : '확인'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
