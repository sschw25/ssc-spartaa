'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Clock, Flame, UserCheck, Home, UserX } from 'lucide-react';
import { Donut } from '@/components/admin/viz-kit';

type AttendanceSection = 'present' | 'left' | 'absent';
type PresentRow = { id: string; name: string; campus: string; checkInAt: string; minutesSoFar: number; weekMinutes: number };
type LeftRow = {
  id: string;
  name: string;
  campus: string;
  checkInAt: string;
  checkOutAt: string | null;
  minutes: number | null;
  autoClosed?: boolean;
  weekMinutes: number;
};
type AbsentRow = { id: string; name: string; campus: string; weekMinutes: number };

interface AttendanceData {
  configured: boolean;
  today?: string;
  summary?: { total: number; present: number; leftToday: number; absent: number };
  present?: PresentRow[];
  leftToday?: LeftRow[];
  absent?: AbsentRow[];
}

interface Props {
  campusFilter: string;
  refreshSignal?: number;
  onSelectStudentId: (id: string) => void;
}

const campusLabel = (val: string) =>
  ({ wonju: '원주', chuncheon: '춘천', chungju: '충주' } as Record<string, string>)[val] || '기타';

const fmtMin = (m?: number | null) => {
  if (!m || m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};

function Tile({
  label,
  count,
  section,
  activeColor,
  inactiveColor,
  icon: Icon,
  dotColor,
  isActive,
  onSelect,
}: {
  label: string;
  count: number;
  section: AttendanceSection;
  activeColor: string;
  inactiveColor: string;
  icon: React.ComponentType<{ className?: string }>;
  dotColor: string;
  isActive: boolean;
  onSelect: (section: AttendanceSection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(section)}
      className={`flex-1 min-h-[104px] flex flex-col justify-between rounded-2xl p-4 text-left transition-all duration-300 relative overflow-hidden border ${
        isActive
          ? `${activeColor} shadow-[0_6px_16px_-4px_rgba(0,0,0,0.06)] scale-[1.01] z-10`
          : `${inactiveColor} hover:bg-black/[0.01] hover:scale-[1.005] hover:border-black/[0.08]`
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${section === 'present' ? 'animate-pulse' : ''}`} />
        <span className={`text-[13px] font-medium transition-colors duration-300 ${
          isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
        }`}>
          {label}
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline gap-1">
        <span className={`text-[18px] leading-none font-semibold tracking-tight transition-colors duration-300 ${
          isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900 dark:text-slate-100'
        }`}>
          {count}
        </span>
        <span className={`text-[14px] font-medium transition-colors duration-300 ${
          isActive ? 'text-slate-900/70 dark:text-slate-100/70' : 'text-slate-500 dark:text-slate-400'
        }`}>
          명
        </span>
      </div>
    </button>
  );
}

function AttendanceRow({
  id,
  children,
  onSelect,
}: {
  id: string;
  children: React.ReactNode;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F5F7]/80 dark:hover:bg-white/5 hover:translate-x-0.5 active:translate-x-0 transition-premium text-left"
    >
      {children}
    </button>
  );
}

function Name({ name, campus }: { name: string; campus: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{name}</span>
      <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 bg-[#F5F5F7] dark:bg-white/5 px-2 py-0.5 rounded-md border border-black/[0.03] dark:border-white/10 shrink-0">{campusLabel(campus)}</span>
    </span>
  );
}

function WeekPace({ min }: { min: number }) {
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
      <Flame className="w-3 h-3 text-[#F56300]" /> 주 {fmtMin(min)}
    </span>
  );
}

export function TodayAttendanceWidget({ campusFilter, refreshSignal, onSelectStudentId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const detailsOpen = true;
  const [openSection, setOpenSection] = useState<AttendanceSection>('present');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/attendance/today', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      } else {
        setError(json.message || '출결 현황을 불러오지 못했습니다.');
      }
    } catch {
      setError('네트워크 오류로 출결 현황을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const byCampus = <T extends { campus: string }>(rows?: T[]) =>
    (rows || []).filter((r) => campusFilter === 'all' || r.campus === campusFilter);

  const present = byCampus(data?.present);
  const left = byCampus(data?.leftToday);
  const absent = byCampus(data?.absent);

  const wrap = 'admin-fit-box bg-white/95 dark:bg-[#1c1c1e]/95 border border-black/[0.04] dark:border-white/10 rounded-3xl shadow-premium backdrop-blur-md p-5 transition-premium hover:shadow-premium-hover';

  if (loading && !data) {
    return (
      <div className={`${wrap} flex flex-col items-center justify-center py-12`}>
        <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mb-2" />
        <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">오늘 출결 현황 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${wrap} flex items-center justify-between gap-3 py-6`}>
        <p className="text-xs text-red-600 font-semibold">{error}</p>
        <button onClick={load} className="text-xs font-bold text-[#0071E3] hover:underline shrink-0">다시 시도</button>
      </div>
    );
  }

  if (data && data.configured === false) {
    return (
      <div className={`${wrap} flex items-center gap-3 py-6`}>
        <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
          출결 연동(Supabase)이 설정되지 않아 실시간 출결을 표시할 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <h3 className="admin-fit-text text-[15px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">오늘 출결 현황</h3>
          {data?.today && <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-[#F5F5F7] dark:bg-white/5 px-2 py-0.5 rounded-md border border-black/[0.02] dark:border-white/10">{data.today}</span>}
          {campusFilter !== 'all' && (
            <span className="text-[10px] font-semibold text-[#0071E3] bg-blue-50 dark:bg-[#0071E3]/15 border border-blue-100 dark:border-[#0071E3]/20 px-2 py-0.5 rounded-md">{campusLabel(campusFilter)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push('/admin/attendance')}
            className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors px-2 py-1 rounded-lg hover:bg-[#F5F5F7] dark:hover:bg-white/5"
          >
            자세히
          </button>
          <button onClick={load} disabled={loading} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors disabled:opacity-50 p-1 rounded-lg hover:bg-[#F5F5F7] dark:hover:bg-white/5" title="출결 새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        {(present.length + left.length + absent.length) > 0 && (
          <div className="shrink-0 mx-auto sm:mx-0">
            <Donut
              size={124}
              thickness={16}
              segments={[
                { label: '등원', value: present.length, color: '#34C759' },
                { label: '하원', value: left.length, color: '#0071E3' },
                { label: '미등원', value: absent.length, color: '#C7C7CC' },
              ]}
              centerTop={`${present.length + left.length}`}
              centerBottom={`/ ${present.length + left.length + absent.length}명`}
            />
          </div>
        )}
        <div className="flex gap-3 flex-1 w-full min-w-0">
        <Tile
          label="등원 중"
          count={present.length}
          section="present"
          activeColor="border-emerald-200/80 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/70 to-emerald-100/30 dark:from-emerald-500/10 dark:to-emerald-500/[0.05] text-emerald-900 dark:text-emerald-200"
          inactiveColor="border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400"
          icon={UserCheck}
          dotColor="bg-emerald-500"
          isActive={detailsOpen && openSection === 'present'}
          onSelect={setOpenSection}
        />
        <Tile
          label="하원"
          count={left.length}
          section="left"
          activeColor="border-blue-200/80 dark:border-[#0071E3]/20 bg-gradient-to-br from-blue-50/70 to-blue-100/30 dark:from-[#0071E3]/15 dark:to-[#0071E3]/[0.08] text-blue-900 dark:text-blue-200"
          inactiveColor="border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400"
          icon={Home}
          dotColor="bg-blue-500"
          isActive={detailsOpen && openSection === 'left'}
          onSelect={setOpenSection}
        />
        <Tile
          label="미등원"
          count={absent.length}
          section="absent"
          activeColor="border-slate-300/80 dark:border-white/15 bg-gradient-to-br from-slate-100/70 to-slate-200/30 dark:from-white/10 dark:to-white/5 text-slate-900 dark:text-slate-100"
          inactiveColor="border-black/[0.04] dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400"
          icon={UserX}
          dotColor="bg-slate-400"
          isActive={detailsOpen && openSection === 'absent'}
          onSelect={setOpenSection}
        />
        </div>
      </div>

      {detailsOpen && (
        <div className="mt-3 max-h-72 overflow-y-auto custom-scrollbar border-t border-black/[0.05] dark:border-white/10 px-1 pt-3">
          {openSection === 'present' && (
            present.length === 0 ? <Empty text="현재 등원 중인 학생이 없습니다." /> :
            present.map((r) => (
              <AttendanceRow key={r.id} id={r.id} onSelect={onSelectStudentId}>
                <Name name={r.name} campus={r.campus} />
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100/80 dark:border-emerald-500/20 px-2 py-0.5 rounded-md shrink-0">
                    {r.checkInAt} 등원 · {fmtMin(r.minutesSoFar)}째
                  </span>
                  <WeekPace min={r.weekMinutes} />
                </span>
              </AttendanceRow>
            ))
          )}
          {openSection === 'left' && (
            left.length === 0 ? <Empty text="오늘 하원한 학생이 없습니다." /> :
            left.map((r) => (
              <AttendanceRow key={r.id} id={r.id} onSelect={onSelectStudentId}>
                <Name name={r.name} campus={r.campus} />
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded-md shrink-0 ${r.autoClosed ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-amber-100/80 dark:border-amber-500/20' : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-[#0071E3]/15 border-blue-100/80 dark:border-[#0071E3]/20'}`}>
                    {r.autoClosed
                      ? `${r.checkInAt}~미입력 · 수동입력 필요`
                      : `${r.checkInAt}~${r.checkOutAt || '-'} · 순공 ${fmtMin(r.minutes)}`}
                  </span>
                  <WeekPace min={r.weekMinutes} />
                </span>
              </AttendanceRow>
            ))
          )}
          {openSection === 'absent' && (
            absent.length === 0 ? <Empty text="미등원 학생이 없습니다. 전원 출석!" /> :
            absent.map((r) => (
              <AttendanceRow key={r.id} id={r.id} onSelect={onSelectStudentId}>
                <Name name={r.name} campus={r.campus} />
                <WeekPace min={r.weekMinutes} />
              </AttendanceRow>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold text-center py-4">{text}</p>;
}
