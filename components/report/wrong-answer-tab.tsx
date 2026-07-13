'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Target, Plus, Minus, Camera, ImageIcon, Loader2, Trash2, Pencil, Check, X, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { Student, BookProgress, WrongNote } from '@/lib/types/student';
import { compressImageToJpeg } from '@/lib/image-compress';
import { getMaterialColor } from '@/lib/material-color';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { TabHero } from './tab-hero';

// 오답 사유 태그 — 과목별 진도에서 분리한 독립 탭. 교재별로 틀린 유형을 눌러 누적한다.
const TAGS = [
  { key: 'calculation_error', label: '연산' },
  { key: 'time_limit', label: '시간' },
  { key: 'misread_condition', label: '오독' },
  { key: 'concept_leak', label: '개념' },
] as const;

// 누적 카운트 배지 색 (진도 탭에서 쓰던 색과 동일하게 유지)
const COUNT_CLS: Record<string, string> = {
  calculation_error: 'bg-red-50 dark:bg-red-500/10 text-red-600',
  time_limit: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
  misread_condition: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600',
  concept_leak: 'bg-blue-50 dark:bg-[#0071E3]/15 text-[#0071E3]',
};
const TAG_LABEL: Record<string, string> = Object.fromEntries(TAGS.map((t) => [t.key, t.label]));

// 커스텀 태그 공용 색 — 학생이 만든 태그는 전부 이 색(기본 4종과 구분되는 역할 색).
const CUSTOM_TAG_CLS = 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300';
const tagCls = (key: string) => COUNT_CLS[key] || CUSTOM_TAG_CLS;
// 커스텀 태그는 저장된 문자열이 곧 라벨 — 태그를 삭제해도 노트에 남은 문자열은 그대로 표시된다.
const tagLabel = (key: string) => TAG_LABEL[key] || key;
const MAX_TAG_NAME_LEN = 10;

// 기본 4종 + 과목 커스텀 태그를 선택 가능한 {key,label} 목록으로 합친다(커스텀은 key=label=문자열).
const buildSelectableTags = (customTags: string[]) => [
  ...TAGS.map((t) => ({ key: t.key as string, label: t.label })),
  ...customTags.map((t) => ({ key: t, label: t })),
];

const fmtNoteDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

interface WrongAnswerTabProps {
  student: Student;
  isStudentReport: boolean;
  incrementBookIncorrectTag: (materialId: string, tagKey: string, currentTags: Record<string, number> | undefined) => Promise<boolean> | void;
  // 잘못 누른 카운트 되돌리기·직접 수정용. 정확한 값으로 저장한다.
  setBookIncorrectTag: (materialId: string, tagKey: string, nextCount: number, currentTags: Record<string, number> | undefined) => Promise<boolean> | void;
  activeTab: string;
}

// 교재별 오답 사유 스테퍼 — 낙관적 로컬 상태로 연속 −/+ 탭을 정확히 반영한다.
// (버그 원인: 예전엔 표시값이 서버 왕복 뒤에만 갱신돼, 빠르게 두 번 누르면 같은 값이 두 번 전송됐다.)
function BookTagStepper({
  book,
  customTags,
  setBookIncorrectTag,
}: {
  book: BookProgress;
  customTags: string[]; // 과목 커스텀 태그 — 기본 4종 뒤에 붙여 같은 방식으로 +/- 센다(키=태그 문자열).
  setBookIncorrectTag: WrongAnswerTabProps['setBookIncorrectTag'];
}) {
  const serverTags = book.incorrectTags;
  const [localTags, setLocalTags] = useState<Record<string, number>>(() => ({ ...(serverTags || {}) }));
  // 저장 직렬화 상태 — 동시에 하나의 저장만 나가고(레이스 방지), 연타는 마지막 스냅샷 하나로 합쳐 보낸다.
  const latestRef = useRef(localTags);          // 화면과 동일한 최신 낙관값
  const serverTagsRef = useRef(serverTags);     // 실패 롤백 기준
  const inFlightRef = useRef(false);
  const dirtyKeyRef = useRef<string | null>(null);
  const pendingRef = useRef(0);

  // 서버 확정값 동기화 — 진행 중인 저장이 없을 때만 props 를 채택(방금 누른 낙관적 값 보호).
  useEffect(() => {
    serverTagsRef.current = serverTags;
    if (pendingRef.current === 0) {
      const next = { ...(serverTags || {}) };
      latestRef.current = next;
      setLocalTags(next);
    }
  }, [serverTags]);

  // 표시·집계 대상 태그 — 기본 4종 + 커스텀. 삭제된 커스텀 태그의 누적치는 스테퍼에서 사라진다
  // (incorrectTags 값 자체는 남아 있어 태그를 다시 만들면 이어서 센다).
  const allTags = useMemo(() => buildSelectableTags(customTags), [customTags]);
  const total = allTags.reduce((sum, t) => sum + (Number(localTags[t.key]) || 0), 0);

  // 저장 큐 비우기 — in-flight 가 없을 때만 실행되고, 완료 후 그 사이 눌린 게 있으면 최신 스냅샷으로 한 번 더.
  // 절대값 전송 + 서버 conflict-재시도 특성상 병렬 전송은 마지막 탭을 잃을 수 있어 반드시 직렬화한다.
  const flush = async () => {
    if (inFlightRef.current) return;
    const tagKey = dirtyKeyRef.current;
    if (!tagKey) return;
    dirtyKeyRef.current = null;
    inFlightRef.current = true;
    pendingRef.current += 1;
    try {
      const snapshot = latestRef.current;
      const ok = await setBookIncorrectTag(book.id, tagKey, Number(snapshot[tagKey]) || 0, snapshot);
      if (ok === false) {
        // 저장 실패 — 낙관값을 서버 확정값으로 되돌린다(표시·서버 괴리 방지, 실패 토스트는 저장 훅이 띄움).
        const rollback = { ...(serverTagsRef.current || {}) };
        latestRef.current = rollback;
        setLocalTags(rollback);
        dirtyKeyRef.current = null;
      }
    } finally {
      inFlightRef.current = false;
      pendingRef.current -= 1;
      if (dirtyKeyRef.current) void flush();
    }
  };

  const bump = (tagKey: string, delta: number) => {
    const current = Number(latestRef.current[tagKey]) || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    const nextTags = { ...latestRef.current, [tagKey]: next };
    latestRef.current = nextTags;
    setLocalTags(nextTags); // 즉시 반영
    dirtyKeyRef.current = tagKey;
    void flush();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">오답 사유</p>
        <span className="shrink-0 rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
          누적 {total}
        </span>
      </div>
      {/* 눌러서 올리고, 잘못 눌렀으면 −로 되돌린다 */}
      <div className="grid grid-cols-2 gap-2">
        {allTags.map((t) => {
          const n = Number(localTags[t.key]) || 0;
          return (
            <div key={t.key} className="flex items-center justify-between gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5">
              <span className={`min-w-0 truncate rounded-md px-1.5 py-0.5 text-[11px] font-black leading-none ${n > 0 ? tagCls(t.key) : 'text-slate-500 dark:text-slate-400'}`}>{t.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={n <= 0}
                  onClick={() => bump(t.key, -1)}
                  className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 transition hover:border-red-300 hover:text-red-500 active:scale-90 disabled:opacity-30 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                  aria-label={`${t.label} 1 줄이기`}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-xs font-black tabular-nums text-slate-800 dark:text-slate-100">{n}</span>
                <button
                  type="button"
                  onClick={() => bump(t.key, 1)}
                  className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] active:scale-90"
                  aria-label={`${t.label} 1 늘리기`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <p className="text-[10px] font-semibold text-slate-400">
          잘못 눌렀다면 <span className="font-black text-slate-500 dark:text-slate-400">−</span> 로 되돌릴 수 있어요.
        </p>
      )}
    </div>
  );
}

// 교재별 오답 문제 기록 — 타이핑/사진으로 남기고, 목록에서 수정·삭제한다. 로컬 상태로 관리.
function BookWrongNotes({
  book,
  customTags,
  signedUrls,
  onUploadedUrl,
  onNotesChange,
  onCreateTag,
  onRemoveTag,
}: {
  book: BookProgress;
  customTags: string[]; // 이 교재가 속한 과목의 커스텀 태그
  signedUrls: Record<string, string>;
  onUploadedUrl: (path: string, url: string) => void;
  // 로컬 노트 변화를 부모에 보고 — 태그 모아보기(교재 횡단 필터)가 이 세션의 추가/삭제도 반영하게.
  onNotesChange: (bookId: string, notes: WrongNote[]) => void;
  onCreateTag: (tag: string) => Promise<boolean>;
  onRemoveTag: (tag: string) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const [notes, setNotes] = useState<WrongNote[]>(() => book.wrongNotes || []);
  const [draftText, setDraftText] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  // 인라인 태그 만들기/삭제 UI 상태
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // student prop 이 바뀌어 book.wrongNotes 가 갱신되면 로컬도 재동기화(다른 기기 편집 반영).
  useEffect(() => { setNotes(book.wrongNotes || []); }, [book.wrongNotes]);
  // 로컬 미리보기 URL 정리
  useEffect(() => () => { if (draftPreview) URL.revokeObjectURL(draftPreview); }, [draftPreview]);
  // 부모에 최신 노트 스냅샷 보고(태그 필터 뷰 데이터 소스)
  useEffect(() => { onNotesChange(book.id, notes); }, [book.id, notes, onNotesChange]);

  const toggleTag = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const selectableTags = buildSelectableTags(customTags);

  const submitNewTag = async () => {
    if (tagBusy) return;
    const tag = newTagName.trim();
    if (!tag) return;
    if (tag.length > MAX_TAG_NAME_LEN) { toast.error(`태그는 ${MAX_TAG_NAME_LEN}자 이내로 지어 주세요.`); return; }
    if (tag.includes(',')) { toast.error('태그 이름에는 쉼표를 쓸 수 없어요.'); return; }
    setTagBusy(true);
    try {
      const ok = await onCreateTag(tag);
      if (ok) setNewTagName('');
    } finally {
      setTagBusy(false);
    }
  };

  const removeCustomTag = async (tag: string) => {
    if (tagBusy) return;
    const ok = await confirm({
      title: `'${tag}' 태그를 삭제할까요?`,
      description: '이미 기록한 오답에 붙은 태그는 그대로 남아요.',
      tone: 'danger',
      confirmText: '삭제',
    });
    if (!ok) return;
    setTagBusy(true);
    try {
      const done = await onRemoveTag(tag);
      if (done) {
        // 선택 중이던 초안/수정 태그에서도 빼서, 저장 시 서버 화이트리스트에서 조용히 탈락하는 일을 막는다.
        setDraftTags((prev) => prev.filter((k) => k !== tag));
        setEditTags((prev) => prev.filter((k) => k !== tag));
      }
    } finally {
      setTagBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error('이미지 파일만 첨부할 수 있어요.'); return; }
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftFile(file);
    setDraftPreview(URL.createObjectURL(file));
  };

  const clearDraft = () => {
    setDraftText('');
    setDraftTags([]);
    setDraftFile(null);
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submitAdd = async () => {
    if (adding) return;
    const text = draftText.trim();
    if (!text && !draftFile) { toast.error('문제 내용을 적거나 사진을 첨부해 주세요.'); return; }
    setAdding(true);
    try {
      const fd = new FormData();
      fd.append('materialId', book.id);
      if (text) fd.append('text', text);
      if (draftTags.length > 0) fd.append('tags', draftTags.join(','));
      if (draftFile) {
        const blob = await compressImageToJpeg(draftFile, 1600, 0.85); // 문제 가독성 위해 살짝 크게
        fd.append('file', new File([blob], `wrong-${book.id}.jpg`, { type: 'image/jpeg' }));
      }
      const res = await fetch('/api/student/wrong-note', { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok && json.success && json.note) {
        const note = json.note as WrongNote;
        if (note.imagePath && json.signedUrl) onUploadedUrl(note.imagePath, json.signedUrl);
        setNotes((prev) => [...prev, note]);
        clearDraft();
        toast.success('오답을 저장했어요.');
      } else {
        toast.error(json.message || '저장에 실패했어요.');
      }
    } catch {
      toast.error('사진 처리에 실패했어요. 다른 사진으로 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (note: WrongNote) => {
    setEditingId(note.id);
    setEditText(note.text || '');
    setEditTags(note.tags || []);
  };

  const submitEdit = async (note: WrongNote) => {
    if (busyId) return;
    const text = editText.trim();
    if (!text && !note.imagePath) { toast.error('문제 내용을 비울 수 없어요.'); return; }
    setBusyId(note.id);
    try {
      const res = await fetch('/api/student/wrong-note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ materialId: book.id, noteId: note.id, text, tags: editTags }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, text: text || undefined, tags: editTags.length ? editTags : undefined } : n)));
        setEditingId('');
        toast.success('수정했어요.');
      } else {
        toast.error(json.message || '수정에 실패했어요.');
      }
    } catch {
      toast.error('수정 중 오류가 발생했어요.');
    } finally {
      setBusyId('');
    }
  };

  const removeNote = async (note: WrongNote) => {
    if (busyId) return;
    const ok = await confirm({ title: '이 오답을 삭제할까요?', description: '기록과 사진이 함께 지워져요.', tone: 'danger', confirmText: '삭제' });
    if (!ok) return;
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/student/wrong-note?materialId=${encodeURIComponent(book.id)}&noteId=${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        toast.success('삭제했어요.');
      } else {
        toast.error(json.message || '삭제에 실패했어요.');
      }
    } catch {
      toast.error('삭제 중 오류가 발생했어요.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-2.5 border-t border-slate-100 dark:border-white/10 pt-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">오답 문제 기록</p>

      {/* 기존 오답 목록 */}
      {notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((note) => {
            const url = note.imagePath ? signedUrls[note.imagePath] : undefined;
            const isEditing = editingId === note.id;
            const isBusy = busyId === note.id;
            return (
              <li key={note.id} className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-2.5">
                <div className="flex gap-2.5">
                  {note.imagePath && (
                    url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="오답 사진" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-white/10 text-slate-400">
                        <ImageIcon className="h-4 w-4" />
                      </span>
                    )
                  )}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#0071E3]/50"
                          placeholder="문제/오답 내용"
                        />
                        <div className="flex flex-wrap gap-1">
                          {selectableTags.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setEditTags((prev) => toggleTag(prev, t.key))}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black transition ${editTags.includes(t.key) ? tagCls(t.key) : 'bg-white dark:bg-[#1c1c1e] text-slate-400 border border-slate-200 dark:border-white/10'}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button type="button" disabled={isBusy} onClick={() => submitEdit(note)} className="inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50">
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} 저장
                          </button>
                          <button type="button" disabled={isBusy} onClick={() => setEditingId('')} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-white/10 px-2.5 py-1 text-[11px] font-black text-slate-500 dark:text-slate-400">
                            <X className="h-3 w-3" /> 취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {note.text && <p className="whitespace-pre-wrap break-keep text-xs font-semibold text-slate-800 dark:text-slate-100">{note.text}</p>}
                        {note.tags && note.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {note.tags.map((k) => (
                              <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${tagCls(k)}`}>{tagLabel(k)}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">{fmtNoteDate(note.createdAt)}</span>
                          {note.resolvedAt && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-300">
                              <Check className="h-2.5 w-2.5" /> 확인됨
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1">
                            <button type="button" onClick={() => startEdit(note)} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:text-[#0071E3]" aria-label="수정">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" disabled={isBusy} onClick={() => removeNote(note)} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:text-red-500 disabled:opacity-40" aria-label="삭제">
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가 폼 */}
      <div className="space-y-2 rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-2.5">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#0071E3]/50"
          placeholder="틀린 문제나 오답 내용을 적어 주세요. 사진만 올려도 돼요."
        />
        <div className="flex flex-wrap items-center gap-1">
          {selectableTags.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDraftTags((prev) => toggleTag(prev, t.key))}
              className={`rounded-full px-2 py-0.5 text-[10px] font-black transition ${draftTags.includes(t.key) ? tagCls(t.key) : 'bg-slate-50 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10'}`}
            >
              {t.label}
            </button>
          ))}
          {/* 커스텀 태그 만들기/정리 토글 */}
          <button
            type="button"
            onClick={() => setTagEditorOpen((v) => !v)}
            className={`inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-black transition ${tagEditorOpen ? 'border-[#0071E3]/50 text-[#0071E3]' : 'border-slate-300 dark:border-white/20 text-slate-400 hover:text-[#0071E3] hover:border-[#0071E3]/40'}`}
            aria-expanded={tagEditorOpen}
          >
            <Plus className="h-2.5 w-2.5" /> 태그 만들기
          </button>
        </div>

        {/* 인라인 태그 편집기 — 내 태그 추가/삭제. 과목 단위로 저장돼 같은 과목의 다른 교재에서도 함께 쓰여요. */}
        {tagEditorOpen && (
          <div className="space-y-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-2.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTagName}
                maxLength={MAX_TAG_NAME_LEN}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitNewTag(); } }}
                placeholder="예: 구조독해, 문법"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#0071E3]/50"
              />
              <button
                type="button"
                onClick={() => void submitNewTag()}
                disabled={tagBusy || !newTagName.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#0071E3] px-2.5 py-1.5 text-[11px] font-black text-white transition hover:bg-[#0060c0] disabled:opacity-40"
              >
                {tagBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} 추가
              </button>
            </div>
            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {customTags.map((t) => (
                  <span key={t} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${CUSTOM_TAG_CLS}`}>
                    {t}
                    <button
                      type="button"
                      onClick={() => void removeCustomTag(t)}
                      disabled={tagBusy}
                      className="grid h-3.5 w-3.5 place-items-center rounded-full transition hover:bg-teal-600/15 disabled:opacity-40"
                      aria-label={`${t} 태그 삭제`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] font-semibold text-slate-400 break-keep">
              내 태그는 과목당 12개까지, 10자 이내로 만들 수 있어요. 지워도 이미 기록한 오답에는 그대로 남아요.
            </p>
          </div>
        )}
        {draftPreview && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draftPreview} alt="첨부 미리보기" className="h-14 w-14 rounded-lg object-cover" />
            <button type="button" onClick={() => { setDraftFile(null); if (draftPreview) URL.revokeObjectURL(draftPreview); setDraftPreview(null); if (inputRef.current) inputRef.current.value = ''; }} className="text-[10px] font-black text-slate-400 hover:text-red-500">
              사진 빼기
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={adding}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-[11px] font-black text-slate-500 dark:text-slate-400 transition hover:text-[#0071E3] disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" /> 사진
          </button>
          <button
            type="button"
            onClick={submitAdd}
            disabled={adding || (!draftText.trim() && !draftFile)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-3 py-1.5 text-[11px] font-black text-white transition hover:bg-[#0060c0] disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} 오답 추가
          </button>
        </div>
      </div>
    </div>
  );
}

// 과목 id → 커스텀 태그 목록 맵 생성(학생 prop 기준 초기값/재동기화용).
const buildCustomTagMap = (subjects: Student['subjects']): Record<string, string[]> =>
  Object.fromEntries((subjects || []).map((s) => [s.id, s.customWrongTags || []]));

export function WrongAnswerTab({ student, isStudentReport, setBookIncorrectTag, activeTab }: WrongAnswerTabProps) {
  // 학생 본인 화면 전용 도구(오답 입력). 학부모 리포트에는 노출하지 않는다.
  const books = useMemo(
    () => (student.subjects || []).flatMap((sub) => (sub.books || []).map((book) => ({ subjectId: sub.id, subjectName: sub.name, book }))),
    [student.subjects],
  );

  // 과목별 커스텀 태그 — 서버(PUT) 응답으로 즉시 갱신하는 로컬 맵(학생 prop 재조회 없이 반영).
  const [customTagsBySubject, setCustomTagsBySubject] = useState<Record<string, string[]>>(() => buildCustomTagMap(student.subjects));
  useEffect(() => { setCustomTagsBySubject(buildCustomTagMap(student.subjects)); }, [student.subjects]);

  const mutateCustomTag = useCallback(async (subjectId: string, action: 'add' | 'remove', tag: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/wrong-note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ subjectId, action, tag }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCustomTagsBySubject((prev) => ({ ...prev, [subjectId]: json.customWrongTags || [] }));
        toast.success(action === 'add' ? '태그를 만들었어요.' : '태그를 삭제했어요.');
        return true;
      }
      toast.error(json.message || '태그 저장에 실패했어요.');
      return false;
    } catch {
      toast.error('태그 저장 중 오류가 발생했어요.');
      return false;
    }
  }, []);

  // 이 세션에서 추가/삭제된 노트 반영용 오버라이드 — 태그 모아보기가 최신 목록을 보게 한다.
  const [notesOverride, setNotesOverride] = useState<Record<string, WrongNote[]>>({});
  const handleNotesChange = useCallback((bookId: string, notes: WrongNote[]) => {
    setNotesOverride((prev) => ({ ...prev, [bookId]: notes }));
  }, []);
  const notesOf = useCallback(
    (book: BookProgress) => notesOverride[book.id] ?? (book.wrongNotes || []),
    [notesOverride],
  );

  // 태그 모아보기 — 단일 태그 필터. 노트에 실제로 달린 태그만 칩으로 노출(기본 4종 순서 우선).
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const usedTags = useMemo(() => {
    const counts = new Map<string, number>();
    books.forEach(({ book }) => notesOf(book).forEach((n) => (n.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))));
    const ordered: Array<{ key: string; count: number }> = [];
    TAGS.forEach((t) => {
      const c = counts.get(t.key);
      if (c) { ordered.push({ key: t.key, count: c }); counts.delete(t.key); }
    });
    counts.forEach((count, key) => ordered.push({ key, count }));
    return ordered;
  }, [books, notesOf]);

  const filteredNotes = useMemo(() => {
    if (!tagFilter) return [];
    return books
      .flatMap(({ subjectName, book }) =>
        notesOf(book)
          .filter((n) => (n.tags || []).includes(tagFilter))
          .map((note) => ({ subjectName, book, note })),
      )
      .sort((a, b) => (a.note.createdAt < b.note.createdAt ? 1 : -1));
  }, [books, notesOf, tagFilter]);

  // 오답 사진 서명 URL 맵(비공개 버킷). 탭이 활성화될 때 한 번 조회하고, 추가 시 병합한다.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const hasImages = useMemo(() => books.some(({ book }) => (book.wrongNotes || []).some((n) => n.imagePath)), [books]);
  useEffect(() => {
    if (!isStudentReport || activeTab !== 'wrong-note' || !hasImages) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/student/wrong-note', { credentials: 'same-origin' });
        const json = await res.json();
        if (alive && res.ok && json.success && json.urls) setSignedUrls((prev) => ({ ...prev, ...json.urls }));
      } catch { /* 썸네일은 실패해도 텍스트/플레이스홀더로 표시 */ }
    })();
    return () => { alive = false; };
  }, [isStudentReport, activeTab, hasImages]);

  const mergeUrl = (path: string, url: string) => setSignedUrls((prev) => ({ ...prev, [path]: url }));

  if (!isStudentReport) return null;

  return (
    <section id="wrong-note" className={`scroll-mt-24 space-y-5 ${activeTab === 'wrong-note' ? '' : 'hidden'}`}>
      <TabHero
        eyebrow="Wrong Note"
        icon={Target}
        title="오답 노트"
        description="틀린 문제를 사진·글로 남기고, 사유 태그로 약점 유형까지 쌓아 두면 복습이 쉬워져요."
      />

      {/* 태그 모아보기 — 태그를 누르면 모든 교재를 가로질러 그 태그가 달린 오답만 모아 보여줘요. */}
      {usedTags.length > 0 && (
        <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">태그 모아보기</p>
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400 transition hover:text-slate-700"
              >
                <X className="h-2.5 w-2.5" /> 전체 보기
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {usedTags.map(({ key, count }) => {
              const selected = tagFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTagFilter(selected ? null : key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
                    selected
                      ? `${tagCls(key)} ring-1 ring-current`
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                  }`}
                  aria-pressed={selected}
                >
                  {tagLabel(key)} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tagFilter ? (
        // 태그 필터 뷰 — 과목·교재 라벨을 병기한 교재 횡단 모아보기(읽기 전용).
        filteredNotes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-8 text-center">
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">이 태그가 달린 오답이 없어요.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-400">전체 보기로 돌아가 오답을 기록해 보세요.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filteredNotes.map(({ subjectName, book, note }) => {
              const url = note.imagePath ? signedUrls[note.imagePath] : undefined;
              return (
                <li key={`${book.id}-${note.id}`} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3.5 shadow-sm">
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: getMaterialColor(book) }}>
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(book) }} />
                    <span className="truncate">{subjectName || '과목'} · {book.title}</span>
                  </p>
                  <div className="mt-2 flex gap-2.5">
                    {note.imagePath && (
                      url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="오답 사진" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-white/10 text-slate-400">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )
                    )}
                    <div className="min-w-0 flex-1">
                      {note.text && <p className="whitespace-pre-wrap break-keep text-xs font-semibold text-slate-800 dark:text-slate-100">{note.text}</p>}
                      {note.tags && note.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {note.tags.map((k) => (
                            <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${tagCls(k)}`}>{tagLabel(k)}</span>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 text-[10px] font-bold text-slate-400">{fmtNoteDate(note.createdAt)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : books.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-8 text-center">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300">등록된 교재가 없어요.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-400">교재가 추가되면 여기에서 오답을 기록할 수 있어요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {books.map(({ subjectId, subjectName, book }) => {
            const customTags = customTagsBySubject[subjectId] || [];
            return (
              <div key={book.id} className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: getMaterialColor(book) }}>
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(book) }} />
                      {subjectName || '과목'}
                    </p>
                    <h3 className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-slate-100">{book.title}</h3>
                  </div>
                  <NotebookPen className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </div>

                <BookTagStepper book={book} customTags={customTags} setBookIncorrectTag={setBookIncorrectTag} />

                <BookWrongNotes
                  book={book}
                  customTags={customTags}
                  signedUrls={signedUrls}
                  onUploadedUrl={mergeUrl}
                  onNotesChange={handleNotesChange}
                  onCreateTag={(tag) => mutateCustomTag(subjectId, 'add', tag)}
                  onRemoveTag={(tag) => mutateCustomTag(subjectId, 'remove', tag)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
