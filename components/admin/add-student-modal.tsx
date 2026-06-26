'use client';

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Bell, CalendarClock, ClipboardCheck, ClipboardPaste, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import type { AwaySchedule, Student } from '@/lib/types/student';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStudent: Student) => void;
  students?: Student[];
}

type Mode = 'single' | 'bulk';
type SmsTarget = 'parent' | 'student';

interface BulkRow {
  seatNumber: string;
  name: string;
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function parsePasteText(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split('\t');
      const seatNumber = (cols[0] ?? '').trim();
      const name = (cols[1] ?? '').trim();
      return { seatNumber, name };
    })
    .filter((r) => r.name);
}

function normalizeSeatNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function AddStudentModal({ isOpen, onClose, onSuccess, students = [] }: AddStudentModalProps) {
  const [mode, setMode] = useState<Mode>('single');

  // ── 개별 등록 상태 ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [campus, setCampus] = useState('wonju');
  const [manager, setManager] = useState('');
  const [contact, setContact] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [nextConsultationDate, setNextConsultationDate] = useState('');
  const [enrollmentEndDate, setEnrollmentEndDate] = useState('');
  const [weeklyGradeCheck, setWeeklyGradeCheck] = useState(false);
  const [lifeComment, setLifeComment] = useState('');
  const [studentLifeComment, setStudentLifeComment] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [smsTargets, setSmsTargets] = useState<SmsTarget[]>(['parent']);
  const [awaySchedules, setAwaySchedules] = useState<AwaySchedule[]>([]);
  const [newAwayTime, setNewAwayTime] = useState('14:30');
  const [newReturnTime, setNewReturnTime] = useState('');
  const [newDays, setNewDays] = useState<number[]>([]);
  const [newUntilForever, setNewUntilForever] = useState(true);
  const [newUntilDate, setNewUntilDate] = useState('');
  const [loading, setLoading] = useState(false);

  // ── 일괄 등록 상태 ──────────────────────────────────────────────
  const [bulkCampus, setBulkCampus] = useState('wonju');
  const [bulkManager, setBulkManager] = useState('');
  const [bulkContact, setBulkContact] = useState('');
  const [bulkEnrollmentEndDate, setBulkEnrollmentEndDate] = useState('');
  const [bulkWeeklyGradeCheck, setBulkWeeklyGradeCheck] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);

  const uniqueExams = Array.from(
    new Set(
      students
        .map((s) => s.contact)
        .filter((exam): exam is string => typeof exam === 'string' && exam.trim() !== '')
    )
  );

  function resetAll() {
    setName('');
    setLoginId('');
    setCampus('wonju');
    setManager('');
    setContact('');
    setSeatNumber('');
    setNextConsultationDate('');
    setEnrollmentEndDate('');
    setWeeklyGradeCheck(false);
    setLifeComment('');
    setStudentLifeComment('');
    setSpecialNote('');
    setParentPhone('');
    setStudentPhone('');
    setSmsTargets(['parent']);
    setAwaySchedules([]);
    setNewAwayTime('14:30');
    setNewReturnTime('');
    setNewDays([]);
    setNewUntilForever(true);
    setNewUntilDate('');
    setBulkCampus('wonju');
    setBulkManager('');
    setBulkContact('');
    setBulkEnrollmentEndDate('');
    setBulkWeeklyGradeCheck(false);
    setPasteText('');
    setBulkRows([]);
    setBulkDone(0);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  const toggleSmsTarget = (target: SmsTarget) => {
    setSmsTargets((prev) => {
      const next = prev.includes(target) ? prev.filter((item) => item !== target) : [...prev, target];
      return next.length ? next : ['parent'];
    });
  };

  const toggleAwayDay = (day: number) => {
    setNewDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort()));
  };

  const formatAwayChip = (schedule: AwaySchedule) => {
    const time = schedule.returnTime ? `${schedule.awayTime} ~ ${schedule.returnTime}` : `${schedule.awayTime} (하원)`;
    const days = schedule.days && schedule.days.length > 0
      ? schedule.days.map((day) => DOW_LABELS[day]).join('')
      : '매일';
    const until = schedule.until && schedule.until !== 'forever' ? ` · ~${schedule.until}` : '';
    return `${time} · ${days}${until}`;
  };

  const addAwaySchedule = () => {
    if (!newAwayTime) return;
    const entry: AwaySchedule = {
      awayTime: newAwayTime,
      returnTime: newReturnTime || undefined,
      days: newDays,
      dayMode: 'sun0',
      until: newUntilForever ? 'forever' : (newUntilDate || 'forever'),
    };
    const isDupe = awaySchedules.some(
      (schedule) =>
        schedule.awayTime === entry.awayTime &&
        schedule.returnTime === entry.returnTime &&
        JSON.stringify(schedule.days) === JSON.stringify(entry.days) &&
        schedule.until === entry.until
    );
    if (isDupe) return;
    setAwaySchedules([...awaySchedules, entry]);
    setNewReturnTime('');
    setNewDays([]);
    setNewUntilForever(true);
    setNewUntilDate('');
  };

  // ── 개별 등록 ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('원생 이름을 입력해 주세요.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          loginId: loginId.trim().toLowerCase() || undefined,
          campus,
          manager: manager.trim(),
          contact: contact.trim(),
          seatNumber: normalizeSeatNumber(seatNumber),
          nextConsultationDate: nextConsultationDate || undefined,
          enrollmentEndDate: enrollmentEndDate || undefined,
          weeklyGradeCheck,
          parentPhone: parentPhone.trim(),
          studentPhone: studentPhone.trim(),
          smsTargets,
          lifeComment: lifeComment.trim(),
          studentLifeComment: studentLifeComment.trim(),
          specialNote: specialNote.trim(),
          awaySchedules,
          consultationLogs: [],
          books: [],
          lectures: [],
          grades: [],
          subjects: [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${name} 원생이 성공적으로 등록되었습니다.`);
        onSuccess(data.data);
        resetAll();
        onClose();
      } else {
        toast.error(data.message || '등록에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ── 일괄 등록: 붙여넣기 파싱 ────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    setPasteText(text);
    setBulkRows(parsePasteText(text));
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPasteText(text);
    setBulkRows(parsePasteText(text));
  };

  const removeRow = (idx: number) => {
    setBulkRows((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 일괄 등록: 순차 제출 ────────────────────────────────────────
  const handleBulkSubmit = async () => {
    if (bulkRows.length === 0) { toast.error('등록할 원생이 없습니다.'); return; }
    setBulkLoading(true);
    setBulkDone(0);

    let successCount = 0;
    let lastStudent: Student | null = null;

    for (const row of bulkRows) {
      try {
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            campus: bulkCampus,
            manager: bulkManager.trim(),
            contact: bulkContact.trim(),
            seatNumber: normalizeSeatNumber(row.seatNumber),
            enrollmentEndDate: bulkEnrollmentEndDate || undefined,
            weeklyGradeCheck: bulkWeeklyGradeCheck,
            smsTargets: ['parent'],
            lifeComment: '',
            studentLifeComment: '',
            specialNote: '',
            consultationLogs: [],
            books: [],
            lectures: [],
            grades: [],
            subjects: [],
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
          lastStudent = data.data;
          setBulkDone((n) => n + 1);
        }
      } catch {
        // 개별 실패는 스킵하고 계속
      }
    }

    setBulkLoading(false);
    if (successCount > 0) {
      toast.success(`${successCount}명 원생 등록이 완료되었습니다.`);
      if (lastStudent) onSuccess(lastStudent);
      resetAll();
      onClose();
    } else {
      toast.error('등록에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const campusOptions = [
    { value: 'wonju', label: '원주 캠퍼스' },
    { value: 'chuncheon', label: '춘천 캠퍼스' },
    { value: 'chungju', label: '충주 캠퍼스' },
    { value: 'etc', label: '기타/퇴원' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-black/[0.05] bg-white p-6 sm:max-w-3xl">
        <DialogHeader className="pb-3 pr-8">
          <DialogTitle className="text-lg font-bold text-[#1D1D1F]">신규 원생 등록</DialogTitle>
          <DialogDescription className="text-xs text-[#86868B]">
            학생 정보 탭에서 관리하는 핵심 프로필을 등록 시점에 함께 입력합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 모드 탭 */}
        <div className="inline-flex p-0.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05] mb-4">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'single' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B]'}`}
          >
            개별 등록
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'bulk' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B]'}`}
          >
            <ClipboardPaste className="w-3 h-3" />
            엑셀 일괄 등록
          </button>
        </div>

        {/* ── 개별 등록 ── */}
        {mode === 'single' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-[#1D1D1F]">기본 정보</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-name" className="text-xs font-semibold text-[#1D1D1F]">이름 *</Label>
                  <Input
                    id="new-name"
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-login-id" className="text-xs font-semibold text-[#1D1D1F]">로그인 ID (학생용 포털)</Label>
                  <Input
                    id="new-login-id"
                    placeholder="영어/숫자 조합"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value.trim().toLowerCase())}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-campus" className="text-xs font-semibold text-[#1D1D1F]">소속 센터</Label>
                  <Select value={campus} onValueChange={setCampus}>
                    <SelectTrigger id="new-campus" className="rounded-xl border-black/[0.08] text-xs h-9 bg-white">
                      <SelectValue placeholder="캠퍼스 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {campusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-manager" className="text-xs font-semibold text-[#1D1D1F]">담당 상담자</Label>
                  <Input
                    id="new-manager"
                    placeholder="원주센터장"
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact" className="text-xs font-semibold text-[#1D1D1F]">목표시험</Label>
                  <Input
                    id="new-contact"
                    placeholder="예: 수능, 9급 공무원, 임용"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    list="target-exams-list"
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                  <datalist id="target-exams-list">
                    {uniqueExams.map((exam) => <option key={exam} value={exam} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-seat-number" className="text-xs font-semibold text-[#1D1D1F]">좌석 번호</Label>
                  <Input
                    id="new-seat-number"
                    type="number"
                    min={1}
                    max={99}
                    placeholder="예: 7"
                    value={seatNumber}
                    onChange={(e) => setSeatNumber(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-next-consult" className="text-xs font-semibold text-[#1D1D1F]">다음 상담 예정일</Label>
                  <Input
                    id="new-next-consult"
                    type="date"
                    value={nextConsultationDate}
                    onChange={(e) => setNextConsultationDate(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-enrollment-end" className="flex items-center gap-1 text-xs font-semibold text-[#1D1D1F]">
                    <CalendarClock className="w-3.5 h-3.5 text-[#86868B]" />
                    등록 종료일
                  </Label>
                  <Input
                    id="new-enrollment-end"
                    type="date"
                    value={enrollmentEndDate}
                    onChange={(e) => setEnrollmentEndDate(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                  <p className="text-[10px] text-[#86868B]">종료 3일 전(D-3)부터 학생 출결 화면에 재등록 안내가 표시됩니다.</p>
                </div>
              </div>


            </section>

            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-[#1D1D1F]">출결 알림 문자</h4>
              </div>
              <p className="text-[10px] text-[#86868B]">
                등/하원 시 아래 번호로 자동 발송됩니다. 결과지에는 노출되지 않습니다.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-parent-phone" className="text-xs font-semibold text-[#1D1D1F]">학부모 휴대폰</Label>
                  <Input
                    id="new-parent-phone"
                    placeholder="01012345678"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    inputMode="numeric"
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-student-phone" className="text-xs font-semibold text-[#1D1D1F]">학생 휴대폰</Label>
                  <Input
                    id="new-student-phone"
                    placeholder="01087654321"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    inputMode="numeric"
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[11px] font-semibold text-[#86868B]">수신 대상</span>
                {([
                  { key: 'parent' as const, label: '학부모' },
                  { key: 'student' as const, label: '학생' },
                ]).map((option) => (
                  <label key={option.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={smsTargets.includes(option.key)}
                      onChange={() => toggleSmsTarget(option.key)}
                      className="h-3.5 w-3.5 accent-[#0071E3]"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-[#1D1D1F]">정기 외출 / 빠지는 시간대</h4>
              </div>
              <p className="text-[10px] text-[#86868B]">
                지정된 시간에 출결판 교시 셀 내부에 외출 예정 시각이 자동으로 표시됩니다.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-[#86868B]">외출</span>
                  <Input
                    type="time"
                    value={newAwayTime}
                    onChange={(e) => setNewAwayTime(e.target.value)}
                    className="h-9 w-[128px] min-w-[128px] shrink-0 rounded-xl border-black/[0.08] bg-white text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-[#86868B]">복귀</span>
                  <Input
                    type="time"
                    value={newReturnTime}
                    onChange={(e) => setNewReturnTime(e.target.value)}
                    className="h-9 w-[128px] min-w-[128px] shrink-0 rounded-xl border-black/[0.08] bg-white text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold text-[#86868B]">요일</span>
                <button
                  type="button"
                  onClick={() => setNewDays([])}
                  className={`h-7 rounded-full px-2.5 text-[10px] font-bold transition-all ${
                    newDays.length === 0 ? 'bg-[#0071E3] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  매일
                </button>
                {DOW_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleAwayDay(day)}
                    className={`h-7 w-7 rounded-full text-[10px] font-bold transition-all ${
                      newDays.includes(day)
                        ? 'bg-[#0071E3] text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="shrink-0 text-[11px] font-bold text-[#86868B]">기간</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={newUntilForever}
                    onChange={() => setNewUntilForever(true)}
                    className="accent-[#0071E3]"
                  />
                  <span className="text-[11px] font-semibold text-[#1D1D1F]">계속 반복</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
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
                    className="h-8 max-w-[140px] rounded-xl border-black/[0.08] bg-white text-xs"
                  />
                )}
                <Button
                  type="button"
                  onClick={addAwaySchedule}
                  className="h-8 rounded-xl bg-[#1D1D1F] px-4 text-xs font-bold text-white hover:bg-[#323236]"
                >
                  추가
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {awaySchedules.length > 0 ? (
                  awaySchedules.map((schedule, index) => (
                    <span
                      key={`${schedule.awayTime}-${schedule.returnTime || ''}-${index}`}
                      className="flex items-center gap-1 rounded-full border border-[#0071E3]/20 bg-[#0071E3]/[0.06] px-2.5 py-1 text-[11px] font-bold text-[#0071E3]"
                    >
                      {formatAwayChip(schedule)}
                      <button
                        type="button"
                        onClick={() => setAwaySchedules(awaySchedules.filter((_, itemIndex) => itemIndex !== index))}
                        className="ml-1 rounded-full transition-colors hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="py-1 text-[10px] text-slate-400">등록된 정기 외출 시간대가 없습니다.</p>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <h4 className="text-xs font-bold text-[#1D1D1F]">생활 코멘트 및 내부 메모</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-life-comment" className="text-xs font-semibold text-[#1D1D1F]">학부모 공유용 생활 코멘트</Label>
                  <Textarea
                    id="new-life-comment"
                    placeholder="학부모용 결과지에 표시할 생활 관리 피드백"
                    value={lifeComment}
                    onChange={(e) => setLifeComment(e.target.value)}
                    className="min-h-[78px] rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-student-life-comment" className="text-xs font-semibold text-[#1D1D1F]">학생 공유용 생활 코멘트</Label>
                  <Textarea
                    id="new-student-life-comment"
                    placeholder="학생 본인이 확인할 생활 습관/자습 태도 피드백"
                    value={studentLifeComment}
                    onChange={(e) => setStudentLifeComment(e.target.value)}
                    className="min-h-[78px] rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-special-note" className="text-xs font-semibold text-[#1D1D1F]">특이사항</Label>
                <Textarea
                  id="new-special-note"
                  placeholder="보호자 요청, 연락 가능 시간, 건강/생활 참고사항 등 내부 관리 메모를 입력하세요."
                  value={specialNote}
                  onChange={(e) => setSpecialNote(e.target.value)}
                  className="min-h-[72px] rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs"
                />
                <p className="text-[10px] text-[#86868B]">내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다.</p>
              </div>
            </section>

            <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-black/[0.05] bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl text-xs py-4 bg-white">
                취소
              </Button>
              <Button type="submit" disabled={loading} className="rounded-xl text-xs bg-[#1D1D1F] hover:bg-[#323236] text-white py-4">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />등록 중...</> : '원생 등록'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── 엑셀 일괄 등록 ── */}
        {mode === 'bulk' && (
          <div className="space-y-4">
            {/* 공통 설정 */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.05] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1D1D1F]">캠퍼스</Label>
                <Select value={bulkCampus} onValueChange={setBulkCampus}>
                  <SelectTrigger className="rounded-xl border-black/[0.08] text-xs h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {campusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1D1D1F]">담당 관리자</Label>
                <Input
                  placeholder="원주센터장"
                  value={bulkManager}
                  onChange={(e) => setBulkManager(e.target.value)}
                  className="rounded-xl border-black/[0.08] text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1D1D1F]">목표시험</Label>
                <Input
                  placeholder="수능, 공무원…"
                  value={bulkContact}
                  onChange={(e) => setBulkContact(e.target.value)}
                  list="bulk-exams-list"
                  className="rounded-xl border-black/[0.08] text-xs h-9 bg-white"
                />
                <datalist id="bulk-exams-list">
                  {uniqueExams.map((exam) => <option key={exam} value={exam} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1D1D1F]">등록 종료일</Label>
                <Input
                  type="date"
                  value={bulkEnrollmentEndDate}
                  onChange={(e) => setBulkEnrollmentEndDate(e.target.value)}
                  className="rounded-xl border-black/[0.08] text-xs h-9 bg-white"
                />
              </div>

            </div>

            {/* 붙여넣기 영역 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#1D1D1F]">
                엑셀 데이터 붙여넣기
              </Label>
              <div className="relative">
                <Textarea
                  placeholder={`엑셀에서 A열(학생번호) · B열(이름) 셀을 복사한 뒤 여기에 붙여넣기 (Ctrl+V)\n\n예시:\n101\t홍길동\n102\t김철수\n103\t이영희`}
                  value={pasteText}
                  onChange={handleTextChange}
                  onPaste={handlePaste}
                  className="rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs min-h-[110px] font-mono resize-none"
                />
                {pasteText && (
                  <button
                    type="button"
                    onClick={() => { setPasteText(''); setBulkRows([]); }}
                    className="absolute top-2 right-2 rounded-md p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[#86868B]">
                A열 학생번호 → 좌석번호 자동 매핑 · B열 이름만 있어도 등록 가능
              </p>
            </div>

            {/* 파싱 미리보기 */}
            {bulkRows.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-[#1D1D1F]">
                    등록 예정 {bulkRows.length}명
                  </Label>
                  {bulkLoading && (
                    <span className="text-[10px] text-[#0071E3] font-bold">
                      {bulkDone} / {bulkRows.length} 완료...
                    </span>
                  )}
                </div>
                <div className="rounded-xl border border-black/[0.06] overflow-hidden max-h-[180px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F5F5F7] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-[#86868B] w-16">번호</th>
                        <th className="px-3 py-2 text-left font-bold text-[#86868B]">이름</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, i) => (
                        <tr key={`${row.seatNumber}-${row.name}-${i}`} className="border-t border-black/[0.04] hover:bg-[#F5F5F7]/60">
                          <td className="px-3 py-2 text-[#86868B] font-mono">
                            {row.seatNumber || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#1D1D1F]">{row.name}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeRow(i)}
                              className="text-slate-300 hover:text-red-500 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 진행 바 */}
                {bulkLoading && (
                  <div className="w-full bg-[#F5F5F7] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#0071E3] h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkDone / bulkRows.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-black/[0.05] bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl text-xs py-4 bg-white">
                취소
              </Button>
              <Button
                type="button"
                onClick={handleBulkSubmit}
                disabled={bulkLoading || bulkRows.length === 0}
                className="rounded-xl text-xs bg-[#1D1D1F] hover:bg-[#323236] text-white py-4 gap-1.5"
              >
                {bulkLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />{bulkDone}/{bulkRows.length} 등록 중...</>
                ) : (
                  <><UserPlus className="w-3.5 h-3.5" />{bulkRows.length}명 일괄 등록</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
