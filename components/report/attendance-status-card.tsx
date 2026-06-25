'use client';

import React, { useEffect, useState } from 'react';
import { ScanLine, LogIn, LogOut, Loader2, Flame } from 'lucide-react';

interface TodaySession {
  checkIn: string;
  checkOut: string | null;
}
type Status = {
  loading: boolean;
  checkedIn: boolean;
  since: string | null;
  sinceToday: boolean;
  todayMinutes: number;
  todaySessions: TodaySession[];
};

function timeKST(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function fmtMin(min: number): string {
  if (!min || min <= 0) return '0분';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

// 학생 본인 결과지에서만 사용: 현재 등원 상태(라이브) + 오늘 등하원 타임라인 + QR 안내.
export function AttendanceStatusCard() {
  const [status, setStatus] = useState<Status>({ loading: true, checkedIn: false, since: null, sinceToday: false, todayMinutes: 0, todaySessions: [] });
  const [now, setNow] = useState(0); // 라이브 경과 시간 틱 (마운트 후에만 동작 → SSR 불일치 없음)

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/attend', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setStatus({
            loading: false,
            checkedIn: !!json.checkedIn,
            since: json.since || null,
            sinceToday: !!json.sinceToday,
            todayMinutes: json.todayMinutes || 0,
            todaySessions: Array.isArray(json.todaySessions) ? json.todaySessions : [],
          });
        } else {
          setStatus({ loading: false, checkedIn: false, since: null, sinceToday: false, todayMinutes: 0, todaySessions: [] });
        }
      } catch {
        if (active) setStatus((s) => ({ ...s, loading: false }));
      }
    };
    load();
    setNow(Date.now());
    // 등하원이 키오스크에서 처리되면 반영 + 경과 시간 갱신
    const id = setInterval(() => {
      load();
      setNow(Date.now());
    }, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const checkedIn = status.checkedIn;
  const elapsedMin = checkedIn && status.sinceToday && status.since && now > 0
    ? Math.max(0, Math.floor((now - new Date(status.since).getTime()) / 60000))
    : 0;

  return (
    <div className="rounded-3xl border border-black/[0.05] bg-white p-6 md:p-8 shadow-sm space-y-5">
      <div className="flex flex-col gap-4">
        {/* 상단: 상태 표시 */}
        <div className="flex items-center gap-3.5 pb-2">
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
              status.loading ? 'bg-slate-100 text-slate-400' : checkedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {status.loading ? <Loader2 className="size-5 animate-spin" /> : checkedIn ? <LogIn className="size-5" /> : <LogOut className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#86868B]">현재 등하원 상태</p>
            {status.loading ? (
              <p className="mt-0.5 text-lg font-black text-slate-400">확인 중…</p>
            ) : checkedIn ? (
              <div className="mt-0.5 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-lg font-black text-[#1D1D1F]">등원 중</span>
                  {status.since && (
                    <span className="text-xs font-bold text-[#0071E3] whitespace-nowrap">
                      {timeKST(status.since)}부터
                    </span>
                  )}
                </div>
                {elapsedMin > 0 && (
                  <div className="pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                      <Flame className="size-3 shrink-0" />
                      {fmtMin(elapsedMin)}째 집중 중
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-0.5 text-lg font-black text-[#1D1D1F]">하원 상태</p>
            )}
          </div>
        </div>

        {/* 하단: 안내 박스 */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-[#0071E3]/[0.06] p-4 ring-1 ring-[#0071E3]/15 w-full">
          <ScanLine className="mt-0.5 size-4 shrink-0 text-[#0071E3]" />
          <div className="space-y-1.5 text-xs text-[#0F172A] leading-normal flex-1">
            <p className="font-semibold">
              등·하원은 <b>입구 키오스크의 QR</b>을 휴대폰으로 스캔하면 자동 처리돼요.
            </p>
            <p className="text-[11px] text-[#64748B] font-medium">
              한 번 스캔할 때마다 등원 ↔ 하원이 전환됩니다.
            </p>
            <p className="text-[11px] text-[#F56300] font-semibold pt-1.5 border-t border-[#0071E3]/10">
              ※ 하원하려면 QR을 재스캔하거나, 출결태블릿에서 출결번호를 누른 뒤 [하원]을 눌러주세요.
            </p>
          </div>
        </div>
      </div>

      {/* 오늘 등하원 타임라인 + 오늘 순공 */}
      {!status.loading && (
        <div className="rounded-2xl bg-[#F5F5F7] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#86868B]">오늘 학습 시간</span>
            <span className="text-sm font-black text-[#0071E3]">{fmtMin(status.todayMinutes)}</span>
          </div>
          {status.todaySessions.length > 0 ? (
            <div className="space-y-2">
              {status.todaySessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-emerald-600">
                    <LogIn className="size-3" /> {timeKST(s.checkIn)}
                  </span>
                  <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                  {s.checkOut ? (
                    <span className="inline-flex shrink-0 items-center gap-1 font-bold text-slate-500">
                      <LogOut className="size-3" /> {timeKST(s.checkOut)}
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[#0071E3]">
                      <span className="size-1.5 rounded-full bg-[#0071E3] animate-pulse" /> 진행 중
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-slate-400">오늘 등하원 기록이 아직 없어요. QR로 등원하면 여기에 기록돼요.</p>
          )}
        </div>
      )}
    </div>
  );
}
