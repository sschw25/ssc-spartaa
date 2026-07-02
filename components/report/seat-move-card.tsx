'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Armchair, Loader2, X } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { CAMPUS_LAYOUTS, isCampusKey, type CampusKey } from '@/lib/seat-layouts';

interface SeatMoveClientRequest {
  id: string;
  fromSeat: number | null;
  toSeat: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  processedAt?: string;
  rejectReason?: string;
}

interface SeatMoveData {
  campus: CampusKey;
  mySeat: number | null;
  occupied: number[];
  pendingSeats: number[];
  myRequest: SeatMoveClientRequest | null;
}

// 자리이동 신청 카드 — 배치도(익명: 좌석번호만, 점유석 회색)에서 빈자리를 골라 신청한다.
// 데이터는 자체 fetch(/api/student/seat-move) — use-report-state 를 건드리지 않는다.
export function SeatMoveCard({ campus, active }: { campus: string; active: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<SeatMoveData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const hasLayout = isCampusKey(campus);

  // setState 는 전부 첫 await 이후 — effect 내 동기 setState(캐스케이드 렌더) 회피.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/student/seat-move');
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setData({
          campus: json.campus,
          mySeat: json.mySeat ?? null,
          occupied: Array.isArray(json.occupied) ? json.occupied : [],
          pendingSeats: Array.isArray(json.pendingSeats) ? json.pendingSeats : [],
          myRequest: json.myRequest ?? null,
        });
      }
    } catch {
      // 조용히 무시 — finally 의 loaded 마킹으로 무한 스피너를 막는다.
    } finally {
      setLoaded(true);
    }
  }, []);

  // 신청 탭이 처음 열릴 때 로드(모든 학생이 홈 진입 시 불필요한 fetch 를 하지 않게).
  useEffect(() => {
    if (!(active && hasLayout && !loaded)) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await refresh();
    })();
    return () => { cancelled = true; };
  }, [active, hasLayout, loaded, refresh]);

  const occupiedSet = useMemo(() => new Set(data?.occupied ?? []), [data]);
  const pendingSet = useMemo(() => new Set(data?.pendingSeats ?? []), [data]);

  if (!hasLayout) return null;

  const request = data?.myRequest ?? null;

  async function pickSeat(seat: number) {
    if (!data || submitting) return;
    const ok = await confirm({
      title: `${seat}번 자리로 이동을 신청할까요?`,
      description: '학원 확인 후 승인되면 좌석이 옮겨져요.',
      confirmText: '신청',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/seat-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSeat: seat }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '신청에 실패했습니다.');
      toast.success(`${seat}번 자리로 이동을 신청했어요. 승인을 기다려 주세요.`);
      setPickerOpen(false);
      await refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '신청에 실패했습니다.');
      await refresh(); // 다른 학생 선점 등 — 최신 배치도로 갱신.
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest(id: string, processed: boolean) {
    if (!processed) {
      const ok = await confirm({
        title: '자리이동 신청을 취소할까요?',
        confirmText: '신청 취소',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/student/seat-move?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || '처리에 실패했습니다.');
      if (!processed) toast.success('자리이동 신청을 취소했어요.');
      await refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '처리에 실패했습니다.');
    }
  }

  const statusBadge = (() => {
    if (!request) return null;
    if (request.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> 승인 대기중
        </span>
      );
    }
    if (request.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> 승인 완료
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-black text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> 반려
      </span>
    );
  })();

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#0071E3]">
            <Armchair className="h-3.5 w-3.5" /> 자리이동
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-900">자리이동 신청</h3>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
            배치도에서 빈자리를 골라 신청하면 학원 확인 후 좌석이 옮겨져요.
            {data?.mySeat != null && (
              <> 현재 내 자리 <span className="font-black text-[#0071E3]">{data.mySeat}번</span></>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!loaded) refresh();
            setPickerOpen(true);
          }}
          disabled={Boolean(request && request.status === 'pending')}
          className="shrink-0 rounded-full bg-[#0071E3] px-4 py-2.5 text-xs font-black text-white shadow-[0_6px_16px_rgba(0,113,227,0.22)] transition active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          자리 선택하기
        </button>
      </div>

      {/* 내 신청 현황 */}
      {request && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
          {statusBadge}
          <p className="text-xs font-bold text-slate-700">
            {request.fromSeat != null ? `${request.fromSeat}번` : '미배정'} → {request.toSeat}번
          </p>
          {request.status === 'rejected' && request.rejectReason && (
            <p className="w-full text-[11px] font-semibold text-slate-500">사유: {request.rejectReason}</p>
          )}
          {request.status === 'approved' && (
            <p className="w-full text-[11px] font-semibold text-emerald-700">좌석이 {request.toSeat}번으로 이동되었어요.</p>
          )}
          <button
            type="button"
            onClick={() => cancelRequest(request.id, request.status !== 'pending')}
            className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-500 transition hover:text-slate-800"
          >
            {request.status === 'pending' ? '신청 취소' : '확인'}
          </button>
        </div>
      )}

      {/* 좌석 선택 모달 — 익명 배치도(좌석번호만, 이름 없음) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" onClick={() => setPickerOpen(false)}>
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h4 className="text-base font-black text-slate-900">자리 선택</h4>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">회색은 사용 중이거나 신청된 자리예요. 빈자리를 눌러 신청하세요.</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!loaded ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
              </div>
            ) : !data ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
                <p className="text-xs font-semibold text-slate-400">배치도를 불러오지 못했어요.</p>
                <button
                  type="button"
                  onClick={() => { setLoaded(false); }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:border-[#0071E3] hover:text-[#0071E3]"
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <>
                {/* 페이지(층/구역) 탭 */}
                {CAMPUS_LAYOUTS[data.campus].length > 1 && (
                  <div className="flex gap-1.5 px-5 pt-3">
                    {CAMPUS_LAYOUTS[data.campus].map((page, i) => (
                      <button
                        key={page.label}
                        type="button"
                        onClick={() => setPageIdx(i)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${pageIdx === i ? 'bg-[#0071E3] text-white' : 'border border-slate-200 bg-white text-slate-500'}`}
                      >
                        {page.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="overflow-auto px-5 py-4">
                  {(() => {
                    const page = CAMPUS_LAYOUTS[data.campus][Math.min(pageIdx, CAMPUS_LAYOUTS[data.campus].length - 1)];
                    const cols = Math.max(...page.rows.map((r) => r.length));
                    return (
                      <div className="min-w-fit space-y-1">
                        {page.rows.map((row, ri) => (
                          <React.Fragment key={ri}>
                            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(1.9rem, 1fr))` }}>
                              {Array.from({ length: cols }).map((_, ci) => {
                                const cell = row[ci] ?? null;
                                if (cell == null) return <div key={ci} />;
                                const isMine = data.mySeat === cell;
                                const isOccupied = occupiedSet.has(cell);
                                const isRequested = pendingSet.has(cell);
                                const disabled = isMine || isOccupied || isRequested || submitting;
                                return (
                                  <button
                                    key={ci}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => pickSeat(cell)}
                                    aria-label={isMine ? `${cell}번 (내 자리)` : isOccupied ? `${cell}번 (사용 중)` : isRequested ? `${cell}번 (신청됨)` : `${cell}번 자리 신청`}
                                    className={`relative flex h-8 items-center justify-center rounded-lg border text-[11px] font-black transition ${
                                      isMine
                                        ? 'border-[#0071E3] bg-[#0071E3] text-white'
                                        : isOccupied || isRequested
                                          ? 'border-slate-200 bg-slate-200 text-slate-400'
                                          : 'border-slate-200 bg-white text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3] active:scale-95'
                                    }`}
                                  >
                                    {cell}
                                    {isRequested && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />}
                                  </button>
                                );
                              })}
                            </div>
                            {page.hallwayAfterRow === ri && (
                              <div className="flex items-center justify-between px-1 py-1.5 text-[10px] font-bold text-slate-400">
                                <span>{page.hallwayLabels?.left}</span>
                                <span className="flex-1 border-t border-dashed border-slate-200 mx-2" />
                                <span>{page.hallwayLabels?.center}</span>
                                <span className="flex-1 border-t border-dashed border-slate-200 mx-2" />
                                <span>{page.hallwayLabels?.right}</span>
                              </div>
                            )}
                            {page.separatorAfterRow === ri && <div className="h-3" />}
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 text-[10px] font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-[#0071E3] bg-[#0071E3]" /> 내 자리</span>
                  <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-200" /> 사용 중·신청됨</span>
                  <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-200 bg-white" /> 신청 가능</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
