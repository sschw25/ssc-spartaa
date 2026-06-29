'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, KeyRound, Bell, CalendarClock, ClipboardCheck, Link2, Copy, RotateCcw, X } from 'lucide-react';
import type { AwaySchedule } from '@/lib/types/student';

type SmsTarget = 'parent' | 'student';

// 등록 종료일 → 관리자 즉시 피드백용 D-day 칩 (학생 출결 화면 안내 조건과 동일: D-3 이하)
function enrollmentHint(dateStr: string): { label: string; tone: 'ok' | 'warn' | 'expired' } | null {
  if (!dateStr) return null;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const d = Math.round((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(d)) return null;
  if (d < 0) return { label: `만료 ${Math.abs(d)}일 경과`, tone: 'expired' };
  if (d === 0) return { label: '오늘 마감 (D-0)', tone: 'warn' };
  if (d <= 3) return { label: `D-${d} · 학생 안내 표시 중`, tone: 'warn' };
  return { label: `D-${d}`, tone: 'ok' };
}

const hintTone: Record<'ok' | 'warn' | 'expired', string> = {
  ok: 'bg-[#F5F5F7] text-[#6E6E73]',
  warn: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-600',
};

interface InfoTabProps {
  name: string;
  setName: (v: string) => void;
  loginId: string;
  setLoginId: (v: string) => void;
  campus: string;
  setCampus: (v: string) => void;
  manager: string;
  setManager: (v: string) => void;
  contact: string;
  setContact: (v: string) => void;
  nextConsultationDate: string;
  setNextConsultationDate: (v: string) => void;
  enrollmentEndDate: string;
  setEnrollmentEndDate: (v: string) => void;
  weeklyGradeCheck: boolean;
  setWeeklyGradeCheck: (v: boolean) => void;
  specialNote: string;
  setSpecialNote: (v: string) => void;
  seatNumber: string;
  setSeatNumber: (v: string) => void;
  uniqueExams: string[];
  loading: boolean;
  onUpdateInfo: () => void;
  onDeleteStudent: () => void;
  onSetPassword: () => void;
  parentPhone: string;
  setParentPhone: (v: string) => void;
  studentPhone: string;
  setStudentPhone: (v: string) => void;
  smsTargets: SmsTarget[];
  setSmsTargets: React.Dispatch<React.SetStateAction<SmsTarget[]>>;
  studentId?: string;
  shareToken?: string;
  shareTokenExpiresAt?: string;
  sharePassword?: string;
  onGenerateShareToken?: () => Promise<void>;
  onRevokeShareToken?: () => Promise<void>;
  awaySchedules: AwaySchedule[];
  setAwaySchedules: (v: AwaySchedule[]) => void;
}

// 학생 기본정보 탭 (프레젠테이셔널). 상태·핸들러는 부모가 소유하고 props 로 전달.
export function InfoTab({
  name, setName,
  loginId, setLoginId,
  campus, setCampus,
  manager, setManager,
  contact, setContact,
  nextConsultationDate, setNextConsultationDate,
  enrollmentEndDate, setEnrollmentEndDate,
  weeklyGradeCheck, setWeeklyGradeCheck,
  specialNote, setSpecialNote,
  seatNumber,
  setSeatNumber,
  uniqueExams,
  loading,
  onUpdateInfo,
  onDeleteStudent,
  onSetPassword,
  parentPhone,
  setParentPhone,
  studentPhone,
  setStudentPhone,
  smsTargets,
  setSmsTargets,
  studentId,
  shareToken,
  shareTokenExpiresAt,
  sharePassword,
  onGenerateShareToken,
  onRevokeShareToken,
  awaySchedules,
  setAwaySchedules,
}: InfoTabProps) {
  const [sharingLoading, setSharingLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [newAwayTime, setNewAwayTime] = useState('14:30');
  const [newReturnTime, setNewReturnTime] = useState('');
  const [newDays, setNewDays] = useState<number[]>([]);          // [] = 매일
  const [newUntilForever, setNewUntilForever] = useState(true);
  const [newUntilDate, setNewUntilDate] = useState('');

  const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

  const toggleDay = (d: number) =>
    setNewDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());

  const handleAddAwayTime = () => {
    if (!newAwayTime) return;
    const entry: AwaySchedule = {
      awayTime: newAwayTime,
      returnTime: newReturnTime || undefined,
      days: newDays,
      dayMode: 'sun0',
      until: newUntilForever ? 'forever' : (newUntilDate || 'forever'),
    };
    const isDupe = awaySchedules.some(
      (s) => s.awayTime === entry.awayTime && s.returnTime === entry.returnTime
        && JSON.stringify(s.days) === JSON.stringify(entry.days) && s.until === entry.until
    );
    if (isDupe) return;
    setAwaySchedules([...awaySchedules, entry]);
    setNewReturnTime('');
    setNewDays([]);
    setNewUntilForever(true);
    setNewUntilDate('');
  };

  const handleRemoveAwayTime = (idx: number) => {
    setAwaySchedules(awaySchedules.filter((_, i) => i !== idx));
  };

  const formatAwayChip = (s: AwaySchedule) => {
    const time = s.returnTime ? `${s.awayTime} ~ ${s.returnTime}` : `${s.awayTime} (하원)`;
    const dayStr = s.days && s.days.length > 0
      ? s.days.map((d) => DOW_LABELS[d]).join('')
      : '매일';
    const untilStr = s.until && s.until !== 'forever' ? `~${s.until}` : '';
    return `${time} · ${dayStr}${untilStr ? ' · ' + untilStr : ''}`;
  };

  const shareUrl = studentId && shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/report/${studentId}?token=${shareToken}`
    : null;
  const tokenExpired = shareTokenExpiresAt ? shareTokenExpiresAt < new Date().toISOString() : false;
  const tokenValid = shareToken && !tokenExpired;
  const expiryLabel = shareTokenExpiresAt
    ? new Date(shareTokenExpiresAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  async function handleGenerate() {
    if (!onGenerateShareToken) return;
    setSharingLoading(true);
    try { await onGenerateShareToken(); } finally { setSharingLoading(false); }
  }
  async function handleRevoke() {
    if (!onRevokeShareToken) return;
    setSharingLoading(true);
    try { await onRevokeShareToken(); } finally { setSharingLoading(false); }
  }
  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const toggleTarget = (t: SmsTarget) =>
    setSmsTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));



  return (
    <>
      <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name" className="text-xs font-semibold text-[#1D1D1F]">
            이름 *
          </Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-login-id" className="text-xs font-semibold text-[#1D1D1F]">
            로그인 ID (학생용 포털)
          </Label>
          <Input
            id="edit-login-id"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value.trim().toLowerCase())}
            placeholder="영어/숫자 조합"
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-campus" className="text-xs font-semibold text-[#1D1D1F]">
            소속 센터
          </Label>
          <Select value={campus} onValueChange={setCampus}>
            <SelectTrigger id="edit-campus" className="rounded-lg border-black/[0.08] text-xs h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="wonju" className="text-xs">원주 캠퍼스</SelectItem>
              <SelectItem value="chuncheon" className="text-xs">춘천 캠퍼스</SelectItem>
              <SelectItem value="chungju" className="text-xs">충주 캠퍼스</SelectItem>
              <SelectItem value="etc" className="text-xs">기타/퇴원</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-manager" className="text-xs font-semibold text-[#1D1D1F]">
            담당 상담자
          </Label>
          <Input
            id="edit-manager"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-contact" className="text-xs font-semibold text-[#1D1D1F]">
            목표시험
          </Label>
          <Input
            id="edit-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            list="edit-target-exams-list"
            placeholder="예: 수능, 9급 공무원, 임용"
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
          <datalist id="edit-target-exams-list">
            {uniqueExams.map((exam) => (
              <option key={exam} value={exam} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-seat-number" className="text-xs font-semibold text-[#1D1D1F]">
            좌석 번호
          </Label>
          <Input
            id="edit-seat-number"
            type="number"
            min={1}
            max={99}
            value={seatNumber}
            onChange={(e) => setSeatNumber(e.target.value)}
            placeholder="예: 7"
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-next" className="text-xs font-semibold text-[#1D1D1F]">
            다음 상담 예정일
          </Label>
          <Input
            id="edit-next"
            type="date"
            value={nextConsultationDate}
            onChange={(e) => setNextConsultationDate(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-enrollment-end" className="flex items-center gap-1 text-xs font-semibold text-[#1D1D1F]">
              <CalendarClock className="w-3.5 h-3.5 text-[#86868B]" />
              등록 종료일
            </Label>
            {(() => {
              const hint = enrollmentHint(enrollmentEndDate);
              return hint ? (
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${hintTone[hint.tone]}`}>
                  {hint.label}
                </span>
              ) : null;
            })()}
          </div>
          <Input
            id="edit-enrollment-end"
            type="date"
            value={enrollmentEndDate}
            onChange={(e) => setEnrollmentEndDate(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
          />
          <p className="text-[10px] text-[#86868B]">
            종료 3일 전(D-3)부터 학생 출결 화면에 재등록 안내가 표시됩니다.
          </p>
        </div>

        <div className="col-span-2 rounded-lg border border-black/[0.06] bg-[#F5F5F7] px-3 py-2.5">
          <span className="flex items-center gap-1 text-xs font-semibold text-[#1D1D1F]">
            <ClipboardCheck className="w-3.5 h-3.5 text-[#86868B]" />
            모의고사 성적 입력
          </span>
          <span className="mt-0.5 block text-[10px] font-normal leading-relaxed text-[#86868B]">
            모의고사 일정 생성 시 목표시험 유형으로 대상을 선택하면 해당 원생에게 알림이 발송되고, 학생이 직접 성적을 입력합니다.
          </span>
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="edit-special-note" className="text-xs font-semibold text-[#1D1D1F]">
            특이사항
          </Label>
          <Textarea
            id="edit-special-note"
            placeholder="보호자 요청, 연락 가능 시간, 건강/생활 참고사항 등 내부 관리 메모를 입력하세요."
            value={specialNote}
            onChange={(e) => setSpecialNote(e.target.value)}
            className="rounded-lg border-black/[0.08] text-xs bg-white min-h-[78px]"
          />
          <p className="text-[10px] text-[#86868B]">
            내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다.
          </p>
        </div>
      </div>

      {/* 정기 외출 / 빠지는 시간대 관리 */}
      <div className="space-y-3 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-[#0071E3]" />
          <h4 className="text-xs font-bold text-[#1D1D1F]">정기 외출 / 빠지는 시간대 관리</h4>
        </div>
        <p className="text-[10px] text-[#86868B]">
          지정된 시간에 출결판 교시 셀 내부에 외출 예정 시각이 자동으로 표시됩니다. (예: 14:30)
        </p>

        {/* 시간 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-[#86868B]">외출</span>
            <Input
              type="time"
              value={newAwayTime}
              onChange={(e) => setNewAwayTime(e.target.value)}
              className="rounded-lg border-black/[0.08] text-xs h-9 bg-white w-[128px] min-w-[128px] shrink-0"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-[#86868B]">복귀 (선택)</span>
            <Input
              type="time"
              value={newReturnTime}
              onChange={(e) => setNewReturnTime(e.target.value)}
              className="rounded-lg border-black/[0.08] text-xs h-9 bg-white w-[128px] min-w-[128px] shrink-0"
            />
          </div>
        </div>

        {/* 요일 반복 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-[#86868B] shrink-0">요일</span>
          <div className="flex gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setNewDays([])}
              className={`px-2.5 h-7 rounded-full text-[10px] font-bold transition-all ${
                newDays.length === 0 ? 'bg-[#0071E3] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              매일
            </button>
            {DOW_LABELS.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`w-7 h-7 rounded-full text-[10px] font-bold transition-all ${
                  newDays.includes(d)
                    ? 'bg-[#0071E3] text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 기간 */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-bold text-[#86868B] shrink-0">기간</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={newUntilForever}
              onChange={() => setNewUntilForever(true)}
              className="accent-[#0071E3]"
            />
            <span className="text-[11px] font-semibold text-[#1D1D1F]">계속 반복</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              checked={!newUntilForever}
              onChange={() => setNewUntilForever(false)}
              className="accent-[#0071E3]"
            />
            <span className="text-[11px] font-semibold text-[#1D1D1F]">종료일 지정</span>
          </label>
          {!newUntilForever && (
            <Input
              type="date"
              value={newUntilDate}
              onChange={(e) => setNewUntilDate(e.target.value)}
              className="rounded-lg border-black/[0.08] text-xs h-8 bg-white max-w-[140px]"
            />
          )}
        </div>

        <Button
          type="button"
          onClick={handleAddAwayTime}
          className="rounded-lg text-xs h-9 px-4 bg-[#1D1D1F] hover:bg-[#323236] text-white font-bold"
        >
          추가
        </Button>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {awaySchedules && awaySchedules.length > 0 ? (
            awaySchedules.map((s, idx) => (
              <span
                key={idx}
                className="flex items-center gap-1 text-[11px] font-bold text-[#0071E3] bg-[#0071E3]/[0.06] border border-[#0071E3]/20 rounded-full px-2.5 py-1"
              >
                {formatAwayChip(s)}
                <button
                  type="button"
                  onClick={() => handleRemoveAwayTime(idx)}
                  className="hover:text-red-500 rounded-full focus:outline-none transition-colors ml-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          ) : (
            <p className="text-[10px] text-slate-400 py-1">등록된 정기 외출 시간대가 없습니다.</p>
          )}
        </div>
      </div>

      {/* 출결 알림 문자 설정 */}
      <div className="space-y-3 p-4 rounded-xl border border-black/[0.05] bg-white">
        <div className="flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-[#0071E3]" />
          <h4 className="text-xs font-bold text-[#1D1D1F]">출결 알림 문자</h4>
        </div>
        <p className="text-[10px] text-[#86868B]">
          등/하원 시 아래 번호로 자동 발송됩니다. (PII — 결과지엔 노출되지 않음)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#1D1D1F]">학부모 휴대폰</Label>
            <Input
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="01012345678"
              inputMode="numeric"
              className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#1D1D1F]">학생 휴대폰</Label>
            <Input
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              placeholder="01087654321"
              inputMode="numeric"
              className="rounded-lg border-black/[0.08] text-xs h-9 bg-white"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 pt-1">
          <span className="text-[11px] font-semibold text-[#86868B]">수신 대상</span>
          {([
            { key: 'parent' as const, label: '학부모' },
            { key: 'student' as const, label: '학생' },
          ]).map((opt) => (
            <label key={opt.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={smsTargets.includes(opt.key)}
                onChange={() => toggleTarget(opt.key)}
                className="accent-[#0071E3] w-3.5 h-3.5"
              />
              {opt.label}
            </label>
          ))}

        </div>
      </div>

      {/* 학부모 리포트 공유 */}
      <div className="rounded-2xl border border-black/[0.06] bg-[#FAFAFA] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-[#86868B]" />
          <span className="text-[11px] font-semibold tracking-wide text-[#1D1D1F]">학부모 리포트 공유</span>
          {tokenValid && (
            <span className="ml-auto text-[9px] font-semibold text-green-700 bg-green-50 border border-green-200/60 rounded-full px-2 py-0.5">
              활성 · {expiryLabel} 만료
            </span>
          )}
          {shareToken && tokenExpired && (
            <span className="ml-auto text-[9px] font-semibold text-[#86868B] bg-[#F5F5F7] border border-black/[0.06] rounded-full px-2 py-0.5">
              만료됨
            </span>
          )}
        </div>

        {tokenValid && shareUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-white border border-black/[0.08] rounded-xl px-3 py-2">
              <span className="text-[10px] text-[#6E6E73] truncate flex-1 font-mono">{shareUrl}</span>
              <button
                onClick={handleCopy}
                className="shrink-0 p-1 rounded-md hover:bg-[#F5F5F7] transition-colors"
                title="링크 복사"
              >
                {copied
                  ? <span className="text-[9px] font-semibold text-green-600">복사됨!</span>
                  : <Copy className="w-3.5 h-3.5 text-[#86868B]" />
                }
              </button>
            </div>
            {sharePassword && (
              <div className="flex items-center gap-2 bg-[#F5F5F7] rounded-xl px-3 py-2">
                <span className="text-[10px] text-[#86868B] font-semibold">비밀번호</span>
                <span className="text-sm font-semibold tracking-[0.25em] text-[#1D1D1F]">{sharePassword}</span>
                <span className="ml-auto text-[9px] text-[#86868B]">링크와 별도로 전달</span>
              </div>
            )}
            <p className="text-[10px] text-[#86868B]">링크와 비밀번호를 각각 따로 전달해 주세요.</p>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={sharingLoading}
                className="flex items-center gap-1 text-[10px] font-semibold text-[#0071E3] hover:underline disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                새 링크 발급
              </button>
              <button
                onClick={handleRevoke}
                disabled={sharingLoading}
                className="flex items-center gap-1 text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                <X className="w-3 h-3" />
                링크 폐기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-[#86868B]">
              임시 링크를 생성하면 학부모님이 로그인 없이 리포트를 열람할 수 있습니다. 유효 기간은 7일입니다.
            </p>
            <button
              onClick={handleGenerate}
              disabled={sharingLoading || !onGenerateShareToken}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-[#1D1D1F] hover:bg-[#323236] disabled:opacity-50 rounded-xl px-4 py-2 transition-colors"
            >
              {sharingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              링크 생성 (7일 유효)
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 justify-between items-center">
        <Button
          onClick={onSetPassword}
          disabled={loading}
          variant="outline"
          className="rounded-lg text-xs py-4 px-4 border-black/[0.1] bg-white hover:bg-[#F5F5F7] font-bold"
        >
          <KeyRound className="w-3.5 h-3.5 mr-1" />
          포털 비밀번호 설정
        </Button>

        <div className="flex gap-2">
        <Button
          onClick={onDeleteStudent}
          disabled={loading}
          variant="destructive"
          className="rounded-lg text-xs py-4 px-4 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-bold"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          원생 영구 삭제
        </Button>

        <Button
          onClick={onUpdateInfo}
          disabled={loading}
          className="rounded-lg text-xs py-4 px-6 bg-[#1D1D1F] hover:bg-[#323236] text-white font-bold"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              저장 중...
            </>
          ) : (
            '원생 정보 저장'
          )}
        </Button>
        </div>
      </div>
    </>
  );
}
