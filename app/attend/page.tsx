'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Loader2, LogIn, LogOut } from 'lucide-react';

type Phase = 'loading' | 'need-login' | 'processing' | 'checked-in' | 'checked-out' | 'error';

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
  const token = searchParams.get('token') || '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [studentName, setStudentName] = useState('');
  const [timeLabel, setTimeLabel] = useState('');
  const [enrollmentDaysLeft, setEnrollmentDaysLeft] = useState<number | null>(null);
  const [gradeReminder, setGradeReminder] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const me = await fetch('/api/attend', { cache: 'no-store' });
      if (!active) return;

      if (me.status === 401) {
        setPhase('need-login');
        return;
      }

      setPhase('processing');
      try {
        const response = await fetch('/api/attend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await response.json();
        if (!active) return;

        if (response.ok && json.success) {
          setStudentName(json.studentName || '');
          setTimeLabel(nowLabelKST());
          setEnrollmentDaysLeft(json.enrollmentDaysLeft ?? null);
          setGradeReminder(Boolean(json.gradeReminder));
          if (json.action === 'check-in') {
            setPhase('checked-in');
          } else {
            setMinutes(json.minutes ?? null);
            setPhase('checked-out');
          }
        } else {
          setMessage(json.message || '등하원 처리에 실패했습니다.');
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

  const loginHref = `/student/login?next=${encodeURIComponent(`/attend?token=${token}`)}`;
  const isCheckIn = phase === 'checked-in';
  const isCheckOut = phase === 'checked-out';
  const isResult = isCheckIn || isCheckOut;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#F5F5F7] to-[#ECEEF1] p-6 font-sans text-[#1D1D1F]">
      <div className="w-full max-w-sm rounded-[28px] border border-black/[0.05] bg-white p-8 text-center shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]">
        {phase === 'loading' || phase === 'processing' ? (
          <div className="py-6">
            <Loader2 className="mx-auto mb-4 size-10 animate-spin text-[#0071E3]" />
            <p className="text-sm font-medium text-[#86868B]">{phase === 'loading' ? '확인 중' : '등하원 처리 중'}</p>
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
        ) : isResult ? (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <span
              className={`mx-auto mb-5 grid size-20 place-items-center rounded-full ${isCheckIn ? 'bg-emerald-50' : 'bg-[#0071E3]/10'}`}
            >
              {isCheckIn ? (
                <CheckCircle2 className="size-11 text-emerald-500 animate-in zoom-in-50 duration-700" />
              ) : (
                <LogOut className="size-10 text-[#0071E3] animate-in zoom-in-50 duration-700" />
              )}
            </span>

            {studentName && (
              <p className="text-sm font-semibold text-[#86868B]">{studentName} 학생</p>
            )}
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
              {isCheckIn ? '등원 완료' : '하원 완료'}
            </h1>

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F7] px-3 py-1.5 text-xs font-bold text-[#1D1D1F]">
              <span className="text-[#86868B]">{isCheckIn ? '등원' : '하원'}</span>
              {timeLabel}
            </div>

            {isCheckIn ? (
              <p className="mt-3 text-xs text-[#86868B]">지금부터 오늘의 순공 시간이 측정돼요.</p>
            ) : (
              <p className="mt-3 text-sm text-[#1D1D1F]">
                오늘 체류 <strong className="text-[#0071E3]">{formatMinutes(minutes)}</strong>
              </p>
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
