'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  SCHEDULED_JOBS, WEEKDAY_LABELS, normalizeJobConfig,
  type JobConfigMap, type JobSchedule,
} from '@/lib/scheduled-jobs';

type ScheduledJobsPanelProps = {
  /** 표시할 잡 id 목록 — 생략하면 전체. 기능 페이지에 해당 잡만 임베드할 때 사용. */
  jobIds?: string[];
  /** 컴팩트 표시 — 기능 페이지 하단 임베드용(안내문·여백 축소). */
  compact?: boolean;
  /** 기능 페이지 임베드에서 기본은 버튼만 보이고, 클릭 시 설정 패널을 연다. */
  collapsible?: boolean;
  triggerLabel?: string;
  /** 패널 자체 제목/부제 숨김 — 페이지가 이미 같은 제목을 크게 표시할 때(/admin/schedules) 중복 방지. */
  hideHeading?: boolean;
};

// 관리자: 예약 스케줄(자동 작업 실행 요일·시각·on/off) 설정 패널. 자기완결(fetch/save 자체 처리).
// 전체 화면(/admin/schedules)과 각 기능 페이지 임베드(jobIds 필터)가 공유한다.
// 저장은 표시 중인 잡만 PUT하고 서버가 부분 병합 — 오래 열어둔 임베드 화면이 저장해도
// 그 사이 다른 화면/관리자가 바꾼 나머지 잡 설정을 stale 스냅샷으로 되돌리지 않는다.
export function ScheduledJobsPanel({
  jobIds,
  compact = false,
  collapsible = false,
  triggerLabel = '예약 확인',
  hideHeading = false,
}: ScheduledJobsPanelProps) {
  const [config, setConfig] = useState<JobConfigMap>(() => normalizeJobConfig(null));
  const [runs, setRuns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!collapsible);

  const visibleJobs = useMemo(
    () => (jobIds ? SCHEDULED_JOBS.filter((j) => jobIds.includes(j.id)) : SCHEDULED_JOBS),
    [jobIds],
  );
  const partial = !!jobIds; // 일부만 표시 중 → 전체 관리 화면 링크 노출

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/scheduled-jobs', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfig(normalizeJobConfig(json.config));
        setRuns(json.runs && typeof json.runs === 'object' ? json.runs : {});
      } else {
        // 401 등 — 기본값을 실제 설정처럼 보여주지 않도록 에러를 표면화
        toast.error(json?.message || '예약 스케줄을 불러오지 못했습니다.');
      }
    } catch {
      toast.error('예약 스케줄을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [load, open]);

  const update = (id: string, patch: Partial<JobSchedule>) => {
    setConfig((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // 표시 중인 잡만 전송 — 서버가 부분 병합하므로 숨은 잡의 stale 값이 함께 저장되지 않는다.
      const visibleConfig = Object.fromEntries(visibleJobs.map((j) => [j.id, config[j.id]]));
      const res = await fetch('/api/admin/scheduled-jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: visibleConfig }),
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

  if (collapsible && !open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-[12px] font-medium text-[#0071E3] transition-colors hover:bg-[#0071E3]/10"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {triggerLabel}
        </button>
      </div>
    );
  }

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'}`}>
      <div className={`flex items-center gap-3 ${hideHeading ? 'justify-end' : 'justify-between'}`}>
        {!hideHeading && (
        <div className="flex items-start gap-2.5 min-w-0">
          <CalendarClock className={`text-[#0071E3] shrink-0 mt-0.5 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          <div className="min-w-0">
            <h2 className={`font-semibold text-slate-800 ${compact ? 'text-[13px]' : 'text-sm'}`}>
              {partial ? '자동 실행 예약' : '예약 스케줄'}
            </h2>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
              {compact
                ? '실행 요일·시각 설정(KST) · 실행은 최대 +15분 지연될 수 있습니다.'
                : '자동 작업의 실행 요일·시각을 설정합니다(KST). 15분마다 점검해 설정 시각 이후 실행됩니다.'}
            </p>
          </div>
        </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {collapsible && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              예약 닫기
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={save}
            className="h-9 rounded-xl bg-[#0071E3] px-3.5 text-xs font-bold text-white hover:bg-[#0077ED] disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            {dirty ? '저장' : '저장됨'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={compact ? 'py-6 text-center' : 'py-10 text-center'}>
          <Loader2 className="w-5 h-5 animate-spin text-[#0071E3] mx-auto" />
        </div>
      ) : (
        <div className={`space-y-2.5 ${compact ? 'mt-3' : 'mt-4'}`}>
          {visibleJobs.map((meta) => {
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
                      <h3 className="text-[13px] font-semibold text-slate-800">{meta.label}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{typeLabel}</span>
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
                      <span className="text-[11px] font-semibold text-slate-500">요일</span>
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
                      <span className="text-[11px] font-semibold text-slate-500">날짜</span>
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
                    <span className="text-[11px] font-semibold text-slate-500">시각</span>
                    <input
                      type="time"
                      value={c.time}
                      onChange={(e) => update(meta.id, { time: e.target.value })}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:border-[#0071E3] focus:outline-none"
                    />
                  </label>
                  {runs[meta.id] && (
                    <span className="text-[11px] font-semibold text-slate-400 ml-auto self-center">마지막 실행: {runs[meta.id]}</span>
                  )}
                </div>
              </div>
            );
          })}
          {visibleJobs.some((j) => j.type === 'monthly') && (
            <p className="text-[11px] font-semibold text-slate-400 leading-relaxed pt-1">
              월간 정산은 실행일과 무관하게 항상 &lsquo;지난달&rsquo; 전체를 평가합니다. 실행 시각은 최대 +15분 지연될 수 있습니다.
            </p>
          )}
          {partial && (
            <p className="text-[11px] font-semibold text-slate-400 pt-1">
              전체 예약 스케줄은{' '}
              <Link href="/admin/schedules" className="font-bold text-[#0071E3] underline underline-offset-2">
                예약 스케줄 메뉴
              </Link>
              에서 한 번에 관리할 수 있습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
