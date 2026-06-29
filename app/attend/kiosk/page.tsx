'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Delete,
  Hash,
  Loader2,
  LogOut,
  RotateCcw,
  ScanLine,
  UserRound,
} from 'lucide-react';

type SubmitState = 'idle' | 'submitting' | 'done' | 'error';
type Match = { id: string; name: string; campus: string };

const campusLabels: Record<string, string> = {
  wonju: '원주',
  chuncheon: '춘천',
  chungju: '충주',
  etc: '기타',
};

function formatMinutes(minutes?: number | null) {
  if (minutes == null) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours > 0 ? `${hours}시간 ` : ''}${mins}분`;
}

function enrollmentText(daysLeft: number) {
  if (daysLeft < 0) return '등록 기간 만료 · 재등록 문의';
  if (daysLeft === 0) return '오늘이 등록 마지막 날 · 재등록 문의';
  return `등록 종료 D-${daysLeft} · 재등록 문의`;
}

function nowLabelKST() {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

const AUTO_RESET_SEC = 6;

export default function AttendKioskPage() {
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [tokenError, setTokenError] = useState('');

  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<'check-in' | 'check-out' | 'outing' | 'return' | null>(null);
  const [selectedAction, setSelectedAction] = useState<'check-in' | 'check-out' | 'outing' | 'return'>('check-in');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [enrollmentDaysLeft, setEnrollmentDaysLeft] = useState<number | null>(null);
  const [gradeReminder, setGradeReminder] = useState(false);
  const [doneTime, setDoneTime] = useState('');
  const [autoResetIn, setAutoResetIn] = useState<number | null>(null);
  const [clock, setClock] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);

  // 헤더 라이브 시계 (KST)
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date())
      );
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    const kioskKey = new URLSearchParams(window.location.search).get('key') || '';
    const tokenEndpoint = kioskKey
      ? `/api/attend/token?key=${encodeURIComponent(kioskKey)}`
      : '/api/attend/token';

    const fetchToken = async () => {
      try {
        const response = await fetch(tokenEndpoint, { cache: 'no-store' });
        const json = await response.json();
        if (!active) return;

        if (response.ok && json.success) {
          setToken(json.token);
          setUrl(`${window.location.origin}/attend?token=${encodeURIComponent(json.token)}`);
          setTokenError('');
        } else {
          setTokenError(json.message || '키오스크 권한이 필요합니다.');
        }
      } catch {
        if (active) setTokenError('네트워크 오류로 출결 토큰을 갱신하지 못했습니다.');
      }
    };

    fetchToken();
    const timer = setInterval(fetchToken, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const keypad = useMemo(() => ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'], []);

  const resetPhoneFlow = () => {
    setPhone('');
    setMatches([]);
    setSubmitState('idle');
    setMessage('');
    setAction(null);
    setMinutes(null);
    setEnrollmentDaysLeft(null);
    setGradeReminder(false);
    setDoneTime('');
    setAutoResetIn(null);
    setShowKeypad(false);
  };

  // 완료 화면 자동 초기화 카운트다운 (입구 키오스크 회전율 ↑)
  useEffect(() => {
    if (submitState !== 'done' || autoResetIn == null) return;
    const t = setTimeout(() => {
      if (autoResetIn <= 1) resetPhoneFlow();
      else setAutoResetIn(autoResetIn - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [submitState, autoResetIn]);

  const pressKey = (key: string) => {
    if (submitState === 'submitting') return;
    if (key === 'clear') {
      resetPhoneFlow();
      return;
    }
    if (key === 'back') {
      setPhone((value) => value.slice(0, -1));
      setMatches([]);
      setSubmitState('idle');
      setMessage('');
      return;
    }
    setPhone((value) => (value.length >= 11 ? value : `${value}${key}`));
    setMatches([]);
    setSubmitState('idle');
    setMessage('');
  };

  const submitPhone = async (selectedStudentId?: string, actionToUse?: 'check-in' | 'check-out' | 'outing' | 'return') => {
    if (!token) {
      setSubmitState('error');
      setMessage('출결 토큰을 불러오는 중입니다.');
      return;
    }

    const currentAction = actionToUse || selectedAction;
    setSubmitState('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/attend/by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone, studentId: selectedStudentId, action: currentAction }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitState('error');
        setMessage(json.message || '번호 출결 처리에 실패했습니다.');
        return;
      }

      if (json.needsSelection) {
        setMatches(json.matches || []);
        setSubmitState('idle');
        return;
      }

      setMatches([]);
      setAction(json.action);
      setMinutes(json.minutes ?? null);
      setEnrollmentDaysLeft(json.enrollmentDaysLeft ?? null);
      setGradeReminder(Boolean(json.gradeReminder));
      setDoneTime(nowLabelKST());
      setMessage(json.studentName ? `${json.studentName} 학생` : '처리되었습니다.');
      setSubmitState('done');
      setAutoResetIn(AUTO_RESET_SEC);
    } catch {
      setSubmitState('error');
      setMessage('네트워크 오류가 발생했습니다.');
    }
  };

  const showResult = submitState === 'done' || submitState === 'error' || matches.length > 0;

  return (
    <main className="min-h-screen bg-[#111827] text-white font-sans flex items-center justify-center p-4">
      <div className="mx-auto flex w-full max-w-[420px] flex-col py-8 md:py-12 gap-8">
        <header className="text-center">
          <p className="text-[11px] font-bold tracking-[0.3em] text-slate-400">SSC SPARTA</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">등하원 체크</h1>
          {clock && <p className="mt-1 text-xs font-semibold text-slate-500">{clock}</p>}
        </header>

        <section className="w-full">
          <div className="w-full transition-all duration-300">
            {!showResult ? (
              !showKeypad ? (
                /* ── QR 메인 카드 ── */
                <div className="rounded-[28px] bg-slate-900 border border-white/10 p-6 text-white shadow-2xl flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex flex-col items-center gap-2">
                    <span className="relative flex size-2.5 mb-1">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                    </span>
                    <p className="text-base font-black text-white">휴대폰으로 스캔해서 체크</p>
                    <p className="text-xs font-semibold text-slate-400">카메라로 QR을 스캔하면 바로 등·하원됩니다</p>
                  </div>

                  <div className="grid size-[220px] place-items-center rounded-2xl bg-white p-4 shadow-lg">
                    {tokenError ? (
                      <div className="flex flex-col items-center gap-2 text-center">
                        <ScanLine className="size-10 text-red-400" />
                        <p className="text-xs text-red-500 font-semibold leading-4">{tokenError}</p>
                      </div>
                    ) : url ? (
                      <QRCodeSVG value={url} size={188} level="M" includeMargin={false} />
                    ) : (
                      <Loader2 className="size-8 animate-spin text-slate-400" />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowKeypad(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.06] border border-white/10 h-12 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
                  >
                    <Hash className="size-4" />
                    휴대폰이 없다면 번호로 체크
                  </button>
                </div>
              ) : (
                /* ── 번호 키패드 카드 ── */
                <div className="rounded-[28px] bg-white p-5 text-slate-950 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between px-1 pb-3">
                    <button
                      type="button"
                      onClick={() => { resetPhoneFlow(); }}
                      className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700 transition"
                    >
                      <ArrowLeft className="size-3.5" />
                      QR로 돌아가기
                    </button>
                    <p className="text-xs font-bold text-slate-400">전화번호 끝 4자리</p>
                  </div>
                  <div className="flex h-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl font-black tracking-[0.18em]">
                    {phone
                      ? phone
                      : <span className="text-base font-bold tracking-normal text-slate-300">끝 4자리를 입력하세요</span>}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {keypad.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => pressKey(key)}
                        className="grid aspect-[1.35] place-items-center rounded-2xl bg-slate-100 text-2xl font-black transition hover:bg-slate-200 active:scale-[0.98]"
                      >
                        {key === 'clear' ? (
                          <RotateCcw className="size-6" />
                        ) : key === 'back' ? (
                          <Delete className="size-6" />
                        ) : (
                          key
                        )}
                      </button>
                    ))}
                  </div>

                  {submitState === 'submitting' ? (
                    <button
                      type="button"
                      disabled
                      className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-slate-700 text-base font-black text-white transition"
                    >
                      <Loader2 className="animate-spin size-6" />
                    </button>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAction('check-in');
                          submitPhone(undefined, 'check-in');
                        }}
                        disabled={phone.length < 4}
                        className="flex h-14 items-center justify-center rounded-2xl bg-emerald-600 text-base font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98]"
                      >
                        등원
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAction('check-out');
                          submitPhone(undefined, 'check-out');
                        }}
                        disabled={phone.length < 4}
                        className="flex h-14 items-center justify-center rounded-2xl bg-sky-600 text-base font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98]"
                      >
                        하원
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAction('outing');
                          submitPhone(undefined, 'outing');
                        }}
                        disabled={phone.length < 4}
                        className="flex h-14 items-center justify-center rounded-2xl bg-amber-600 text-base font-black text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98]"
                      >
                        외출
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAction('return');
                          submitPhone(undefined, 'return');
                        }}
                        disabled={phone.length < 4}
                        className="flex h-14 items-center justify-center rounded-2xl bg-blue-600 text-base font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 active:scale-[0.98]"
                      >
                        복귀
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="min-h-[480px] rounded-[24px] bg-slate-900 border border-white/10 p-6 text-white shadow-2xl flex flex-col justify-center animate-in fade-in zoom-in-95 duration-300">
                {submitState === 'done' ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <span
                      className={`mb-4 grid size-20 place-items-center rounded-full ${
                        action === 'check-in' ? 'bg-emerald-500/10 text-emerald-400' :
                        action === 'return' ? 'bg-blue-500/10 text-blue-400' :
                        action === 'check-out' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {action === 'check-out' || action === 'outing' ? (
                        <LogOut className={`size-10 ${action === 'outing' ? 'text-amber-400' : 'text-sky-400'}`} />
                      ) : (
                        <CheckCircle2 className={`size-10 ${action === 'return' ? 'text-blue-400' : 'text-emerald-400'}`} />
                      )}
                    </span>
                    <h2 className="text-2xl font-black tracking-tight">
                      {action === 'check-in' && '등원 완료'}
                      {action === 'return' && '복귀 완료'}
                      {action === 'check-out' && '하원 완료'}
                      {action === 'outing' && '외출 완료'}
                    </h2>
                    <p className="mt-1.5 text-base font-bold text-slate-200">{message}</p>

                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-bold">
                      <span className="text-slate-400">
                        {action === 'check-in' && '등원'}
                        {action === 'return' && '복귀'}
                        {action === 'check-out' && '하원'}
                        {action === 'outing' && '외출'}
                      </span>
                      <span className="text-white">{doneTime}</span>
                      {(action === 'check-out' || action === 'outing') && minutes != null && (
                        <>
                          <span className="text-slate-500">·</span>
                          <span className="text-white">체류 {formatMinutes(minutes)}</span>
                        </>
                      )}
                    </div>

                    {(enrollmentDaysLeft != null || gradeReminder) && (
                      <div className="mt-4 w-full max-w-xs space-y-2">
                        {enrollmentDaysLeft != null && (
                          <div className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold bg-white/5 border border-white/10 ${enrollmentDaysLeft < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                            <CalendarClock className="size-4 shrink-0" />
                            {enrollmentText(enrollmentDaysLeft)}
                          </div>
                        )}
                        {gradeReminder && (
                          <div className="flex items-center justify-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2.5 text-sm font-bold text-sky-400">
                            <ClipboardList className="size-4 shrink-0" />
                            이번 주 성적 미입력 · 선생님께 전달
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={resetPhoneFlow}
                      className="mt-6 h-12 rounded-xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-slate-100 active:scale-[0.98]"
                    >
                      다음 학생{autoResetIn != null ? ` (${autoResetIn})` : ''}
                    </button>
                  </div>
                ) : submitState === 'error' ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <AlertCircle className="mb-4 size-12 text-red-400" />
                    <h2 className="text-xl font-black">처리 실패</h2>
                    <p className="mt-2 max-w-sm text-sm font-semibold text-slate-300">{message}</p>
                    <button
                      type="button"
                      onClick={resetPhoneFlow}
                      className="mt-6 h-12 rounded-xl bg-white/10 border border-white/10 px-6 text-sm font-black text-white transition hover:bg-white/20 active:scale-[0.98]"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : matches.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-black text-white px-1">학생 선택</h2>
                    <p className="text-xs text-slate-400 px-1 mt-1">동일한 번호의 학생이 여러 명 있습니다.</p>
                    <div className="mt-4 grid gap-2 max-h-[300px] overflow-y-auto pr-1">
                      {matches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => submitPhone(match.id, selectedAction)}
                          className="flex h-16 items-center justify-between rounded-xl bg-white/[0.06] border border-white/5 hover:border-white/15 px-4 text-left text-white transition hover:bg-white/10 active:scale-[0.99]"
                        >
                          <span className="flex items-center gap-3">
                            <UserRound className="size-5 text-slate-400" />
                            <span>
                              <span className="block text-base font-black">{match.name}</span>
                              <span className="block text-xs font-bold text-slate-400">
                                {campusLabels[match.campus] || match.campus || '캠퍼스 미지정'}
                              </span>
                            </span>
                          </span>
                          <span className="text-sm font-black text-emerald-400">선택</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={resetPhoneFlow}
                      className="mt-4 h-12 w-full rounded-xl bg-white/5 border border-white/10 text-sm font-black text-white transition hover:bg-white/10 active:scale-[0.98]"
                    >
                      취소
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
