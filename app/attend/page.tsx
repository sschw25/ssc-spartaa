'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, LogIn, LogOut, AlertCircle } from 'lucide-react';

type Phase = 'loading' | 'need-login' | 'processing' | 'checked-in' | 'checked-out' | 'error';

function AttendInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      // 1) 로그인 여부 확인
      const me = await fetch('/api/attend', { cache: 'no-store' });
      if (!active) return;
      if (me.status === 401) {
        setPhase('need-login');
        return;
      }
      // 2) 토큰으로 등하원 토글
      setPhase('processing');
      try {
        const res = await fetch('/api/attend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          if (json.action === 'check-in') {
            setPhase('checked-in');
          } else {
            setMinutes(json.minutes ?? null);
            setPhase('checked-out');
          }
        } else {
          setMessage(json.message || '출결 처리에 실패했습니다.');
          setPhase('error');
        }
      } catch {
        if (active) { setMessage('네트워크 오류가 발생했습니다.'); setPhase('error'); }
      }
    })();
    return () => { active = false; };
  }, [token]);

  const loginHref = `/student/login?next=${encodeURIComponent(`/attend?token=${token}`)}`;

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-6 font-sans text-[#1D1D1F]">
      <div className="bg-white rounded-3xl shadow-sm border border-black/[0.05] p-8 w-full max-w-sm text-center">
        {phase === 'loading' || phase === 'processing' ? (
          <>
            <Loader2 className="w-10 h-10 text-[#0071E3] animate-spin mx-auto mb-4" />
            <p className="text-sm text-[#86868B]">{phase === 'loading' ? '확인 중…' : '출결 처리 중…'}</p>
          </>
        ) : phase === 'need-login' ? (
          <>
            <LogIn className="w-10 h-10 text-[#0071E3] mx-auto mb-4" />
            <h1 className="text-lg font-bold mb-2">로그인이 필요해요</h1>
            <p className="text-xs text-[#86868B] mb-5">본인 확인 후 등하원이 처리됩니다.</p>
            <a href={loginHref} className="inline-block w-full rounded-xl bg-[#1D1D1F] text-white text-sm font-bold py-3">
              학생 로그인
            </a>
          </>
        ) : phase === 'checked-in' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">등원 완료 ✅</h1>
            <p className="text-xs text-[#86868B]">오늘도 화이팅! 순공 시간이 측정됩니다.</p>
          </>
        ) : phase === 'checked-out' ? (
          <>
            <LogOut className="w-12 h-12 text-[#0071E3] mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">하원 완료 👋</h1>
            <p className="text-sm text-[#1D1D1F] mt-2">
              오늘 체류 <strong className="text-[#0071E3]">{minutes != null ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : '-'}</strong>
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h1 className="text-lg font-bold mb-2">처리 실패</h1>
            <p className="text-xs text-[#86868B]">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AttendPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#0071E3]" /></div>}>
      <AttendInner />
    </Suspense>
  );
}
