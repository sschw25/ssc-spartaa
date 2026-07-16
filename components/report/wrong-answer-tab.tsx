'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Target, Plus, Camera, ImageIcon, Loader2, Trash2, Pencil, Check, X, NotebookPen, Bold, Underline, MonitorPlay, Highlighter } from 'lucide-react';
import { toast } from 'sonner';
import { Student, LectureProgress, WrongNote } from '@/lib/types/student';
import { compressImageToJpeg } from '@/lib/image-compress';
import { getMaterialColor } from '@/lib/material-color';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AnimatedOverlay } from '@/components/ui/animated-overlay';
import { WrongNoteBody } from './wrong-note-markup';
import { TabHero } from './tab-hero';

// 오답노트 독립 탭 — 교재 + (오답노트를 켠) 인강의 틀린 문제를 기록하고, 노트 태그로 약점 유형을 쌓는다.
// 상단 오답 사유 카운터(스테퍼)는 제거됐다(#8) — 약점 분석의 단일 소스는 노트에 붙인 태그.
const TAGS = [
  { key: 'calculation_error', label: '연산' },
  { key: 'time_limit', label: '시간' },
  { key: 'misread_condition', label: '오독' },
  { key: 'concept_leak', label: '개념' },
] as const;

// 태그 배지 색 (기본 4종 — 의미/역할 색)
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
const MAX_CUSTOM_TAGS_PER_SUBJECT = 24; // 서버(app/api/student/wrong-note)와 동일
const MAX_TAGS_PER_NOTE = 8;            // 노트당 선택 가능 태그(서버 finalizeTags와 동일)

// 기본 4종 + 과목 커스텀 태그를 선택 가능한 {key,label} 목록으로 합친다(커스텀은 key=label=문자열).
const buildSelectableTags = (customTags: string[]) => [
  ...TAGS.map((t) => ({ key: t.key as string, label: t.label })),
  ...customTags.map((t) => ({ key: t, label: t })),
];

const fmtNoteDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

// 노트당 태그 토글 — 상한(8개) 초과 시 토스트로 안내하고 그대로 둔다.
const toggleTagCapped = (list: string[], key: string): string[] => {
  if (list.includes(key)) return list.filter((k) => k !== key);
  if (list.length >= MAX_TAGS_PER_NOTE) {
    toast.error(`태그는 한 오답에 최대 ${MAX_TAGS_PER_NOTE}개까지 붙일 수 있어요.`);
    return list;
  }
  return [...list, key];
};

// 오답노트 대상 자료 뷰모델 — 교재 전체 + 오답노트를 켠 인강.
interface NoteTarget {
  subjectId: string;
  subjectName: string;
  id: string;
  title: string;
  type: 'book' | 'lecture';
  colorSource: { id?: string; color?: string };
}

// ── 자동 높이 textarea (#11/#14) — 태블릿에서 크기조절이 안 되는 문제를 입력량 따라 자라는 높이로 해결 ──
const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minHeightPx?: number }>(
  function AutoGrowTextarea({ minHeightPx = 88, style, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    };
    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(minHeightPx, el.scrollHeight)}px`;
    }, [minHeightPx, rest.value]);
    return (
      <textarea
        ref={setRefs}
        style={{ ...style, minHeight: minHeightPx, resize: 'none', overflow: 'hidden' }}
        {...rest}
      />
    );
  },
);

// ── 서식 툴바 (#12) — 선택 텍스트를 경량 마크업(**볼드**/__밑줄__/{red|blue|mark:…})으로 감싼다 ──
// HTML 저장 없음: 렌더는 wrong-note-markup 의 화이트리스트 파서만 사용(XSS 차단).
function FormattingBar({
  targetRef,
  value,
  onChange,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const apply = (before: string, after: string) => {
    const el = targetRef.current;
    if (!el) return;
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const sel = value.slice(s, e);
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const btnCls = 'inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 transition hover:border-[#0071E3]/40 hover:text-[#0071E3] active:scale-95';
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" className={btnCls} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('**', '**')} aria-label="볼드">
        <Bold className="h-3 w-3" />
      </button>
      <button type="button" className={btnCls} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('__', '__')} aria-label="밑줄">
        <Underline className="h-3 w-3" />
      </button>
      <button type="button" className={`${btnCls} text-red-500 dark:text-red-400`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('{red:', '}')} aria-label="빨강 강조">
        빨강
      </button>
      <button type="button" className={`${btnCls} text-[#0071E3] dark:text-[#4da3ff]`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('{blue:', '}')} aria-label="파랑 강조">
        파랑
      </button>
      <button type="button" className={`${btnCls} text-amber-600 dark:text-amber-400`} onMouseDown={(e) => e.preventDefault()} onClick={() => apply('{mark:', '}')} aria-label="형광 강조">
        <Highlighter className="h-3 w-3" /> 형광
      </button>
    </div>
  );
}

const TEXTAREA_CLS = 'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-2 text-xs leading-relaxed text-slate-800 dark:text-slate-100 outline-none focus:border-[#0071E3]/50';

// ── 오답 추가 시트 (#13) — 목록에 밀리지 않게 상단 버튼 → 슬라이드 시트로 2차 진입 ──
function AddNoteSheet({
  target,
  customTags,
  requestClose,
  onAdded,
  onUploadedUrl,
  onCreateTag,
  onRemoveTag,
  onRenameTag,
}: {
  target: NoteTarget;
  customTags: string[];
  requestClose: () => void;
  onAdded: (materialId: string, note: WrongNote) => void;
  onUploadedUrl: (path: string, url: string) => void;
  onCreateTag: (tag: string) => Promise<boolean>;
  onRemoveTag: (tag: string) => Promise<boolean>;
  onRenameTag: (tag: string, newTag: string) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // 인라인 태그 만들기/수정/삭제 UI 상태
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [renameFrom, setRenameFrom] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => { if (draftPreview) URL.revokeObjectURL(draftPreview); }, [draftPreview]);

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
      if (done) setDraftTags((prev) => prev.filter((k) => k !== tag));
    } finally {
      setTagBusy(false);
    }
  };

  // 태그 이름 바꾸기 (#10) — 기존 오답에 붙은 태그명도 서버에서 함께 바뀐다.
  const submitRename = async () => {
    if (tagBusy || !renameFrom) return;
    const next = renameValue.trim();
    if (!next) return;
    if (next.length > MAX_TAG_NAME_LEN) { toast.error(`태그는 ${MAX_TAG_NAME_LEN}자 이내로 지어 주세요.`); return; }
    if (next.includes(',')) { toast.error('태그 이름에는 쉼표를 쓸 수 없어요.'); return; }
    if (next === renameFrom) { setRenameFrom(''); return; }
    setTagBusy(true);
    try {
      const ok = await onRenameTag(renameFrom, next);
      if (ok) {
        setDraftTags((prev) => prev.map((k) => (k === renameFrom ? next : k)));
        setRenameFrom('');
        setRenameValue('');
      }
    } finally {
      setTagBusy(false);
    }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error('이미지 파일만 첨부할 수 있어요.'); return; }
    if (draftPreview) URL.revokeObjectURL(draftPreview);
    setDraftFile(file);
    setDraftPreview(URL.createObjectURL(file));
  };

  const submitAdd = async () => {
    if (adding) return;
    const q = question.trim();
    const a = answer.trim();
    if (!q && !a && !draftFile) { toast.error('문제나 정답·풀이를 적거나 사진을 첨부해 주세요.'); return; }
    setAdding(true);
    try {
      const fd = new FormData();
      fd.append('materialId', target.id);
      if (q) fd.append('question', q);
      if (a) fd.append('answer', a);
      if (draftTags.length > 0) fd.append('tags', draftTags.join(','));
      if (draftFile) {
        const blob = await compressImageToJpeg(draftFile, 1600, 0.85); // 문제 가독성 위해 살짝 크게
        fd.append('file', new File([blob], `wrong-${target.id}.jpg`, { type: 'image/jpeg' }));
      }
      const res = await fetch('/api/student/wrong-note', { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok && json.success && json.note) {
        const note = json.note as WrongNote;
        if (note.imagePath && json.signedUrl) onUploadedUrl(note.imagePath, json.signedUrl);
        onAdded(target.id, note);
        toast.success('오답을 저장했어요.');
        requestClose();
      } else {
        toast.error(json.message || '저장에 실패했어요.');
      }
    } catch {
      toast.error('사진 처리에 실패했어요. 다른 사진으로 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-white/10 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: getMaterialColor(target.colorSource) }}>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(target.colorSource) }} />
            <span className="truncate">{target.subjectName || '과목'} · {target.title}</span>
          </p>
          <h4 className="mt-0.5 text-base font-black text-slate-900 dark:text-slate-100">오답 추가</h4>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {/* 문제 (#11/#14 — 문제/정답 2칸 분리) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">문제</label>
            <FormattingBar targetRef={questionRef} value={question} onChange={setQuestion} />
          </div>
          <AutoGrowTextarea
            ref={questionRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            minHeightPx={96}
            maxLength={2000}
            className={TEXTAREA_CLS}
            placeholder="틀린 문제를 적어 주세요. 사진만 올려도 돼요."
          />
        </div>

        {/* 정답 및 풀이 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">정답 · 풀이</label>
            <FormattingBar targetRef={answerRef} value={answer} onChange={setAnswer} />
          </div>
          <AutoGrowTextarea
            ref={answerRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            minHeightPx={112}
            maxLength={2000}
            className={TEXTAREA_CLS}
            placeholder="정답과 풀이 과정, 다시 볼 포인트를 남겨 주세요."
          />
        </div>
        <p className="text-[10px] font-semibold text-slate-400 break-keep">
          글자를 드래그한 뒤 <span className="font-black">B</span>·밑줄·색 버튼을 누르면 강조 표시가 들어가요.
        </p>

        {/* 태그 선택 */}
        <div className="flex flex-wrap items-center gap-1">
          {selectableTags.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDraftTags((prev) => toggleTagCapped(prev, t.key))}
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
            <Plus className="h-2.5 w-2.5" /> 태그 관리
          </button>
        </div>

        {/* 인라인 태그 편집기 — 내 태그 추가/이름 바꾸기/삭제. 과목 단위로 저장돼 같은 과목의 다른 자료에서도 함께 쓰여요. */}
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
                      onClick={() => { setRenameFrom(t); setRenameValue(t); }}
                      disabled={tagBusy}
                      className="grid h-3.5 w-3.5 place-items-center rounded-full transition hover:bg-teal-600/15 disabled:opacity-40"
                      aria-label={`${t} 태그 이름 바꾸기`}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
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
            {/* 이름 바꾸기 폼 (#10) — 이미 기록한 오답의 태그명도 함께 바뀌어요 */}
            {renameFrom && (
              <div className="space-y-1.5 rounded-lg border border-teal-200 dark:border-teal-500/20 bg-white dark:bg-[#1c1c1e] p-2">
                <p className="text-[10px] font-black text-teal-600 dark:text-teal-300">‘{renameFrom}’ 이름 바꾸기</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={renameValue}
                    maxLength={MAX_TAG_NAME_LEN}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitRename(); } }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#0071E3]/50"
                  />
                  <button
                    type="button"
                    onClick={() => void submitRename()}
                    disabled={tagBusy || !renameValue.trim()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#0071E3] px-2.5 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
                  >
                    {tagBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenameFrom(''); setRenameValue(''); }}
                    disabled={tagBusy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 dark:bg-white/10 px-2 py-1.5 text-[11px] font-black text-slate-500 dark:text-slate-400"
                  >
                    취소
                  </button>
                </div>
                <p className="text-[9.5px] font-semibold text-slate-400 break-keep">이미 기록한 오답에 붙은 태그 이름도 함께 바뀌어요.</p>
              </div>
            )}
            <p className="text-[10px] font-semibold text-slate-400 break-keep">
              내 태그는 과목당 {MAX_CUSTOM_TAGS_PER_SUBJECT}개까지, {MAX_TAG_NAME_LEN}자 이내로 만들 수 있어요. 지워도 이미 기록한 오답에는 그대로 남아요.
            </p>
          </div>
        )}

        {draftPreview && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draftPreview} alt="첨부 미리보기" className="h-14 w-14 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => { setDraftFile(null); if (draftPreview) URL.revokeObjectURL(draftPreview); setDraftPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="text-[10px] font-black text-slate-400 hover:text-red-500"
            >
              사진 빼기
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-slate-100 dark:border-white/10 px-5 py-3.5">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={adding}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-2 text-[11px] font-black text-slate-500 dark:text-slate-400 transition hover:text-[#0071E3] disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" /> 사진
        </button>
        <button
          type="button"
          onClick={submitAdd}
          disabled={adding || (!question.trim() && !answer.trim() && !draftFile)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#0071E3] px-4 py-2 text-[11px] font-black text-white transition hover:bg-[#0060c0] disabled:opacity-40"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} 오답 저장
        </button>
      </div>
    </>
  );
}

// ── 자료별 오답 카드 — 상단 '오답 추가' 버튼(#13) + 최신순 목록. 수정/삭제는 인라인 ──
function MaterialNotesCard({
  target,
  notes,
  customTags,
  signedUrls,
  onOpenAdd,
  onPatchNote,
  onRemoveNote,
  onToggleLectureUse,
}: {
  target: NoteTarget;
  notes: WrongNote[];
  customTags: string[];
  signedUrls: Record<string, string>;
  onOpenAdd: (target: NoteTarget) => void;
  onPatchNote: (materialId: string, noteId: string, updater: (n: WrongNote) => WrongNote) => void;
  onRemoveNote: (materialId: string, noteId: string) => void;
  onToggleLectureUse: (materialId: string, enabled: boolean) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [togglingUse, setTogglingUse] = useState(false);
  const editQRef = useRef<HTMLTextAreaElement | null>(null);
  const editARef = useRef<HTMLTextAreaElement | null>(null);
  const editTRef = useRef<HTMLTextAreaElement | null>(null);

  const selectableTags = buildSelectableTags(customTags);
  // 최신이 위 (#13) — 저장은 append 순서 유지, 표시만 역순.
  const displayNotes = useMemo(() => [...notes].reverse(), [notes]);

  const startEdit = (note: WrongNote) => {
    setEditingId(note.id);
    setEditQuestion(note.question || '');
    setEditAnswer(note.answer || '');
    setEditText(note.text || '');
    setEditTags(note.tags || []);
  };

  const submitEdit = async (note: WrongNote) => {
    if (busyId) return;
    const isStructured = Boolean(note.question || note.answer);
    const q = editQuestion.trim();
    const a = editAnswer.trim();
    const t = editText.trim();
    if (isStructured ? (!q && !a && !note.imagePath) : (!t && !note.imagePath)) {
      toast.error('문제 내용을 비울 수 없어요.');
      return;
    }
    setBusyId(note.id);
    try {
      const body = isStructured
        ? { materialId: target.id, noteId: note.id, question: q, answer: a, tags: editTags }
        : { materialId: target.id, noteId: note.id, text: t, tags: editTags };
      const res = await fetch('/api/student/wrong-note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        // 서버가 화이트리스트 필터를 거친 확정 태그를 내려준다 — 낙관 반영과 저장 결과가 어긋나지 않게 그 값을 쓴다.
        const confirmedTags: string[] = Array.isArray(json.tags) ? json.tags : editTags;
        onPatchNote(target.id, note.id, (n) => {
          const updated: WrongNote = { ...n, tags: confirmedTags.length ? confirmedTags : undefined };
          if (isStructured) {
            updated.question = q || undefined;
            updated.answer = a || undefined;
          } else {
            updated.text = t || undefined;
          }
          return updated;
        });
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
      const res = await fetch(`/api/student/wrong-note?materialId=${encodeURIComponent(target.id)}&noteId=${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onRemoveNote(target.id, note.id);
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

  const turnOffLecture = async () => {
    if (togglingUse) return;
    const ok = await confirm({
      title: '이 인강의 오답노트를 끌까요?',
      description: '기록한 오답은 지워지지 않고, 다시 켜면 그대로 보여요.',
      confirmText: '끄기',
    });
    if (!ok) return;
    setTogglingUse(true);
    try {
      await onToggleLectureUse(target.id, false);
    } finally {
      setTogglingUse(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: getMaterialColor(target.colorSource) }}>
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(target.colorSource) }} />
            {target.subjectName || '과목'}
            {target.type === 'lecture' && (
              <span className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-slate-100 dark:bg-white/10 px-1 py-0.5 text-[9px] font-black normal-case tracking-normal text-slate-500 dark:text-slate-400">
                <MonitorPlay className="h-2.5 w-2.5" /> 인강
              </span>
            )}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-slate-100">{target.title}</h3>
        </div>
        {target.type === 'lecture' ? (
          <button
            type="button"
            onClick={() => void turnOffLecture()}
            disabled={togglingUse}
            className="shrink-0 rounded-full border border-slate-200 dark:border-white/10 px-2 py-0.5 text-[9.5px] font-black text-slate-400 transition hover:text-red-500 hover:border-red-300 disabled:opacity-40"
          >
            {togglingUse ? '저장 중' : '사용 끄기'}
          </button>
        ) : (
          <NotebookPen className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
        )}
      </div>

      {/* 오답 추가 — 목록이 쌓여도 입력 진입은 항상 상단 (#13) */}
      <button
        type="button"
        onClick={() => onOpenAdd(target)}
        className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[#0071E3]/40 bg-[#0071E3]/[0.04] dark:bg-[#0071E3]/10 py-2 text-[11px] font-black text-[#0071E3] transition hover:bg-[#0071E3]/[0.08] active:scale-[0.99]"
      >
        <Plus className="h-3.5 w-3.5" /> 오답 추가
      </button>

      {displayNotes.length === 0 ? (
        <p className="text-center text-[10px] font-semibold text-slate-400">아직 기록한 오답이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {displayNotes.map((note) => {
            const url = note.imagePath ? signedUrls[note.imagePath] : undefined;
            const isEditing = editingId === note.id;
            const isBusy = busyId === note.id;
            const isStructured = Boolean(note.question || note.answer);
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
                        {isStructured ? (
                          <>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">문제</span>
                                <FormattingBar targetRef={editQRef} value={editQuestion} onChange={setEditQuestion} />
                              </div>
                              <AutoGrowTextarea
                                ref={editQRef}
                                value={editQuestion}
                                onChange={(e) => setEditQuestion(e.target.value)}
                                minHeightPx={72}
                                maxLength={2000}
                                className={TEXTAREA_CLS}
                                placeholder="문제"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">정답 · 풀이</span>
                                <FormattingBar targetRef={editARef} value={editAnswer} onChange={setEditAnswer} />
                              </div>
                              <AutoGrowTextarea
                                ref={editARef}
                                value={editAnswer}
                                onChange={(e) => setEditAnswer(e.target.value)}
                                minHeightPx={72}
                                maxLength={2000}
                                className={TEXTAREA_CLS}
                                placeholder="정답 및 풀이"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-end">
                              <FormattingBar targetRef={editTRef} value={editText} onChange={setEditText} />
                            </div>
                            <AutoGrowTextarea
                              ref={editTRef}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              minHeightPx={72}
                              maxLength={2000}
                              className={TEXTAREA_CLS}
                              placeholder="문제/오답 내용"
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {selectableTags.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setEditTags((prev) => toggleTagCapped(prev, t.key))}
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
                        <WrongNoteBody note={note} />
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
    </div>
  );
}

// 과목 id → 커스텀 태그 목록 맵 생성(학생 prop 기준 초기값/재동기화용).
const buildCustomTagMap = (subjects: Student['subjects']): Record<string, string[]> =>
  Object.fromEntries((subjects || []).map((s) => [s.id, s.customWrongTags || []]));

// 자료 id → 노트 목록 맵 생성 — 이 탭의 노트 단일 소스(로컬 낙관 반영, prop 갱신 시 재동기화).
const buildNotesMap = (subjects: Student['subjects']): Record<string, WrongNote[]> => {
  const map: Record<string, WrongNote[]> = {};
  (subjects || []).forEach((s) => {
    (s.books || []).forEach((b) => { map[b.id] = b.wrongNotes || []; });
    (s.lectures || []).forEach((l) => { map[l.id] = l.wrongNotes || []; });
  });
  return map;
};

interface WrongAnswerTabProps {
  student: Student;
  isStudentReport: boolean;
  activeTab: string;
}

export function WrongAnswerTab({ student, isStudentReport, activeTab }: WrongAnswerTabProps) {
  // 인강 오답노트 사용 토글의 낙관 반영 — 서버 저장 성공 시에만 기록(키 없으면 자료의 useWrongNotes).
  const [lectureUse, setLectureUse] = useState<Record<string, boolean>>({});

  // 학생 본인 화면 전용 도구(오답 입력). 학부모 리포트에는 노출하지 않는다.
  const materials = useMemo<NoteTarget[]>(() => {
    const list: NoteTarget[] = [];
    (student.subjects || []).forEach((sub) => {
      (sub.books || []).forEach((book) => {
        list.push({ subjectId: sub.id, subjectName: sub.name, id: book.id, title: book.title, type: 'book', colorSource: book });
      });
      (sub.lectures || []).forEach((lec) => {
        const enabled = lectureUse[lec.id] ?? Boolean(lec.useWrongNotes);
        if (enabled) list.push({ subjectId: sub.id, subjectName: sub.name, id: lec.id, title: lec.name, type: 'lecture', colorSource: lec });
      });
    });
    return list;
  }, [student.subjects, lectureUse]);

  // 오답노트가 꺼진 인강 목록 — 켜기 진입점 (#6)
  const offLectures = useMemo(() => {
    const list: Array<{ subjectName: string; lecture: LectureProgress }> = [];
    (student.subjects || []).forEach((sub) => {
      (sub.lectures || []).forEach((lec) => {
        const enabled = lectureUse[lec.id] ?? Boolean(lec.useWrongNotes);
        if (!enabled) list.push({ subjectName: sub.name, lecture: lec });
      });
    });
    return list;
  }, [student.subjects, lectureUse]);

  // 과목별 커스텀 태그 — 서버(PUT) 응답으로 즉시 갱신하는 로컬 맵(학생 prop 재조회 없이 반영).
  const [customTagsBySubject, setCustomTagsBySubject] = useState<Record<string, string[]>>(() => buildCustomTagMap(student.subjects));
  useEffect(() => { setCustomTagsBySubject(buildCustomTagMap(student.subjects)); }, [student.subjects]);

  // 자료별 노트 — 부모가 단일 소스로 들고, 추가/수정/삭제/이름변경을 낙관 반영한다.
  const [notesByMaterial, setNotesByMaterial] = useState<Record<string, WrongNote[]>>(() => buildNotesMap(student.subjects));
  useEffect(() => { setNotesByMaterial(buildNotesMap(student.subjects)); }, [student.subjects]);
  const notesOf = useCallback((materialId: string) => notesByMaterial[materialId] || [], [notesByMaterial]);

  const appendNote = useCallback((materialId: string, note: WrongNote) => {
    setNotesByMaterial((prev) => ({ ...prev, [materialId]: [...(prev[materialId] || []), note] }));
  }, []);
  const patchNote = useCallback((materialId: string, noteId: string, updater: (n: WrongNote) => WrongNote) => {
    setNotesByMaterial((prev) => ({
      ...prev,
      [materialId]: (prev[materialId] || []).map((n) => (n.id === noteId ? updater(n) : n)),
    }));
  }, []);
  const removeNoteLocal = useCallback((materialId: string, noteId: string) => {
    setNotesByMaterial((prev) => ({ ...prev, [materialId]: (prev[materialId] || []).filter((n) => n.id !== noteId) }));
  }, []);
  // 태그 이름 변경의 로컬 반영 — 서버가 모든 노트의 태그명을 함께 바꾸므로 화면도 즉시 맞춘다.
  const renameTagLocal = useCallback((from: string, to: string) => {
    setNotesByMaterial((prev) => Object.fromEntries(
      Object.entries(prev).map(([mid, arr]) => [
        mid,
        arr.map((n) => (n.tags?.includes(from)
          ? { ...n, tags: Array.from(new Set(n.tags.map((t) => (t === from ? to : t)))) }
          : n)),
      ]),
    ));
  }, []);

  const mutateCustomTag = useCallback(async (subjectId: string, action: 'add' | 'remove' | 'rename', tag: string, newTag?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/wrong-note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ subjectId, action, tag, ...(newTag ? { newTag } : {}) }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCustomTagsBySubject((prev) => ({ ...prev, [subjectId]: json.customWrongTags || [] }));
        if (action === 'rename' && newTag) renameTagLocal(tag, newTag);
        toast.success(action === 'add' ? '태그를 만들었어요.' : action === 'remove' ? '태그를 삭제했어요.' : '태그 이름을 바꿨어요.');
        return true;
      }
      toast.error(json.message || '태그 저장에 실패했어요.');
      return false;
    } catch {
      toast.error('태그 저장 중 오류가 발생했어요.');
      return false;
    }
  }, [renameTagLocal]);

  // 인강 오답노트 사용 토글 (#6) — 학생 본인 세션 쓰기 경로(PUT lectureNotes).
  const toggleLectureNotes = useCallback(async (materialId: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch('/api/student/wrong-note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'lectureNotes', materialId, enabled }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setLectureUse((prev) => ({ ...prev, [materialId]: enabled }));
        toast.success(enabled ? '이 인강의 오답노트를 켰어요.' : '이 인강의 오답노트를 껐어요.');
        return true;
      }
      toast.error(json.message || '설정 저장에 실패했어요.');
      return false;
    } catch {
      toast.error('설정 저장 중 오류가 발생했어요.');
      return false;
    }
  }, []);
  const [enablingLectureId, setEnablingLectureId] = useState('');
  const enableLecture = async (materialId: string) => {
    if (enablingLectureId) return;
    setEnablingLectureId(materialId);
    try {
      await toggleLectureNotes(materialId, true);
    } finally {
      setEnablingLectureId('');
    }
  };

  // 태그 모아보기 — 과목 필터(#7) + 단일 태그 필터. 노트에 실제로 달린 태그만 칩으로 노출(기본 4종 순서 우선).
  const [subjectFilter, setSubjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const noteSubjects = useMemo(() => {
    const seen = new Map<string, string>();
    materials.forEach((m) => {
      if (notesOf(m.id).length > 0 && !seen.has(m.subjectId)) seen.set(m.subjectId, m.subjectName || '과목');
    });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [materials, notesOf]);

  const scopedMaterials = useMemo(
    () => (subjectFilter ? materials.filter((m) => m.subjectId === subjectFilter) : materials),
    [materials, subjectFilter],
  );

  const usedTags = useMemo(() => {
    const counts = new Map<string, number>();
    scopedMaterials.forEach((m) => notesOf(m.id).forEach((n) => (n.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))));
    const ordered: Array<{ key: string; count: number }> = [];
    TAGS.forEach((t) => {
      const c = counts.get(t.key);
      if (c) { ordered.push({ key: t.key, count: c }); counts.delete(t.key); }
    });
    counts.forEach((count, key) => ordered.push({ key, count }));
    return ordered;
  }, [scopedMaterials, notesOf]);

  // 과목 필터를 바꿨는데 그 과목에 없는 태그가 선택돼 있으면 태그 필터를 푼다.
  useEffect(() => {
    if (tagFilter && !usedTags.some((t) => t.key === tagFilter)) setTagFilter(null);
  }, [tagFilter, usedTags]);

  const filteredNotes = useMemo(() => {
    if (!tagFilter) return [];
    return scopedMaterials
      .flatMap((m) =>
        notesOf(m.id)
          .filter((n) => (n.tags || []).includes(tagFilter))
          .map((note) => ({ target: m, note })),
      )
      .sort((a, b) => (a.note.createdAt < b.note.createdAt ? 1 : -1));
  }, [scopedMaterials, notesOf, tagFilter]);

  // 오답 사진 서명 URL 맵(비공개 버킷). 탭이 활성화될 때 한 번 조회하고, 추가 시 병합한다.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const hasImages = useMemo(
    () => Object.values(notesByMaterial).some((arr) => arr.some((n) => n.imagePath)),
    [notesByMaterial],
  );
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

  const mergeUrl = useCallback((path: string, url: string) => setSignedUrls((prev) => ({ ...prev, [path]: url })), []);

  // 오답 추가 시트 (#13)
  const [addTarget, setAddTarget] = useState<NoteTarget | null>(null);

  if (!isStudentReport) return null;

  return (
    <section id="wrong-note" className={`scroll-mt-24 space-y-5 ${activeTab === 'wrong-note' ? '' : 'hidden'}`}>
      <TabHero
        eyebrow="Wrong Note"
        icon={Target}
        title="오답 노트"
        description="틀린 문제와 정답·풀이를 사진·글로 남기고, 태그로 약점 유형까지 쌓아 두면 복습이 쉬워져요."
      />

      {/* 태그 모아보기 — 과목을 고르고 태그를 누르면 자료를 가로질러 그 태그가 달린 오답만 모아 보여줘요. */}
      {(usedTags.length > 0 || noteSubjects.length > 0) && (
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

          {/* 과목 필터 (#7) — 태그 통계를 과목별로 나눠 볼 수 있어요 */}
          {noteSubjects.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSubjectFilter('')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
                  subjectFilter === ''
                    ? 'bg-[#0071E3] text-white'
                    : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                }`}
                aria-pressed={subjectFilter === ''}
              >
                전체 과목
              </button>
              {noteSubjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubjectFilter(subjectFilter === s.id ? '' : s.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
                    subjectFilter === s.id
                      ? 'bg-[#0071E3] text-white'
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                  }`}
                  aria-pressed={subjectFilter === s.id}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {usedTags.length > 0 ? (
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
          ) : (
            <p className="mt-2 text-[10px] font-semibold text-slate-400">이 과목의 오답에 붙인 태그가 아직 없어요.</p>
          )}
          <p className="mt-2 text-[10px] font-semibold text-slate-400 break-keep">약점 통계는 오답에 붙인 태그를 기준으로 집계해요.</p>
        </div>
      )}

      {tagFilter ? (
        // 태그 필터 뷰 — 과목·자료 라벨을 병기한 자료 횡단 모아보기(읽기 전용).
        filteredNotes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-8 text-center">
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">이 태그가 달린 오답이 없어요.</p>
            <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-400">전체 보기로 돌아가 오답을 기록해 보세요.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filteredNotes.map(({ target, note }) => {
              const url = note.imagePath ? signedUrls[note.imagePath] : undefined;
              return (
                <li key={`${target.id}-${note.id}`} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] p-3.5 shadow-sm">
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: getMaterialColor(target.colorSource) }}>
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getMaterialColor(target.colorSource) }} />
                    <span className="truncate">{target.subjectName || '과목'} · {target.title}</span>
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
                      <WrongNoteBody note={note} />
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
      ) : materials.length === 0 && offLectures.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-8 text-center">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300">등록된 자료가 없어요.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-400">교재나 인강이 추가되면 여기에서 오답을 기록할 수 있어요.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {materials.map((target) => (
              <MaterialNotesCard
                key={target.id}
                target={target}
                notes={notesOf(target.id)}
                customTags={customTagsBySubject[target.subjectId] || []}
                signedUrls={signedUrls}
                onOpenAdd={setAddTarget}
                onPatchNote={patchNote}
                onRemoveNote={removeNoteLocal}
                onToggleLectureUse={toggleLectureNotes}
              />
            ))}
          </div>

          {/* 인강 오답노트 켜기 (#6) — 아직 안 켠 인강 목록 */}
          {offLectures.length > 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 p-3.5">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <MonitorPlay className="h-3 w-3" /> 인강 오답노트
              </p>
              <p className="mt-1 text-[10px] font-semibold text-slate-400 break-keep">
                인강도 오답노트를 켜면 위 목록에 카드가 생겨요. 언제든 다시 끌 수 있어요.
              </p>
              <ul className="mt-2 space-y-1.5">
                {offLectures.map(({ subjectName, lecture }) => (
                  <li key={lecture.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-200">{lecture.name}</span>
                      <span className="block text-[10px] font-semibold text-slate-400">{subjectName || '과목'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void enableLecture(lecture.id)}
                      disabled={!!enablingLectureId}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#0071E3] px-2.5 py-1.5 text-[10px] font-black text-white transition hover:bg-[#0060c0] active:scale-95 disabled:opacity-40"
                    >
                      {enablingLectureId === lecture.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      오답노트 켜기
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 오답 추가 슬라이드 시트 (#13) */}
      {addTarget && (
        <AnimatedOverlay
          onClose={() => setAddTarget(null)}
          align="bottom"
          ariaLabel="오답 추가"
          closeOnEscape
          lockScroll
          backdropClassName="no-print fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
          panelClassName="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl sm:rounded-3xl"
        >
          {(requestClose) => (
            <AddNoteSheet
              target={addTarget}
              customTags={customTagsBySubject[addTarget.subjectId] || []}
              requestClose={requestClose}
              onAdded={appendNote}
              onUploadedUrl={mergeUrl}
              onCreateTag={(tag) => mutateCustomTag(addTarget.subjectId, 'add', tag)}
              onRemoveTag={(tag) => mutateCustomTag(addTarget.subjectId, 'remove', tag)}
              onRenameTag={(tag, newTag) => mutateCustomTag(addTarget.subjectId, 'rename', tag, newTag)}
            />
          )}
        </AnimatedOverlay>
      )}
    </section>
  );
}
