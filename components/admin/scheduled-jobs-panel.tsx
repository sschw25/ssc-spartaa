'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  SCHEDULED_JOBS, WEEKDAY_LABELS, normalizeJobConfig,
  type JobConfigMap, type JobSchedule,
} from '@/lib/scheduled-jobs';

// 관리자: 예약 스케줄(자동 작업 실행 요일·시각·on/off) 설정 패널. 자기완결(fetch/save 자체 처리).
export function ScheduledJobsPanel() {
  const [config, setConfig] = useState<JobConfigMap>(() => normalizeJobConfig(null));
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/scheduled-jobs', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfig(normalizeJobConfig(json.config));
        setRuns(json.runs && typeof json.runs === 'object' ? json.runs : {});
      }
    } catch {
      toast.error('예약 스케줄을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (id: string, patch: Partial<JobSchedule>) => {
    setConfig((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/scheduled-jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfig(normalizeJobConfig(json.config));
        setDirty(false);
        toast.success('예약 스케줄이 저장되었습니다.');
      } else {
        toast.error(json.message || '저장에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 오류로 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <CalendarClock className="w-5 h-5 text-[#0071E3] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-800">예약 스케줄</h2>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
              자동 작업의 실행 요일·시각을 설정합니다(KST). 15분마다 점검해 설정 시각 이후 실행됩니다.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs h-9 px-3.5 font-bold disabled:opacity-40 shrink-0"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          {dirty ? '저장' : '저장됨'}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-[#0071E3] mx-auto" /></div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {SCHEDULED_JOBS.map((meta) => {
            const c = config[meta.id];
            if (!c) return null;
            const typeLabel = meta.type === 'daily' ? '매일' : meta.type === 'weekly' ? '매주' : '매월';
            return (
              <div
                key={meta.id}
                className={`rounded-xl border p-3.5 transition ${c.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60 opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[13px] font-black text-slate-800">{meta.label}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{typeLabel}</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-relaxed">{meta.description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={c.enabled}
                      onChange={(e) => update(meta.id, { enabled: e.target.checked })} />
                    <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2.5 border-t border-slate-100 pt-3">
                  {meta.type === 'weekly' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">요일</span>
                      <select
                        value={c.weekday}
                        onChange={(e) => update(meta.id, { weekday: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-[#0071E3] focus:outline-none"
                      >
                        {WEEKDAY_LABELS.map((w, i) => <option key={i} value={i}>{w}요일</option>)}
                      </select>
                    </label>
                  )}
                  {meta.type === 'monthly' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">날짜</span>
                      <select
                        value={c.day}
                        onChange={(e) => update(meta.id, { day: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-[#0071E3] focus:outline-none"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">시각</span>
                    <input
                      type="time"
                      value={c.time}
                      onChange={(e) => update(meta.id, { time: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-[#0071E3] focus:outline-none"
                    />
                  </label>
                  {runs[meta.id] && (
                    <span className="text-[10px] font-semibold text-slate-400 ml-auto self-center">마지막 실행: {runs[meta.id]}</span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] font-semibold text-slate-400 leading-relaxed pt-1">
            월간 정산은 실행일과 무관하게 항상 &lsquo;지난달&rsquo; 전체를 평가합니다. 실행 시각은 최대 +15분 지연될 수 있습니다.
          </p>
        </div>
      )}
    </section>
  );
}
