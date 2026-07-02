'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Loader2, LogIn, LogOut, Coffee } from 'lucide-react';

type Phase = 'loading' | 'need-login' | 'select-action' | 'processing' | 'checked-in' | 'checked-out' | 'outing' | 'return' | 'error';

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function nowLabelKST() {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

function enrollmentText(daysLeft: number) {
  if (daysLeft < 0) return '등록 기간이 만료되었어요. 재등록을 문의해 주세요.';
  if (daysLeft === 0) return '오늘이 등록 마지막 날이에요. 재등록을 문의해 주세요.';
  return `등록 종료까지 D-${daysLeft} · 재등록을 문의해 주세요.`;
}

function AttendNotices({ enrollmentDaysLeft, gradeReminder }: { enrollmentDaysLeft: number | null; gradeReminder: boolean }) {
  if (enrollmentDaysLeft == null && !gradeReminder) return null;
  const expired = enrollmentDaysLeft != null && enrollmentDaysLeft < 0;
  return (
    <div className="mt-6 space-y-2 text-left">
      {enrollmentDaysLeft != null && (
        <div className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${expired ? 'bg-red-50' : 'bg-amber-50'}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <CalendarClock className="size-4" />
          </span>
          <p className={`text-xs font-semibold leading-5 ${expired ? 'text-red-700' : 'text-amber-800'}`}>{enrollmentText(enrollmentDaysLeft)}</p>
        </div>
      )}
      {gradeReminder && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#EEF4FF] px-3.5 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#DCE7FF] text-[#1D4ED8]">
            <ClipboardList className="size-4" />
          </span>
          <p className="text-xs font-semibold leading-5 text-[#1D4ED8]">이번 주 성적이 아직 등록되지 않았어요. 담당 선생님께 성적을 전달해 주세요.</p>
        </div>
      )}
    </div>
  );
}

function AttendInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [studentName, setStudentName] = useState('');
  const [timeLabel, setTimeLabel] = useState('');
  const [enrollmentDaysLeft, setEnrollmentDaysLeft] = useState<number | null>(null);
  const [gradeReminder, setGradeReminder] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const me = await fetch('/api/attend', { cache: 'no-store' });
        if (!active) return;

        if (me.status === 401) {
          setPhase('need-login');
          return;
        }

        const json = await me.json();
        if (json.success) {
          setStudentName(json.studentName || '');
          setCheckedIn(json.checkedIn ?? false);
          setPhase('select-action');
        } else {
          setMessage(json.message || '학생 상태 조회 실패');
          setPhase('error');
        }
      } catch {
        if (active) {
          setMessage('네트워크 오류가 발생했습니다.');
          setPhase('error');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const submitAction = async (actionType: 'check-in' | 'check-out' | 'outing' | 'return') => {
    setPhase('processing');
    try {
      const response = await fetch('/api/attend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: actionType }),
      });
      const json = await response.json();

      if (response.ok && json.success) {
        setStudentName(json.studentName || '');
        setTimeLabel(nowLabelKST());
        setEnrollmentDaysLeft(json.enrollmentDaysLeft ?? null);
        setGradeReminder(Boolean(json.gradeReminder));
        
        if (json.action === 'check-in') {
          setPhase('checked-in');
        } else if (json.action === 'check-out') {
          setMinutes(json.minutes ?? null);
          setPhase('checked-out');
        } else if (json.action === 'outing') {
          setMinutes(json.minutes ?? null);
          setPhase('outing');
        } else if (json.action === 'return') {
          setPhase('return');
        }
      } else {
        setMessage(json.message || '출결 처리에 실패했습니다.');
        setPhase('error');
      }
    } catch {
      setMessage('네트워크 오류가 발생했습니다.');
      setPhase('error');
    }
  };

  // 등원/복귀 완료 시 2초 후 자동으로 학생 홈으로 이동
  useEffect(() => {
    if (phase === 'checked-in' || phase === 'return') {
      const timer = setTimeout(() => {
        router.replace('/student');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, router]);

  const loginHref = `/student/login?next=${encodeURIComponent(`/attend?token=${token}`)}`;
  const isResult = ['checked-in', 'checked-out', 'outing', 'return'].includes(phase);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#F5F5F7] to-[#ECEEF1] p-6 font-sans text-[#1D1D1F]">
      <div className="w-full max-w-sm rounded-[28px] border border-black/[0.05] bg-white p-8 text-center shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]">
        {phase === 'loading' || phase === 'processing' ? (
          <div className="py-6">
            <Loader2 className="mx-auto mb-4 size-10 animate-spin text-[#0071E3]" />
            <p className="text-sm font-medium text-[#86868B]">{phase === 'loading' ? '확인 중' : '출결 처리 중'}</p>
          </div>
        ) : phase === 'need-login' ? (
          <>
            <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#0071E3]/10">
              <LogIn className="size-7 text-[#0071E3]" />
            </span>
            <h1 className="mb-2 text-lg font-bold">로그인이 필요해요</h1>
            <p className="mb-5 text-xs text-[#86868B]">본인 확인 후 등하원이 처리됩니다.</p>
            <a href={loginHref} className="inline-block w-full rounded-2xl bg-[#1D1D1F] py-3.5 text-sm font-bold text-white transition active:scale-[0.98]">
              학생 로그인
            </a>
          </>
        ) : phase === 'select-action' ? (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            {studentName && (
              <p className="text-sm font-semibold text-[#86868B]">{studentName} 학생</p>
            )}
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">출결 상태 선택</h1>
            
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F7] px-3.5 py-1.5 text-xs font-bold text-[#1D1D1F]">
              <span className="text-[#86868B]">현재 상태:</span>
              <span>{checkedIn ? '공부 중 🟢' : '외출·미등원 🔴'}</span>
            </div>

            <p className="mt-4 text-xs text-[#86868B] leading-5">원하는 행동 버튼을 눌러서<br />출결 상태를 기록해 주세요.</p>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                onClick={() => submitAction('check-in')}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl text-xs font-bold transition active:scale-[0.98] ${
                  checkedIn
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20'
                }`}
              >
                등원하기
              </button>
              <button
                onClick={() => submitAction('check-out')}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl text-xs font-bold transition active:scale-[0.98] ${
                  !checkedIn
                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                    : 'bg-sky-600 text-white hover:bg-sky-700 shadow-md shadow-sky-600/20'
                }`}
              >
                하원하기
              </button>
              <button
                onClick={() => submitAction('outing')}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl text-xs font-bold transition active:scale-[0.98] ${
                  !checkedIn
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-600/20'
                }`}
              >
                외출하기
              </button>
              <button
                onClick={() => submitAction('return')}
                className={`flex h-16 flex-col items-center justify-center rounded-2xl text-xs font-bold transition active:scale-[0.98] ${
                  checkedIn
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20'
                }`}
              >
                복귀하기
              </button>
            </div>
          </div>
        ) : isResult ? (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <span
              className={`mx-auto mb-5 grid size-20 place-items-center rounded-full ${
                ['checked-in', 'return'].includes(phase) 
                  ? 'bg-emerald-50' 
                  : phase === 'outing' 
                    ? 'bg-amber-50' 
                    : 'bg-sky-50'
              }`}
            >
              {['checked-in', 'return'].includes(phase) ? (
                <CheckCircle2 className="size-11 text-emerald-500 animate-in zoom-in-50 duration-700" />
              ) : phase === 'outing' ? (
                <Coffee className="size-10 text-amber-500 animate-in zoom-in-50 duration-700" />
              ) : (
                <LogOut className="size-10 text-sky-500 animate-in zoom-in-50 duration-700" />
              )}
            </span>

            {studentName && (
              <p className="text-sm font-semibold text-[#86868B]">{studentName} 학생</p>
            )}
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
              {phase === 'checked-in' && '등원 완료'}
              {phase === 'return' && '복귀 완료'}
              {phase === 'checked-out' && '하원 완료'}
              {phase === 'outing' && '외출 완료'}
            </h1>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F7] px-3 py-1.5 text-xs font-bold text-[#1D1D1F]">
              <span className="text-[#86868B]">
                {phase === 'checked-in' && '등원'}
                {phase === 'return' && '복귀'}
                {phase === 'checked-out' && '하원'}
                {phase === 'outing' && '외출'}
              </span>
              {timeLabel}
            </div>

            {['checked-in', 'return'].includes(phase) ? (
              <>
                <p className="mt-3 text-xs text-[#86868B]">지금부터 오늘의 순공 시간이 측정돼요.</p>
                <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400 animate-pulse">잠시 후 학생 홈으로 이동합니다...</p>
                  <button
                    onClick={() => router.replace('/student')}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-[#0071E3] py-2.5 text-xs font-bold text-white transition hover:bg-[#0077ED] active:scale-[0.98]"
                  >
                    지금 학생 홈 가기 &rarr;
                  </button>
                </div>
              </>
            ) : (
              <>
                {phase === 'checked-out' ? (
                  <p className="mt-3 text-sm text-[#1D1D1F]">
                    오늘 체류 <strong className="text-[#0071E3]">{formatMinutes(minutes)}</strong>
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-[#86868B]">외출 처리가 완료되었습니다.<br />복귀 시 꼭 복귀 버튼을 눌러주세요.</p>
                )}
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <button
                    onClick={() => router.replace('/student')}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-[#1D1D1F] transition hover:bg-slate-50 active:scale-[0.98]"
                  >
                    내 학생 홈 가기 &rarr;
                  </button>
                </div>
              </>
            )}

            <AttendNotices enrollmentDaysLeft={enrollmentDaysLeft} gradeReminder={gradeReminder} />
          </div>
        ) : (
          <>
            <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-red-50">
              <AlertCircle className="size-7 text-red-500" />
            </span>
            <h1 className="mb-2 text-lg font-bold">처리 실패</h1>
            <p className="text-xs leading-5 text-[#86868B]">{message}</p>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                onClick={() => setPhase('select-action')}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-[#1D1D1F] transition hover:bg-slate-50 active:scale-[0.98]"
              >
                다시 시도하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AttendPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="size-8 animate-spin text-[#0071E3]" /></div>}>
      <AttendInner />
    </Suspense>
  );
}
