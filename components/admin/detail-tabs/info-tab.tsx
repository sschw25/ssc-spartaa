'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, KeyRound, Bell, CalendarClock, ClipboardCheck } from 'lucide-react';

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
  campus: string;
  setCampus: (v: string) => void;
  manager: string;
  setManager: (v: string) => void;
  contact: string;
  setContact: (v: string) => void;
  speedMultiplier: number;
  setSpeedMultiplier: (v: number) => void;
  nextConsultationDate: string;
  setNextConsultationDate: (v: string) => void;
  enrollmentEndDate: string;
  setEnrollmentEndDate: (v: string) => void;
  weeklyGradeCheck: boolean;
  setWeeklyGradeCheck: (v: boolean) => void;
  specialNote: string;
  setSpecialNote: (v: string) => void;
  uniqueExams: string[];
  loading: boolean;
  onUpdateInfo: () => void;
  onDeleteStudent: () => void;
  onSetPassword: () => void;
  initialParentPhone?: string;
  initialStudentPhone?: string;
  initialSmsTargets?: SmsTarget[];
  onSaveNotify: (info: { parentPhone: string; studentPhone: string; smsTargets: SmsTarget[] }) => Promise<void>;
}

// 학생 기본정보 탭 (프레젠테이셔널). 상태·핸들러는 부모가 소유하고 props 로 전달.
export function InfoTab({
  name, setName,
  campus, setCampus,
  manager, setManager,
  contact, setContact,
  speedMultiplier, setSpeedMultiplier,
  nextConsultationDate, setNextConsultationDate,
  enrollmentEndDate, setEnrollmentEndDate,
  weeklyGradeCheck, setWeeklyGradeCheck,
  specialNote, setSpecialNote,
  uniqueExams,
  loading,
  onUpdateInfo,
  onDeleteStudent,
  onSetPassword,
  initialParentPhone = '',
  initialStudentPhone = '',
  initialSmsTargets = ['parent'],
  onSaveNotify,
}: InfoTabProps) {
  const [parentPhone, setParentPhone] = useState(initialParentPhone);
  const [studentPhone, setStudentPhone] = useState(initialStudentPhone);
  const [smsTargets, setSmsTargets] = useState<SmsTarget[]>(initialSmsTargets.length ? initialSmsTargets : ['parent']);
  const [savingNotify, setSavingNotify] = useState(false);

  const toggleTarget = (t: SmsTarget) =>
    setSmsTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const saveNotify = async () => {
    setSavingNotify(true);
    try {
      await onSaveNotify({ parentPhone, studentPhone, smsTargets });
    } finally {
      setSavingNotify(false);
    }
  };

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
          <Label htmlFor="edit-speed" className="text-xs font-semibold text-[#1D1D1F]">
            학습 속도 가중치
          </Label>
          <Select value={String(speedMultiplier)} onValueChange={(val) => setSpeedMultiplier(Number(val))}>
            <SelectTrigger id="edit-speed" className="rounded-lg border-black/[0.08] text-xs h-9 bg-white">
              <SelectValue placeholder="가중치 선택" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="0.5" className="text-xs">0.5배속 (매우 느림 / 기초)</SelectItem>
              <SelectItem value="0.8" className="text-xs">0.8배속 (조금 느림)</SelectItem>
              <SelectItem value="1.0" className="text-xs">1.0배속 (보통 / 기본)</SelectItem>
              <SelectItem value="1.2" className="text-xs">1.2배속 (조금 빠름)</SelectItem>
              <SelectItem value="1.5" className="text-xs">1.5배속 (매우 빠름)</SelectItem>
            </SelectContent>
          </Select>
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

        <label
          className={`col-span-2 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
            weeklyGradeCheck ? 'border-[#0071E3]/30 bg-[#0071E3]/[0.06]' : 'border-black/[0.06] bg-[#F5F5F7]'
          }`}
        >
          <input
            id="edit-weekly-grade"
            type="checkbox"
            checked={weeklyGradeCheck}
            onChange={(e) => setWeeklyGradeCheck(e.target.checked)}
            className="mt-0.5 accent-[#0071E3] w-3.5 h-3.5"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs font-semibold text-[#1D1D1F]">
              <ClipboardCheck className={`w-3.5 h-3.5 ${weeklyGradeCheck ? 'text-[#0071E3]' : 'text-[#86868B]'}`} />
              매주 성적 입력 대상
            </span>
            <span className="mt-0.5 block text-[10px] font-normal leading-relaxed text-[#86868B]">
              체크 시 이번 주(월~일) 성적 미입력이면 관리자 대시보드와 학생 출결 화면에 알림이 표시됩니다.
            </span>
          </span>
        </label>

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
          <Button
            onClick={saveNotify}
            disabled={savingNotify}
            size="sm"
            className="ml-auto rounded-lg text-xs h-8 px-4 bg-[#0071E3] hover:bg-[#0077ED] text-white font-bold"
          >
            {savingNotify ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '알림 설정 저장'}
          </Button>
        </div>
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
