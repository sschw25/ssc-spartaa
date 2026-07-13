'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageIcon, NotebookPen, Sparkles, X } from 'lucide-react';
import { AnimatedOverlay } from '@/components/ui/animated-overlay';
import { Student, WrongNote } from '@/lib/types/student';

// 1일 1문제 — 오답노트를 쓰는 학생에게 홈 진입 시 하루 1회, 본인 오답 중 랜덤 1개를
// "오늘의 복습 문제"로 보여주는 시트. 노트가 0개면 절대 뜨지 않는다.
// 하루 1회 판정은 localStorage(자정 리셋, 서버 저장 없음), 과목 선택도 localStorage 에 기억.
const SHOWN_KEY_PREFIX = 'ssc-daily-quiz-shown-';
const SUBJECT_KEY = 'ssc-daily-quiz-subject';

// 기본 오답 사유 태그 라벨(오답노트 탭과 동일 매핑). 커스텀 태그는 문자열 그대로 표시.
const TAG_LABEL: Record<string, string> = {
  calculation_error: '연산',
  time_limit: '시간',
  misread_condition: '오독',
  concept_leak: '개념',
};

// 오답노트 탭의 판정과 동일한 KST 날짜 키
const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

interface QuizEntry {
  subjectId: string;
  subjectName: string;
  bookTitle: string;
  note: WrongNote;
}

interface DailyWrongQuizProps {
  student: Student;
  activeTab: string;
  // "오답노트에서 보기" — 오답노트 탭(?tab=wrong-note)으로 이동
  onOpenWrongNote: () => void;
}

export function DailyWrongQuiz({ student, activeTab, onOpenWrongNote }: DailyWrongQuizProps) {
  // 전체 오답 풀 — 과목/교재 라벨 병기
  const pool = useMemo<QuizEntry[]>(
    () =>
      (student.subjects || []).flatMap((sub) =>
        (sub.books || []).flatMap((book) =>
          (book.wrongNotes || []).map((note) => ({
            subjectId: sub.id,
            subjectName: sub.name || '과목',
            bookTitle: book.title,
            note,
          })),
        ),
      ),
    [student.subjects],
  );

  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    pool.forEach((e) => { if (!seen.has(e.subjectId)) seen.set(e.subjectId, e.subjectName); });
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [pool]);

  const [open, setOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [pick, setPick] = useState<QuizEntry | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const pickRandom = useCallback((entries: QuizEntry[], subjectId: string): QuizEntry | null => {
    const candidates = subjectId ? entries.filter((e) => e.subjectId === subjectId) : entries;
    const list = candidates.length > 0 ? candidates : entries; // 선택 과목에 노트가 없으면 전체에서
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }, []);

  // 홈 탭 진입 시 하루 1회 노출. 노트 0개면 절대 안 뜬다.
  useEffect(() => {
    if (activeTab !== 'report-overview' || pool.length === 0 || open) return;
    const shownKey = `${SHOWN_KEY_PREFIX}${kstToday()}`;
    let shown = '';
    try { shown = localStorage.getItem(shownKey) || ''; } catch { return; }
    if (shown) return;
    // 홈 초기 렌더와 겹치지 않게 잠깐 숨 고른 뒤 연다.
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(shownKey, '1'); } catch {}
      let saved = '';
      try { saved = localStorage.getItem(SUBJECT_KEY) || ''; } catch {}
      const effective = subjects.some((s) => s.id === saved) ? saved : '';
      setSubjectFilter(effective);
      setPick(pickRandom(pool, effective));
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeTab, pool, subjects, open, pickRandom]);

  // 사진 노트면 서명 URL 조회(기존 wrong-note GET 재사용, 열려 있는 동안 1회).
  const needImage = open && !!pick?.note.imagePath && !signedUrls[pick.note.imagePath!];
  useEffect(() => {
    if (!needImage) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/student/wrong-note', { credentials: 'same-origin' });
        const json = await res.json();
        if (alive && res.ok && json.success && json.urls) setSignedUrls((prev) => ({ ...prev, ...json.urls }));
      } catch { /* 이미지는 실패해도 플레이스홀더로 표시 */ }
    })();
    return () => { alive = false; };
  }, [needImage]);

  const changeSubject = (subjectId: string) => {
    setSubjectFilter(subjectId);
    try { localStorage.setItem(SUBJECT_KEY, subjectId); } catch {}
    setPick(pickRandom(pool, subjectId));
  };

  if (!open || !pick) return null;

  const imageUrl = pick.note.imagePath ? signedUrls[pick.note.imagePath] : undefined;

  return (
    <AnimatedOverlay
      onClose={() => setOpen(false)}
      align="bottom"
      ariaLabel="오늘의 복습 문제"
      closeOnEscape
      backdropClassName="no-print fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center"
      panelClassName="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-[#1c1c1e] shadow-2xl sm:rounded-3xl"
    >
      {(requestClose) => (
        <>
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-white/10 px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#0071E3]">
                <Sparkles className="h-3 w-3" /> 오늘의 복습 문제
              </p>
              <h4 className="mt-0.5 text-base font-black text-slate-900 dark:text-slate-100">틀렸던 문제, 다시 풀어 볼까요?</h4>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400 break-keep">내 오답노트에서 하루 한 문제씩 골라 드려요.</p>
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
            {/* 과목 필터 — 선택은 다음에도 기억돼요 */}
            {subjects.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => changeSubject('')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
                    subjectFilter === ''
                      ? 'bg-[#0071E3] text-white'
                      : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  전체
                </button>
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => changeSubject(s.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black transition active:scale-95 ${
                      subjectFilter === s.id
                        ? 'bg-[#0071E3] text-white'
                        : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {/* 문제 카드 */}
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3.5">
              <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">
                {pick.subjectName} · {pick.bookTitle}
              </p>
              {pick.note.imagePath && (
                imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="오답 사진" className="mt-2 max-h-64 w-full rounded-xl object-contain" />
                ) : (
                  <span className="mt-2 grid h-32 w-full place-items-center rounded-xl bg-slate-100 dark:bg-white/10 text-slate-400">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )
              )}
              {pick.note.text && (
                <p className="mt-2 whitespace-pre-wrap break-keep text-sm font-semibold text-slate-800 dark:text-slate-100">{pick.note.text}</p>
              )}
              {pick.note.tags && pick.note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {pick.note.tags.map((k) => (
                    <span key={k} className="rounded-md bg-white dark:bg-[#1c1c1e] px-1.5 py-0.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                      {TAG_LABEL[k] || k}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] font-semibold text-slate-400 break-keep">
              답을 떠올려 본 뒤, 오답노트에서 내가 적어 둔 내용과 비교해 보세요.
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 dark:border-white/10 px-5 py-3.5">
            <button
              type="button"
              onClick={requestClose}
              className="flex-1 rounded-2xl bg-slate-100 dark:bg-white/10 px-4 py-2.5 text-xs font-black text-slate-500 dark:text-slate-400 transition active:scale-[0.98]"
            >
              오늘은 여기까지
            </button>
            <button
              type="button"
              onClick={() => { requestClose(); onOpenWrongNote(); }}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-2xl bg-[#0071E3] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#0060c0] active:scale-[0.98]"
            >
              <NotebookPen className="h-3.5 w-3.5" /> 오답노트에서 보기
            </button>
          </div>
        </>
      )}
    </AnimatedOverlay>
  );
}
