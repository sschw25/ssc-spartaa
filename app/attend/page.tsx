'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, LogIn, LogOut } from 'lucide-react';

type Phase = 'loading' | 'need-login' | 'processing' | 'checked-in' | 'checked-out' | 'error';

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '-';
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function AttendInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F7] p-6 font-sans text-[#1D1D1F]">
      <div className="w-full max-w-sm rounded-3xl border border-black/[0.05] bg-white p-8 text-center shadow-sm">
        {phase === 'loading' || phase === 'processing' ? (
          <>
            <Loader2 className="mx-auto mb-4 size-10 animate-spin text-[#0071E3]" />
            <p className="text-sm text-[#86868B]">{phase === 'loading' ? '확인 중' : '등하원 처리 중'}</p>
          </>
        ) : phase === 'need-login' ? (
          <>
            <LogIn className="mx-auto mb-4 size-10 text-[#0071E3]" />
            <h1 className="mb-2 text-lg font-bold">로그인이 필요해요</h1>
            <p className="mb-5 text-xs text-[#86868B]">본인 확인 후 등하원이 처리됩니다.</p>
            <a href={loginHref} className="inline-block w-full rounded-xl bg-[#1D1D1F] py-3 text-sm font-bold text-white">
              학생 로그인
            </a>
          </>
        ) : phase === 'checked-in' ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 size-12 text-emerald-500" />
            <h1 className="mb-1 text-xl font-bold">등원 완료</h1>
            <p className="text-xs text-[#86868B]">오늘의 순공 시간이 측정됩니다.</p>
          </>
        ) : phase === 'checked-out' ? (
          <>
            <LogOut className="mx-auto mb-4 size-12 text-[#0071E3]" />
            <h1 className="mb-1 text-xl font-bold">하원 완료</h1>
            <p className="mt-2 text-sm text-[#1D1D1F]">
              오늘 체류 <strong className="text-[#0071E3]">{formatMinutes(minutes)}</strong>
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="mx-auto mb-4 size-10 text-red-500" />
            <h1 className="mb-2 text-lg font-bold">처리 실패</h1>
            <p className="text-xs text-[#86868B]">{message}</p>
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
