'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    <div className="border border-amber-200/70 rounded-2xl bg-gradient-to-br from-white to-amber-50/40 p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.025)]">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-semibold text-[#1D1D1F]">
            미등원 알림 {checkpoint && <span className="text-[#86868B] font-medium">({checkpoint} 기준)</span>}
          </h3>
        </div>
        <button
          onClick={load}
          className="text-[#86868B] hover:text-[#0071E3] transition-colors"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="px-1 text-[10px] text-[#86868B] mb-2">
        등원 마감 시각이 지났는데 아직 등원하지 않은 학생입니다. (09시 이후 수동 시각 포함)
      </p>
      {filtered.length === 0 ? (
        <p className="text-[11px] font-semibold text-emerald-600 py-5 text-center">
          마감 시각이 지난 미등원 학생이 없습니다. 👍
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectStudentId?.(r.id)}
              className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:border-amber-400 hover:bg-amber-50 transition-colors"
            >
              {r.name}
              <span className="text-[9px] font-semibold text-[#86868B]">{CAMPUS_LABEL[r.campus] || r.campus} · {r.expectedArrival}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
