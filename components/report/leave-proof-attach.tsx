'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { compressImageToJpeg } from '@/lib/image-compress';
import { proofDeadlineIso, PROOF_WINDOW_HOURS } from '@/lib/leave';

interface LeaveProofAttachProps {
  leaveId: string;
  createdAt: string;          // 신청 시각 — 24h 창 계산 기준
  initialUploadedAt?: string; // 서버 기준 이미 첨부된 시각(있으면 첨부됨 상태로 시작)
}

// 병가·개인사정 휴가에 사진 증빙을 첨부하는 학생용 컨트롤.
// 신청 후 24시간 이내에만 첨부 가능하고, 관리자가 확인하면 서버에서 사진이 즉시 삭제된다.
export function LeaveProofAttach({ leaveId, createdAt, initialUploadedAt }: LeaveProofAttachProps) {
  const [uploadedAt, setUploadedAt] = useState<string | undefined>(initialUploadedAt);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const deadline = useMemo(() => proofDeadlineIso(createdAt), [createdAt]);
  const windowOpen = useMemo(() => (deadline ? Date.now() <= new Date(deadline).getTime() : false), [deadline]);
  const deadlineLabel = useMemo(() => {
    if (!deadline) return '';
    const d = new Date(deadline);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [deadline]);

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!/^image\//.test(file.type)) { toast.error('이미지 파일만 첨부할 수 있어요.'); return; }
    setBusy(true);
    try {
      const blob = await compressImageToJpeg(file, 1600, 0.85); // 영수증 가독성 위해 살짝 크게
      const fd = new FormData();
      fd.append('file', new File([blob], `proof-${leaveId}.jpg`, { type: 'image/jpeg' }));
      fd.append('leaveId', leaveId);
      const res = await fetch('/api/student/leave-proof', { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok && json.success) {
        setUploadedAt(json.uploadedAt || new Date().toISOString());
        toast.success('증빙 사진이 첨부됐어요.', { description: '코멘터가 확인하면 사진은 자동으로 삭제돼요.' });
      } else {
        toast.error(json.message || '첨부에 실패했어요.');
      }
    } catch {
      toast.error('사진 처리에 실패했어요. 다른 사진으로 시도해 주세요.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/student/leave-proof?leaveId=${encodeURIComponent(leaveId)}`, { method: 'DELETE', credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok && json.success) {
        setUploadedAt(undefined);
        toast.success('첨부한 증빙을 삭제했어요.');
      } else {
        toast.error(json.message || '삭제에 실패했어요.');
      }
    } catch {
      toast.error('삭제 중 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  // 첨부됨
  if (uploadedAt) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 break-keep">증빙 사진 첨부됨 · 코멘터 확인 시 자동 삭제돼요</span>
        <button type="button" onClick={handleRemove} disabled={busy} className="shrink-0 text-emerald-600/70 hover:text-red-500 disabled:opacity-50" aria-label="증빙 삭제">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    );
  }

  // 창 만료
  if (!windowOpen) {
    return (
      <p className="mt-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        사진 증빙 첨부 기간({PROOF_WINDOW_HOURS}시간)이 지났어요.
      </p>
    );
  }

  // 첨부 가능
  return (
    <div className="mt-2">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#0071E3]/30 bg-[#0071E3]/[0.04] px-3 py-2 text-[10px] font-black text-[#0071E3] transition hover:bg-[#0071E3]/[0.09] disabled:opacity-50 dark:bg-[#0071E3]/15 dark:hover:bg-[#0071E3]/25"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {busy ? '첨부 중…' : '사진 증빙 첨부'}
      </button>
      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        <CheckCircle2 className="h-3 w-3" /> {deadlineLabel}까지 첨부 가능 · 코멘터 확인 시 자동 삭제
      </p>
    </div>
  );
}
