'use client';

import React from 'react';
import type { WrongNote } from '@/lib/types/student';

// 오답노트 경량 서식 마크업 — **볼드**, __밑줄__, {red:…}/{blue:…}/{mark:…}(강조 빨강/파랑/형광) 3색.
// HTML 을 저장하거나 dangerouslySetInnerHTML 로 주입하지 않고, 화이트리스트 파서가 React 노드만 만든다(XSS 차단).
// 학생 입력·관리자 검토 화면이 같은 렌더러를 쓴다.
const TOKEN_RE = /\*\*([^*]+?)\*\*|__([^_]+?)__|\{(red|blue|mark):([^{}]*?)\}/;

const COLOR_CLS: Record<string, string> = {
  red: 'font-bold text-red-600 dark:text-red-400',
  blue: 'font-bold text-[#0071E3]',
  mark: 'rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-400/25',
};

export function renderWrongNoteMarkup(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const m = rest.match(TOKEN_RE);
    if (!m || m.index === undefined) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={key++} className="font-black">{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      out.push(<u key={key++} className="underline underline-offset-2">{m[2]}</u>);
    } else if (m[3]) {
      out.push(<span key={key++} className={COLOR_CLS[m[3]] || ''}>{m[4] ?? ''}</span>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// 오답 본문 공용 렌더 — 신규 2칸(question/answer)은 라벨 블록으로, 레거시 단일 text 는 문단 그대로.
// className 으로 톤(학생/관리자)을 맞춘다.
export function WrongNoteBody({ note, className = '' }: { note: WrongNote; className?: string }) {
  const hasStructured = Boolean(note.question || note.answer);
  if (!hasStructured && !note.text) return null;
  if (!hasStructured) {
    return (
      <p className={`whitespace-pre-wrap break-keep text-xs font-semibold text-slate-800 dark:text-slate-100 ${className}`}>
        {renderWrongNoteMarkup(note.text || '')}
      </p>
    );
  }
  return (
    <div className={`space-y-1.5 ${className}`}>
      {note.question && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">문제</p>
          <p className="mt-0.5 whitespace-pre-wrap break-keep text-xs font-semibold text-slate-800 dark:text-slate-100">
            {renderWrongNoteMarkup(note.question)}
          </p>
        </div>
      )}
      {note.answer && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500/80 dark:text-emerald-400/80">정답 · 풀이</p>
          <p className="mt-0.5 whitespace-pre-wrap break-keep text-xs font-semibold text-slate-800 dark:text-slate-100">
            {renderWrongNoteMarkup(note.answer)}
          </p>
        </div>
      )}
    </div>
  );
}
