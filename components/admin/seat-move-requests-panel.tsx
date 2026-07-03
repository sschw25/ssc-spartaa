'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Armchair, Loader2 } from 'lucide-react';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import type { SeatMoveRequest } from '@/lib/types/student';
import type { CampusKey } from '@/lib/seat-layouts';

// 출결판 상단 자리이동 신청 패널 — 대기 건이 있을 때만 렌더.
// 승인 시 학생 좌석번호가 실제로 이동하므로 onApproved 로 보드 데이터를 리로드한다.
export function SeatMoveRequestsPanel({
  campus,
  disabled,
  onApproved,
}: {
  campus: CampusKey;
  disabled?: boolean; // 데모 모드 등 — fetch 하지 않음
  onApproved: () => void;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [requests, setRequests] = useState<SeatMoveRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (disabled) return;
    try {
      const res = await fetch(`/api/admin/seat-moves?campus=${campus}`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) setRequests(json.requests || []);
    } catch {
      // 조용히 무시 — 패널은 보조 정보라 보드 로딩을 방해하지 않는다.
    }
  }, [campus, disabled]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  const pending = requests.filter((r) => r.status === 'pending');
  if (pending.length === 0) return null;

  async function approve(r: SeatMoveRequest) {
    const ok = await confirm({
      title: `${r.studentName} 학생을 ${r.toSeat}번 자리로 옮길까요?`,
      description: `${r.fromSeat != null ? `${r.fromSeat}번` : '미배정'} → ${r.toSeat}번 · 승인 즉시 좌석이 이동됩니다.`,
      confirmText: '승인',
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/admin/seat-moves/${encodeURIComponent(r.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ campus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '승인에 실패했습니다.');
      toast.success(`${r.studentName} 학생 좌석을 ${r.toSeat}번으로 이동했습니다.`);
      await load();
      onApproved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '승인에 실패했습니다.');
      await load(); // 이미 처리됐거나 좌석이 선점된 경우 최신 상태로.
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: SeatMoveRequest) {
    const reason = await prompt({
      title: `${r.studentName} 학생의 자리이동 신청을 거절할까요?`,
      description: '사유는 학생 신청 카드에 표시됩니다. (선택)',
      placeholder: '예: 해당 좌석은 곧 배정 예정이에요.',
      confirmText: '거절',
      tone: 'danger',
      allowEmpty: true,
    });
    if (reason === null) return;
    setBusyId(r.id);
    try {
      const qs = new URLSearchParams({ campus, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      const res = await fetch(`/api/admin/seat-moves/${encodeURIComponent(r.id)}?${qs}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '거절 처리에 실패했습니다.');
      toast.success('자리이동 신청을 거절했습니다.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '거절 처리에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] px-3 py-2.5 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-[#0071E3]">
        <Armchair className="h-3.5 w-3.5" />
        자리이동 신청 {pending.length}건
      </p>
      <div className="flex flex-wrap gap-2">
        {pending.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-black text-slate-900">{r.studentName}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
              {r.fromSeat != null ? `${r.fromSeat}번` : '미배정'}
              <ArrowRight className="h-3 w-3" />
              <span className="text-[#0071E3]">{r.toSeat}번</span>
            </span>
            {busyId === r.id ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#0071E3]" />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => approve(r)}
                  className="rounded-full bg-[#0071E3] px-2.5 py-1 text-[11px] font-black text-white transition active:scale-95"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={() => reject(r)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:text-red-600"
                >
                  거절
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
