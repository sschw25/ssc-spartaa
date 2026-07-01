'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { getCampusLabel } from '@/lib/meal';

interface HealthRow {
  studentId: string;
  name: string;
  campus: string;
  score: number;
  band: 'normal' | 'watch' | 'risk';
  factors: { key: string; label: string; contribution: number }[];
}

const BAND_STYLE: Record<HealthRow['band'], { label: string; cls: string }> = {
  risk: { label: '위험', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
  watch: { label: '주의', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  normal: { label: '정상', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
};

export default function HealthScorePage() {
  const router = useRouter();
  const [rows, setRows] = React.useState<HealthRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adminCampus, setAdminCampus] = React.useState<string>('all');
  const [campusFilter, setCampusFilter] = React.useState<string>('all');

  React.useEffect(() => {
    (async () => {
      const me = await fetch('/api/admin/auth/me');
      if (!me.ok) { router.replace('/admin'); return; }
      const j = await me.json();
      setAdminCampus(j.campus || 'all');
      load('all');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(campus: string) {
    setLoading(true);
    const q = campus && campus !== 'all' ? `?campus=${campus}` : '';
    const res = await fetch(`/api/admin/health-score${q}`, { cache: 'no-store' });
    const j = await res.json();
    setRows(j.data || []);
    setLoading(false);
  }

  const visible = rows.filter((r) => r.band !== 'normal');

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">학생 케어 지수 · 위험 TOP</h1>
        {adminCampus === 'all' && (
          <select
            value={campusFilter}
            onChange={(e) => { setCampusFilter(e.target.value); load(e.target.value); }}
            className="glass rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">전체 캠퍼스</option>
            <option value="wonju">원주</option>
            <option value="chuncheon">춘천</option>
            <option value="chungju">충주</option>
          </select>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">주의·위험 학생이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const b = BAND_STYLE[r.band];
            return (
              <li key={r.studentId} className="glass rounded-2xl p-4 flex items-start gap-4">
                <div className="text-2xl font-bold tabular-nums w-12 text-center">{r.score}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-gray-500">{getCampusLabel(r.campus)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${b.cls}`}>{b.label}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.factors.slice(0, 4).map((f) => (
                      <span key={f.key} className="text-xs px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10">
                        {f.label} +{f.contribution}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
