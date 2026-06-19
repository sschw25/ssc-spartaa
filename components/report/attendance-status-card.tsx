'use client';

import React, { useEffect, useState } from 'react';
import { ScanLine, LogIn, LogOut, Loader2 } from 'lucide-react';

type Status = { loading: boolean; checkedIn: boolean; since: string | null };

function timeKST(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

// 학생 본인 결과지에서만 사용: 현재 등원 상태(라이브) + QR 출결 안내.
export function AttendanceStatusCard() {
  const [status, setStatus] = useState<Status>({ loading: true, checkedIn: false, since: null });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/attend', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setStatus({ loading: false, checkedIn: !!json.checkedIn, since: json.since || null });
        } else {
          setStatus({ loading: false, checkedIn: false, since: null });
        }
      } catch {
        if (active) setStatus({ loading: false, checkedIn: false, since: null });
      }
    };
    load();
    // 등하원이 키오스크에서 처리되면 반영되도록 가볍게 폴링
    const id = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const checkedIn = status.checkedIn;

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
              status.loading ? 'bg-slate-100 text-slate-400' : checkedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {status.loading ? <Loader2 className="size-5 animate-spin" /> : checkedIn ? <LogIn className="size-5" /> : <LogOut className="size-5" />}
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">현재 등하원 상태</p>
            {status.loading ? (
              <p className="mt-0.5 text-lg font-black text-slate-400">확인 중…</p>
            ) : checkedIn ? (
              <p className="mt-0.5 text-lg font-black text-[#1D1D1F]">
                등원 중
                {status.since && <span className="ml-2 text-sm font-bold text-[#0071E3]">{timeKST(status.since)}부터</span>}
              </p>
            ) : (
              <p className="mt-0.5 text-lg font-black text-[#1D1D1F]">하원 상태</p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl bg-[#0071E3]/[0.06] px-4 py-3 ring-1 ring-[#0071E3]/15">
          <ScanLine className="mt-0.5 size-4 shrink-0 text-[#0071E3]" />
          <p className="text-xs font-semibold leading-5 text-[#0F172A]">
            등·하원은 <b>입구 키오스크의 QR</b>을 휴대폰으로 스캔하면 자동 처리돼요.
            <span className="block text-[11px] font-medium text-[#64748B]">한 번 스캔할 때마다 등원 ↔ 하원이 전환됩니다.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
