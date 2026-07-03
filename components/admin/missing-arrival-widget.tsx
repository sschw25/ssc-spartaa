'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface MissingRow {
  id: string;
  name: string;
  campus: string;
  expectedArrival: string;
  deadlineMin: number;
}

const CAMPUS_LABEL: Record<string, string> = { wonju: '원주', chuncheon: '춘천', chungju: '충주' };

// 미등원(노쇼) 알림 위젯 — 등원 마감 시각이 지났는데 아직 안 온 학생.
// 09시 이후 수동 지각기준(예: 09:40) 학생은 수기 체크 사각지대라 여기서 바로 확인 가능.
export function MissingArrivalWidget({
  campusFilter,
  refreshSignal,
  onSelectStudentId,
}: {
  campusFilter: string;
  refreshSignal?: number;
  onSelectStudentId?: (id: string) => void;
}) {
  const [rows, setRows] = useState<MissingRow[]>([]);
  const [checkpoint, setCheckpoint] = useState('');
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/attendance/missing', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setConfigured(json.configured !== false);
        setRows(json.rows || []);
        setCheckpoint(json.checkpoint || '');
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = rows.filter((r) => campusFilter === 'all' || r.campus === campusFilter);

  if (!configured) return null;

  return (
    <div className="admin-fit-box rounded-3xl border border-amber-500/20 bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-left">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-[15px] font-semibold tracking-tight text-slate-900">
            <span>미등원 알림</span>
            {checkpoint && <span className="text-[11px] font-medium text-slate-500">({checkpoint} 기준)</span>}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${filtered.length > 0 ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/12 text-emerald-700'}`}>
            {filtered.length}명
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-black/[0.04] hover:text-[#0071E3]"
            title={collapsed ? '펼치기' : '접기'}
            aria-label={collapsed ? '미등원 알림 펼치기' : '미등원 알림 접기'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={load}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-black/[0.04] hover:text-[#0071E3]"
            title="새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">
            등원 마감 시각이 지났는데 아직 등원하지 않은 학생입니다. (09시 이후 수동 시각 포함)
          </p>
          {filtered.length === 0 ? (
            <p className="text-[11px] font-semibold text-emerald-600 py-5 text-center">
              마감 시각이 지난 미등원 학생이 없습니다.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectStudentId?.(r.id)}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-50"
                >
                  {r.name}
                  <span className="text-[11px] font-semibold text-slate-500">{CAMPUS_LABEL[r.campus] || r.campus} · {r.expectedArrival}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
