'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, UserX, Loader2, RefreshCw, ChevronDown, ChevronUp, Clock, Flame } from 'lucide-react';

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
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openSection, setOpenSection] = useState<'present' | 'left' | 'absent' | null>('present');

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

  const wrap = 'admin-fit-box bg-white border border-black/[0.05] rounded-2xl shadow-sm p-4.5';

  if (loading && !data) {
    return (
      <div className={`${wrap} flex items-center justify-center py-8`}>
        <Loader2 className="w-5 h-5 text-[#0071E3] animate-spin mr-2" />
        <span className="text-xs text-[#86868B]">오늘 출결 현황 불러오는 중…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${wrap} flex items-center justify-between gap-3`}>
        <p className="text-xs text-red-600 font-semibold">{error}</p>
        <button onClick={load} className="text-[11px] font-bold text-[#0071E3] hover:underline shrink-0">다시 시도</button>
      </div>
    );
  }

  if (data && data.configured === false) {
    return (
      <div className={`${wrap} flex items-center gap-3`}>
        <Clock className="w-4 h-4 text-[#86868B] shrink-0" />
        <p className="text-[11px] text-[#86868B] font-semibold leading-relaxed">
          출결 연동(Supabase)이 설정되지 않아 실시간 출결을 표시할 수 없습니다. 키오스크 QR 출결을 사용하려면 데이터베이스 연결이 필요합니다.
        </p>
      </div>
    );
  }

  const Tile = ({
    label, count, color, icon, section,
  }: { label: string; count: number; color: string; icon: React.ReactNode; section: 'present' | 'left' | 'absent' }) => (
    <button
      type="button"
      onClick={() => setOpenSection((cur) => (cur === section ? null : section))}
      className={`flex-1 rounded-xl border p-3 text-left transition-all ${
        openSection === section ? 'ring-2 ring-offset-1' : 'hover:bg-black/[0.015]'
      } ${color}`}
    >
      <div className="flex items-center justify-between">
        <span className="admin-fit-label text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</span>
        {icon}
      </div>
      <div className="admin-fit-number text-2xl font-bold mt-1.5">{count}<span className="text-sm font-semibold opacity-70"> 명</span></div>
    </button>
  );

  const Row = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => onSelectStudentId(id)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-[#F5F5F7] transition-colors text-left"
    >
      {children}
    </button>
  );

  const Name = ({ name, campus }: { name: string; campus: string }) => (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs font-bold text-[#1D1D1F] truncate">{name}</span>
      <span className="text-[9px] font-bold text-[#86868B] bg-[#F5F5F7] px-1.5 py-0.5 rounded-full shrink-0">{campusLabel(campus)}</span>
    </span>
  );

  const WeekPace = ({ min }: { min: number }) => (
    <span className="flex items-center gap-1 text-[10px] font-bold text-[#86868B] shrink-0">
      <Flame className="w-3 h-3 text-[#F56300]" />주 {fmtMin(min)}
    </span>
  );

  return (
    <div className={wrap}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="admin-fit-text text-sm font-bold text-[#1D1D1F]">오늘 출결 현황</h3>
          {data?.today && <span className="text-[10px] font-bold text-[#86868B]">{data.today}</span>}
          {campusFilter !== 'all' && (
            <span className="text-[10px] font-bold text-[#0071E3] bg-blue-50 px-1.5 py-0.5 rounded-full">{campusLabel(campusFilter)}</span>
          )}
        </div>
        <button onClick={load} disabled={loading} className="text-[#86868B] hover:text-[#1D1D1F] disabled:opacity-50" title="출결 새로고침">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2.5">
        <Tile label="등원 중" count={present.length} section="present"
          color="border-emerald-100 bg-emerald-50/60 text-emerald-700 ring-emerald-300"
          icon={<LogIn className="w-4 h-4 text-emerald-600" />} />
        <Tile label="하원" count={left.length} section="left"
          color="border-blue-100 bg-blue-50/50 text-blue-700 ring-blue-300"
          icon={<LogOut className="w-4 h-4 text-blue-600" />} />
        <Tile label="미등원" count={absent.length} section="absent"
          color="border-slate-200 bg-slate-50 text-slate-600 ring-slate-300"
          icon={<UserX className="w-4 h-4 text-slate-500" />} />
      </div>

      {openSection && (
        <div className="mt-3 pt-3 border-t border-black/[0.05] max-h-72 overflow-y-auto -mx-1 px-1">
          {openSection === 'present' && (
            present.length === 0 ? <Empty text="현재 등원 중인 원생이 없습니다." /> :
            present.map((r) => (
              <Row key={r.id} id={r.id}>
                <Name name={r.name} campus={r.campus} />
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-bold text-emerald-600">{r.checkInAt} 등원 · {fmtMin(r.minutesSoFar)}째</span>
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
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-bold text-blue-600">{r.checkInAt}~{r.checkOutAt} · 순공 {fmtMin(r.minutes)}</span>
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
