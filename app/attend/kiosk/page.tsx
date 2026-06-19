'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Delete,
  Loader2,
  LogOut,
  Phone,
  RotateCcw,
  ScanLine,
  UserRound,
} from 'lucide-react';

type Mode = 'qr' | 'phone';
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
  const [mode, setMode] = useState<Mode>('qr');
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(0);

  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<'check-in' | 'check-out' | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [enrollmentDaysLeft, setEnrollmentDaysLeft] = useState<number | null>(null);
  const [gradeReminder, setGradeReminder] = useState(false);
  const [doneTime, setDoneTime] = useState('');
  const [autoResetIn, setAutoResetIn] = useState<number | null>(null);
  const [clock, setClock] = useState('');

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
          setRefreshedAt(Date.now());
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

  // 완료 화면 자동 초기화 카운트다운 (입구 키오스크 회전율 ↑)
  useEffect(() => {
    if (submitState !== 'done') return;
    if (autoResetIn == null) return;
    if (autoResetIn <= 0) {
      resetPhoneFlow();
      return;
    }
    const t = setTimeout(() => setAutoResetIn((n) => (n == null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [submitState, autoResetIn]);

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
  };

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

  const submitPhone = async (selectedStudentId?: string) => {
    if (!token) {
      setSubmitState('error');
      setMessage('출결 토큰을 불러오는 중입니다.');
      return;
    }

    setSubmitState('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/attend/by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone, studentId: selectedStudentId }),
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

  return (
    <main className="min-h-screen bg-[#111827] text-white font-sans">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.3em] text-slate-400">SSC SPARTA</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">등하원 체크</h1>
            {clock && <p className="mt-1 text-xs font-semibold text-slate-500">{clock}</p>}
          </div>
          <div className="relative inline-flex rounded-full bg-white/[0.07] p-1 ring-1 ring-white/10">
            {([
              { key: 'qr' as const, label: 'QR', Icon: ScanLine },
              { key: 'phone' as const, label: '번호', Icon: Phone },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition ${
                  mode === key ? 'bg-white text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,0.25)]' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </header>

        <section className="grid flex-1 place-items-center py-8">
          {mode === 'qr' ? (
            <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-[auto_1fr]">
              {/* QR + 스캐너 프레임 */}
              <div className="mx-auto w-full max-w-[360px] text-center">
                <div className="relative mx-auto aspect-square w-full max-w-[360px]">
                  <div className="grid h-full w-full place-items-center rounded-[28px] bg-white p-9 shadow-2xl">
                    {tokenError ? (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-red-600">
                        {tokenError}
                      </div>
                    ) : url ? (
                      <QRCodeSVG value={url} size={272} level="M" includeMargin={false} />
                    ) : (
                      <Loader2 className="size-10 animate-spin text-slate-400" />
                    )}
                  </div>
                  {/* 코너 브래킷 (스캐너 타겟 느낌) */}
                  {!tokenError && (
                    <>
                      <span className="pointer-events-none absolute left-2 top-2 size-9 rounded-tl-2xl border-l-4 border-t-4 border-[#0071E3]" />
                      <span className="pointer-events-none absolute right-2 top-2 size-9 rounded-tr-2xl border-r-4 border-t-4 border-[#0071E3]" />
                      <span className="pointer-events-none absolute bottom-2 left-2 size-9 rounded-bl-2xl border-b-4 border-l-4 border-[#0071E3]" />
                      <span className="pointer-events-none absolute bottom-2 right-2 size-9 rounded-br-2xl border-b-4 border-r-4 border-[#0071E3]" />
                    </>
                  )}
                </div>

                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                  </span>
                  실시간 자동 갱신{refreshedAt ? ` · ${new Date(refreshedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
                </div>
              </div>

              {/* 학생 안내 (3단계) */}
              <div className="mx-auto w-full max-w-sm text-left">
                <h2 className="text-2xl font-black tracking-tight">휴대폰으로 스캔하세요</h2>
                <p className="mt-1.5 text-sm font-medium text-slate-400">카메라를 QR에 비추면 등·하원이 처리됩니다.</p>
                <ol className="mt-6 space-y-3">
                  {[
                    { t: '카메라로 QR 스캔', d: '휴대폰 기본 카메라를 QR에 비춰 주세요.' },
                    { t: '본인 로그인', d: '처음 한 번만 학생 본인 확인이 필요해요.' },
                    { t: '등·하원 자동 처리', d: '등원/하원이 한 번에 토글되고 순공 시간이 측정돼요.' },
                  ].map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#0071E3] text-sm font-black text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">{s.t}</p>
                        <p className="text-xs leading-5 text-slate-400">{s.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 flex items-start gap-2 rounded-2xl bg-white/[0.05] px-3.5 py-3 ring-1 ring-white/10">
                  <ScanLine className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p className="text-[11px] leading-5 text-slate-400">
                    QR은 보안을 위해 수 초마다 자동 갱신됩니다. 캡처한 화면으로는 출결되지 않으니 현장에서 스캔해 주세요.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid w-full max-w-4xl gap-5 lg:grid-cols-[380px_1fr]">
              <div className="rounded-[24px] bg-white p-5 text-slate-950 shadow-2xl">
                <div className="flex h-16 items-center justify-center rounded-xl bg-slate-100 text-3xl font-black tracking-[0.18em]">
                  {phone || '----'}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {keypad.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => pressKey(key)}
                      className="grid aspect-[1.35] place-items-center rounded-xl bg-slate-100 text-2xl font-black transition hover:bg-slate-200 active:scale-[0.98]"
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

                <button
                  type="button"
                  onClick={() => submitPhone()}
                  disabled={phone.length < 4 || submitState === 'submitting'}
                  className="mt-4 h-14 w-full rounded-xl bg-[#0071E3] text-base font-black text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitState === 'submitting' ? (
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  ) : (
                    '확인'
                  )}
                </button>
              </div>

              <div className="min-h-[360px] rounded-[24px] bg-white/10 p-5">
                {submitState === 'done' ? (
                  <div className="flex h-full flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
                    <span
                      className={`mb-4 grid size-24 place-items-center rounded-full ${action === 'check-out' ? 'bg-sky-400/15' : 'bg-emerald-400/15'}`}
                    >
                      {action === 'check-out' ? (
                        <LogOut className="size-12 text-sky-300 animate-in zoom-in-50 duration-700" />
                      ) : (
                        <CheckCircle2 className="size-12 text-emerald-300 animate-in zoom-in-50 duration-700" />
                      )}
                    </span>
                    <h2 className="text-3xl font-black tracking-tight">
                      {action === 'check-out' ? '하원 완료' : '등원 완료'}
                    </h2>
                    <p className="mt-1.5 text-base font-bold text-slate-200">{message}</p>

                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-bold">
                      <span className="text-slate-400">{action === 'check-out' ? '하원' : '등원'}</span>
                      <span className="text-white">{doneTime}</span>
                      {action === 'check-out' && minutes != null && (
                        <>
                          <span className="text-slate-500">·</span>
                          <span className="text-white">체류 {formatMinutes(minutes)}</span>
                        </>
                      )}
                    </div>

                    {(enrollmentDaysLeft != null || gradeReminder) && (
                      <div className="mt-4 w-full max-w-xs space-y-2">
                        {enrollmentDaysLeft != null && (
                          <div className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${enrollmentDaysLeft < 0 ? 'bg-red-500/20 text-red-200' : 'bg-amber-500/20 text-amber-100'}`}>
                            <CalendarClock className="size-4 shrink-0" />
                            {enrollmentText(enrollmentDaysLeft)}
                          </div>
                        )}
                        {gradeReminder && (
                          <div className="flex items-center justify-center gap-2 rounded-xl bg-sky-500/20 px-3 py-2.5 text-sm font-bold text-sky-100">
                            <ClipboardList className="size-4 shrink-0" />
                            이번 주 성적 미입력 · 선생님께 전달
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={resetPhoneFlow}
                      className="mt-6 h-12 rounded-xl bg-white px-6 text-sm font-black text-slate-950 transition active:scale-[0.98]"
                    >
                      다음 학생{autoResetIn != null ? ` (${autoResetIn})` : ''}
                    </button>
                  </div>
                ) : submitState === 'error' ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <AlertCircle className="mb-4 size-12 text-red-300" />
                    <h2 className="text-xl font-black">처리 실패</h2>
                    <p className="mt-2 max-w-sm text-sm font-semibold text-slate-300">{message}</p>
                  </div>
                ) : matches.length > 0 ? (
                  <div>
                    <h2 className="text-lg font-black">학생 선택</h2>
                    <div className="mt-4 grid gap-2">
                      {matches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => submitPhone(match.id)}
                          className="flex h-16 items-center justify-between rounded-xl bg-white px-4 text-left text-slate-950 transition hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-3">
                            <UserRound className="size-5 text-slate-500" />
                            <span>
                              <span className="block text-base font-black">{match.name}</span>
                              <span className="block text-xs font-bold text-slate-500">
                                {campusLabels[match.campus] || match.campus || '캠퍼스 미지정'}
                              </span>
                            </span>
                          </span>
                          <span className="text-sm font-black text-[#0071E3]">선택</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Phone className="mb-4 size-12 text-slate-400" />
                    <h2 className="text-xl font-black">전화번호 끝 4자리</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-400">동명이거나 번호가 겹치면 학생을 선택합니다.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
