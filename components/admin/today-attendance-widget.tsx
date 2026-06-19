'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Clock, Flame, ChevronDown } from 'lucide-react';

type PresentRow = { id: string; name: string; campus: string; checkInAt: string; minutesSoFar: number; weekMinutes: number };
type LeftRow = { id: string; name: string; campus: string; checkInAt: string; checkOutAt: string; minutes: number; weekMinutes: number };
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

const fmtMin = (m: number) => {
  if (!m || m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
};

export function TodayAttendanceWidget({ campusFilter, refreshSignal, onSelectStudentId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const detailsOpen = true;
  const [openSection, setOpenSection] = useState<'present' | 'left' | 'absent'>('present');

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

  const wrap = 'admin-fit-box bg-white/95 border border-black/[0.04] rounded-3xl shadow-premium backdrop-blur-md p-5 transition-premium hover:shadow-premium-hover';

  if (loading && !data) {
    return (
      <div className={`${wrap} flex flex-col items-center justify-center py-12`}>
        <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mb-2" />
        <span className="text-xs text-[#86868B] font-semibold">오늘 출결 현황 불러오는 중...</span>
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
        <Clock className="w-5 h-5 text-[#86868B] shrink-0" />
        <p className="text-xs text-[#86868B] font-semibold leading-relaxed">
          출결 연동(Supabase)이 설정되지 않아 실시간 출결을 표시할 수 없습니다.
        </p>
      </div>
    );
  }



  const Tile = ({
    label, count, color, section,
  }: { label: string; count: number; color: string; section: 'present' | 'left' | 'absent' }) => (
    <button
      type="button"
      onClick={() => {
        setOpenSection(section);
      }}
      className={`flex-1 min-h-[104px] flex flex-col justify-between rounded-2xl border p-3 text-left transition-premium hover:-translate-y-0.5 hover:shadow-md ${
        detailsOpen && openSection === section
          ? 'border-black/[0.15] ring-2 ring-inset ring-black/[0.06] shadow-sm'
          : 'border-black/[0.04]'
      } ${color}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="admin-fit-label text-[10px] font-extrabold uppercase tracking-wider opacity-85">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div className="admin-fit-number text-xl font-extrabold tracking-tight text-[#1D1D1F]">
          {count}<span className="text-[10px] font-bold opacity-75 ml-0.5">명</span>
        </div>
      </div>
    </button>
  );

  const Row = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => onSelectStudentId(id)}
      className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F5F7]/80 hover:translate-x-0.5 active:translate-x-0 transition-premium text-left"
    >
      {children}
    </button>
  );

  const Name = ({ name, campus }: { name: string; campus: string }) => (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-semibold text-[#1D1D1F] truncate">{name}</span>
      <span className="text-[9px] font-extrabold text-[#86868B] bg-[#F5F5F7] px-2 py-0.5 rounded-md border border-black/[0.03] shrink-0">{campusLabel(campus)}</span>
    </span>
  );

  const WeekPace = ({ min }: { min: number }) => (
    <span className="flex items-center gap-1 text-[10px] font-bold text-[#86868B] shrink-0">
      <Flame className="w-3 h-3 text-[#F56300]" /> 주 {fmtMin(min)}
    </span>
  );

  return (
    <div className={wrap}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <h3 className="admin-fit-text text-sm font-black text-[#1D1D1F] tracking-tight">오늘 출결 현황</h3>
          {data?.today && <span className="text-[10px] font-bold text-[#86868B] bg-[#F5F5F7] px-2 py-0.5 rounded-md border border-black/[0.02]">{data.today}</span>}
          {campusFilter !== 'all' && (
            <span className="text-[10px] font-extrabold text-[#0071E3] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">{campusLabel(campusFilter)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push('/admin/attendance')}
            className="text-[11px] font-bold text-[#86868B] hover:text-[#1D1D1F] transition-colors px-2 py-1 rounded-lg hover:bg-[#F5F5F7]"
          >
            자세히
          </button>
          <button onClick={load} disabled={loading} className="text-[#86868B] hover:text-[#1D1D1F] transition-colors disabled:opacity-50 p-1 rounded-lg hover:bg-[#F5F5F7]" title="출결 새로고침">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <Tile label="등원 중" count={present.length} section="present"
          color="border-emerald-100/80 bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 text-emerald-800" />
        <Tile label="하원" count={left.length} section="left"
          color="border-blue-100/80 bg-gradient-to-br from-blue-50/80 to-blue-100/40 text-blue-800" />
        <Tile label="미등원" count={absent.length} section="absent"
          color="border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-slate-100/40 text-slate-700" />
      </div>

      {detailsOpen && (
        <div className="mt-3 max-h-72 overflow-y-auto border-t border-black/[0.05] px-1 pt-3">
          {openSection === 'present' && (
            present.length === 0 ? <Empty text="현재 등원 중인 원생이 없습니다." /> :
            present.map((r) => (
              <Row key={r.id} id={r.id}>
                <Name name={r.name} campus={r.campus} />
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100/80 px-2 py-0.5 rounded-md shrink-0">
                    {r.checkInAt} 등원 · {fmtMin(r.minutesSoFar)}째
                  </span>
                  <WeekPace min={r.weekMinutes} />
                </span>
              </Row>
            ))
          )}
          {openSection === 'left' && (
            left.length === 0 ? <Empty text="오늘 하원한 원생이 없습니다." /> :
            left.map((r) => (
              <Row key={r.id} id={r.id}>
                <Name name={r.name} campus={r.campus} />
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100/80 px-2 py-0.5 rounded-md shrink-0">
                    {r.checkInAt}~{r.checkOutAt} · 순공 {fmtMin(r.minutes)}
                  </span>
                  <WeekPace min={r.weekMinutes} />
                </span>
              </Row>
            ))
          )}
          {openSection === 'absent' && (
            absent.length === 0 ? <Empty text="미등원 원생이 없습니다. 전원 출석!" /> :
            absent.map((r) => (
              <Row key={r.id} id={r.id}>
                <Name name={r.name} campus={r.campus} />
                <WeekPace min={r.weekMinutes} />
              </Row>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-[#86868B] font-semibold text-center py-4">{text}</p>;
}
