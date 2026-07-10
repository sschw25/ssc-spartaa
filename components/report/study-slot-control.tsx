'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { STUDY_SLOT_OPTIONS, formatSlotLabel, isTimeSlot, parseTimeSlot, timeSlotPeriodKeys } from '@/lib/academy-timetable';

// 드롭다운에서 "시간 직접지정"을 고르면 시작·종료 시간 입력이 나타나 t:HH:MM-HH:MM 으로 저장하는 컨트롤.
// 홈 '오늘 할 일'의 시간표 배치 등에서 재사용. 저장은 상위 saveStudySlot 콜백으로 위임.
const TIME_SENTINEL = '__time__';

const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function describePeriods(slot: string): string {
  const keys = timeSlotPeriodKeys(slot);
  if (!keys.length) return '';
  const first = formatSlotLabel(keys[0]);
  const last = formatSlotLabel(keys[keys.length - 1]);
  return keys.length === 1 ? first : `${first}~${last}`;
}

export function StudySlotControl({
  materialType,
  materialId,
  current,
  saving,
  onSave,
  label = '시간표 배치',
}: {
  materialType: 'book' | 'lecture';
  materialId: string;
  current: string;
  saving: boolean;
  onSave: (materialType: 'book' | 'lecture', materialId: string, slot: string) => Promise<boolean>;
  label?: string;
}) {
  const parsed = parseTimeSlot(current);
  const [mode, setMode] = useState<'select' | 'time'>(isTimeSlot(current) ? 'time' : 'select');
  const [startT, setStartT] = useState(parsed ? fromMin(parsed.startMin) : '13:50');
  const [endT, setEndT] = useState(parsed ? fromMin(parsed.endMin) : '15:00');

  // 다른 자료로 바뀌면 입력·모드 동기화.
  useEffect(() => {
    const p = parseTimeSlot(current);
    setMode(isTimeSlot(current) ? 'time' : 'select');
    if (p) { setStartT(fromMin(p.startMin)); setEndT(fromMin(p.endMin)); }
  }, [materialId, current]);

  const timeValue = `t:${startT}-${endT}`;
  const timeValid = !!startT && !!endT && startT < endT;
  const periodHint = timeValid ? describePeriods(timeValue) : '';
  const savable = timeValid && periodHint !== '';

  const persist = async (slot: string, okMsg: string) => {
    const ok = await onSave(materialType, materialId, slot);
    if (ok) toast.success(okMsg);
    else toast.error('시간표 배치에 실패했어요. 다시 시도해 주세요.');
  };

  return (
    <div className="inline-flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Clock className="h-3.5 w-3.5 text-[#0071E3]" />
          {label}
        </label>
        {mode === 'select' ? (
          <select
            value={isTimeSlot(current) ? current : (current || '')}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value;
              if (next === TIME_SENTINEL) { setMode('time'); return; }
              void persist(next, next ? `${formatSlotLabel(next)}에 배치했어요.` : '시간표에서 내렸어요.');
            }}
            className="h-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-2.5 text-[12px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
          >
            {isTimeSlot(current) && (
              <option value={current}>{formatSlotLabel(current)} (직접지정)</option>
            )}
            {STUDY_SLOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            <option value={TIME_SENTINEL}>시간 직접지정…</option>
          </select>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <input
              type="time"
              value={startT}
              disabled={saving}
              onChange={(e) => setStartT(e.target.value)}
              className="h-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 text-[12px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
            />
            <span className="text-slate-400">~</span>
            <input
              type="time"
              value={endT}
              disabled={saving}
              onChange={(e) => setEndT(e.target.value)}
              className="h-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-1.5 text-[12px] font-semibold text-slate-900 dark:text-slate-100 focus:border-[#0071E3] focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              disabled={saving || !savable}
              onClick={() => void persist(timeValue, `${periodHint || '해당 시간'}에 배치했어요.`)}
              className="h-8 rounded-xl bg-[#0071E3] px-3 text-[11px] font-semibold text-white transition hover:bg-[#0077ED] active:scale-95 disabled:opacity-40"
            >
              적용
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setMode('select')}
              className="h-8 rounded-xl border border-slate-200 dark:border-white/10 px-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 disabled:opacity-40"
            >
              교시 선택
            </button>
          </span>
        )}
      </div>
      {mode === 'time' && (
        <p className="break-keep pl-1 text-[10px] font-medium text-slate-400 dark:text-slate-400">
          {!timeValid
            ? '시작 시간이 끝 시간보다 빨라야 해요.'
            : periodHint
              ? `${periodHint}에 배치돼요.`
              : '겹치는 교시가 없어요. 학원 시간(08:20~23:20) 안으로 맞춰 주세요.'}
        </p>
      )}
    </div>
  );
}
