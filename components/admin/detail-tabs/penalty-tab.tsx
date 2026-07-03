'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import type { Student } from '@/lib/types/student';

interface PenaltyTabProps {
  student: Student;
  onUpdate: (updated: Student) => void;
}

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

export function PenaltyTab({ student, onUpdate }: PenaltyTabProps) {
  const [date, setDate] = useState(TODAY);
  const [points, setPoints] = useState(1);
  const [reason, setReason] = useState('');
  const [type, setType] = useState<'penalty' | 'bonus'>('penalty');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const penalties = [...(student.penalties || [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const totalPenalty = penalties.reduce(
    (sum, p) => sum + (p.type === 'penalty' ? p.points : -p.points),
    0
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error('사유를 입력해주세요.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/students/${student.id}/penalty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, points, reason: reason.trim(), type, awardedBy: '관리자' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${type === 'penalty' ? '벌점' : '상점'} ${points}점 부여되었습니다.`);
        onUpdate({ ...student, penalties: [...(student.penalties || []), json.record] });
        setReason('');
        setPoints(1);
      } else {
        toast.error(json.message || '저장 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (penaltyId: string) => {
    setDeleting(penaltyId);
    try {
      const res = await fetch(
        `/api/admin/students/${student.id}/penalty?penaltyId=${encodeURIComponent(penaltyId)}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        toast.success('삭제되었습니다.');
        onUpdate({ ...student, penalties: (student.penalties || []).filter((p) => p.id !== penaltyId) });
      } else {
        toast.error(json.message || '삭제 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 합계 배지 */}
      <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 border ${
        totalPenalty > 0
          ? 'bg-red-50 border-red-200/60'
          : totalPenalty < 0
          ? 'bg-emerald-50 border-emerald-200/60'
          : 'bg-[#F5F5F7] border-black/[0.05]'
      }`}>
        <Shield className={`w-6 h-6 shrink-0 ${
          totalPenalty > 0 ? 'text-red-500' : totalPenalty < 0 ? 'text-emerald-500' : 'text-slate-400'
        }`} />
        <div>
          <p className="text-xs font-bold text-slate-500">누적 벌점</p>
          <p className={`text-[18px] font-semibold tracking-tight ${
            totalPenalty > 0 ? 'text-red-600' : totalPenalty < 0 ? 'text-emerald-600' : 'text-slate-400'
          }`}>
            {totalPenalty > 0 ? `+${totalPenalty}` : totalPenalty}점
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-bold text-slate-400">벌점 {penalties.filter((p) => p.type === 'penalty').reduce((s, p) => s + p.points, 0)}점</p>
          <p className="text-xs font-bold text-slate-400">상점 {penalties.filter((p) => p.type === 'bonus').reduce((s, p) => s + p.points, 0)}점</p>
        </div>
      </div>

      {/* 등록 폼 */}
      <form onSubmit={handleAdd} className="rounded-2xl border border-black/[0.05] bg-[#F5F5F7] p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-900">벌점 · 상점 부여</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('penalty')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold border transition ${
              type === 'penalty'
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-red-300'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" /> 벌점
          </button>
          <button
            type="button"
            onClick={() => setType('bonus')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold border transition ${
              type === 'bonus'
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> 상점
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-400 mb-1 block">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="w-24">
            <label className="text-[10px] font-bold text-slate-400 mb-1 block">점수</label>
            <input
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(e) => setPoints(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 mb-1 block">사유</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="예: 수업 중 핸드폰 사용"
            maxLength={100}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-slate-400 focus:outline-none"
          />
        </div>
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className="w-full rounded-xl text-xs font-semibold h-9"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
          {type === 'penalty' ? '벌점' : '상점'} 부여
        </Button>
      </form>

      {/* 내역 */}
      <div className="rounded-2xl border border-black/[0.05] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.04] bg-[#F5F5F7]">
          <p className="text-xs font-semibold text-slate-900">내역 ({penalties.length}건)</p>
        </div>
        {penalties.length === 0 ? (
          <div className="py-10 text-center text-xs font-bold text-slate-400">
            아직 벌점 · 상점 내역이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {penalties.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 group">
                <span className={`shrink-0 grid w-10 h-10 place-items-center rounded-xl text-sm font-semibold ${
                  p.type === 'penalty' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {p.type === 'penalty' ? '+' : '-'}{p.points}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{p.reason}</p>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {p.date} · {p.awardedBy}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  disabled={deleting === p.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                >
                  {deleting === p.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
