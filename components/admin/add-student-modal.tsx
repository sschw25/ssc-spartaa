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
import { useConfirm } from '@/components/ui/confirm-dialog';

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
  studentPhone: string;
  parentPhone: string;
  parentSmsFlag: string;
  awayDays: string;
  awayTime: string;
  returnTime: string;
  attendanceCode: string;
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function parsePasteText(text: string): BulkRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split('\t');
      const seatNumber = (cols[0] ?? '').trim();
      const name = (cols[1] ?? '').trim();
      const studentPhone = (cols[2] ?? '').trim();
      const parentPhone = (cols[3] ?? '').trim();
      const parentSmsFlag = (cols[4] ?? '').trim();
      const awayDays = (cols[5] ?? '').trim();
      const awayTime = (cols[6] ?? '').trim();
      const returnTime = (cols[7] ?? '').trim();
      const attendanceCode = (cols[8] ?? '').trim();
      return { seatNumber, name, studentPhone, parentPhone, parentSmsFlag, awayDays, awayTime, returnTime, attendanceCode };
    })
    .filter((r) => r.name);
}

function normalizeSeatNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeTimeValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    const m = Number(colonMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const digitMatch = trimmed.replace(/\D/g, '').match(/^(\d{1,2})(\d{2})$/);
  if (digitMatch) {
    const h = Number(digitMatch[1]);
    const m = Number(digitMatch[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return '';
}

function parseAwayDays(value: string): number[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['매일', 'everyday', 'daily', 'all'].includes(normalized)) return [];
  const dayAliases: Array<[number, string[]]> = [
    [0, ['일', '일요일', 'sun', 'sunday', '0']],
    [1, ['월', '월요일', 'mon', 'monday', '1']],
    [2, ['화', '화요일', 'tue', 'tuesday', '2']],
    [3, ['수', '수요일', 'wed', 'wednesday', '3']],
    [4, ['목', '목요일', 'thu', 'thursday', '4']],
    [5, ['금', '금요일', 'fri', 'friday', '5']],
    [6, ['토', '토요일', 'sat', 'saturday', '6']],
  ];
  const days = new Set<number>();
  const matchToken = (token: string) => {
    dayAliases.forEach(([day, aliases]) => {
      if (aliases.includes(token) || aliases.some((alias) => alias.length > 1 && token.includes(alias))) {
        days.add(day);
      }
    });
  };

  const parts = normalized.split(/[,\s/|·]+/).filter(Boolean);
  if (parts.length > 1) {
    parts.forEach(matchToken);
  } else {
    const token = parts[0] ?? '';
    // 압축형 한글('월수금')만 글자 단위로 분해. 장형('화요일')·영문은 통째로 매칭
    // (장형을 글자 분해하면 '요일'의 '일'이 일요일로 오검출됨)
    if (/^[월화수목금토일]+$/.test(token)) {
      [...token].forEach(matchToken);
    } else {
      matchToken(token);
    }
  }
  return Array.from(days).sort();
}

function buildAwaySchedules(row: BulkRow): AwaySchedule[] {
  const awayTime = normalizeTimeValue(row.awayTime);
  if (!row.awayDays.trim() || !awayTime) return [];
  return [{
    awayTime,
    returnTime: normalizeTimeValue(row.returnTime) || undefined,
    days: parseAwayDays(row.awayDays),
    dayMode: 'sun0',
    until: 'forever',
  }];
}

function parentSmsEnabled(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['n', 'no', 'false', '0', '아니오', '아니요', '미수신'].includes(normalized)) return false;
  return true;
}

export function AddStudentModal({ isOpen, onClose, onSuccess, students = [] }: AddStudentModalProps) {
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode>('single');

  // ── 개별 등록 상태 ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [generatingId, setGeneratingId] = useState(false);
  const [campus, setCampus] = useState('wonju');
  const [manager, setManager] = useState('');
  const [contact, setContact] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [enrollmentEndDate, setEnrollmentEndDate] = useState('');
  const [weeklyGradeCheck, setWeeklyGradeCheck] = useState(false);
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

  // 좌석 충돌 — 같은 센터에 동일 좌석번호를 쓰는 기존 원생(0번/미지정은 충돌 아님)
  const parsedSeat = normalizeSeatNumber(seatNumber);
  const seatConflicts =
    parsedSeat !== undefined && parsedSeat > 0
      ? students.filter((s) => s.campus === campus && s.seatNumber === parsedSeat)
      : [];

  // 담당 상담자 목록 — 기존 학생들에 입력된 담당자에서 추출(선택형 자동완성)
  const uniqueManagers = Array.from(
    new Set(
      students
        .map((s) => s.manager)
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
        .map((m) => m.trim())
    )
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  // 임시 로그인 ID·비밀번호 자동발급 (sparta00001, 전 센터 통합 순차)
  const generateTempCredentials = async () => {
    setGeneratingId(true);
    try {
      const res = await fetch('/api/admin/students/next-login-id');
      const data = await res.json();
      if (res.ok && data.success && data.loginId) {
        setLoginId(data.loginId);
        setPassword(data.loginId); // 임시 비번 = 임시 아이디(로그인 후 변경 안내)
        toast.success(`임시 계정 발급: ${data.loginId}`);
      } else {
        toast.error(data.message || '임시 ID 발급에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setGeneratingId(false);
    }
  };

  function resetAll() {
    setName('');
    setLoginId('');
    setPassword('');
    setCampus('wonju');
    setManager('');
    setContact('');
    setSeatNumber('');
    setEnrollmentEndDate('');
    setWeeklyGradeCheck(false);
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
      return next;
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
    if (password.trim() && password.trim().length < 4) { toast.error('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (seatConflicts.length > 0) {
      const ok = await confirm({
        title: `그래도 ${parsedSeat}번 좌석으로 등록할까요?`,
        description: `이 센터에 이미 ${parsedSeat}번 좌석을 쓰는 원생이 있습니다.\n대상: ${seatConflicts.map((s) => s.name).join(', ')}`,
        confirmText: '등록',
      });
      if (!ok) return;
    }
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
          enrollmentEndDate: enrollmentEndDate || undefined,
          weeklyGradeCheck,
          parentPhone: parentPhone.trim(),
          studentPhone: studentPhone.trim(),
          smsTargets,
          // 생활 코멘트는 추후 상담 시 입력 — 등록 시점엔 내부 메모(특이사항)만
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
        // 비밀번호가 입력된 경우 학생 포털 로그인 비번 설정
        if (password.trim() && data.data?.id) {
          try {
            await fetch(`/api/admin/students/${data.data.id}/password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: password.trim() }),
            });
          } catch {
            toast.error('학생은 등록됐지만 비밀번호 설정에 실패했습니다. 학생 정보에서 다시 설정해 주세요.');
          }
        }
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
    const seatConflictRows = bulkRows
      .map((row, i) => ({ row, conflicts: bulkSeatConflict(i) }))
      .filter((item) => item.conflicts.length > 0);
    if (seatConflictRows.length > 0) {
      const detail = seatConflictRows
        .map((item) => `${item.row.seatNumber}번 ${item.row.name.trim()} ↔ ${item.conflicts.join(', ')}`)
        .join('\n');
      const ok = await confirm({
        title: '좌석번호가 겹치지만 그래도 등록할까요?',
        description: `같은 센터에 좌석번호가 겹치는 원생이 있습니다.\n${detail}`,
        confirmText: '등록',
      });
      if (!ok) return;
    }
    const duplicateAwayNames = bulkRows
      .filter((row) => row.awayDays.trim())
      .filter((row, index, rows) =>
        rows.findIndex((item) => item.name.trim() === row.name.trim()) !== index ||
        students.some((student) => student.name.trim() === row.name.trim())
      );
    if (duplicateAwayNames.length > 0) {
      const names = Array.from(new Set(duplicateAwayNames.map((row) => row.name.trim()))).join(', ');
      const ok = await confirm({
        title: '동명이인 여부를 확인한 뒤 등록할까요?',
        description: `빠지는 요일이 있는 동명이인 또는 기존 원생 이름이 있습니다.\n대상: ${names}\n0번 좌석/동명이인 여부를 확인해 주세요.`,
        confirmText: '등록',
      });
      if (!ok) return;
    }
    setBulkLoading(true);
    setBulkDone(0);

    let successCount = 0;
    let passwordFailCount = 0;
    let lastStudent: Student | null = null;

    for (const row of bulkRows) {
      try {
        const wantsParentSms = parentSmsEnabled(row.parentSmsFlag);
        const smsTargets: SmsTarget[] = wantsParentSms ? ['parent'] : (row.studentPhone.trim() ? ['student'] : []);
        const attendanceCode = row.attendanceCode.trim();
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            loginId: attendanceCode ? attendanceCode.toLowerCase() : undefined,
            campus: bulkCampus,
            manager: bulkManager.trim(),
            contact: bulkContact.trim(),
            seatNumber: normalizeSeatNumber(row.seatNumber),
            enrollmentEndDate: bulkEnrollmentEndDate || undefined,
            weeklyGradeCheck: bulkWeeklyGradeCheck,
            studentPhone: row.studentPhone.trim(),
            parentPhone: row.parentPhone.trim(),
            smsTargets,
            awaySchedules: buildAwaySchedules(row),
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
          if (attendanceCode && data.data?.id) {
            try {
              const pwRes = await fetch(`/api/admin/students/${data.data.id}/password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: attendanceCode }),
              });
              if (!pwRes.ok) passwordFailCount++;
            } catch {
              passwordFailCount++;
            }
          }
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
      toast.success(passwordFailCount > 0
        ? `${successCount}명 등록 완료, ${passwordFailCount}명은 비밀번호 설정을 다시 확인해 주세요.`
        : `${successCount}명 원생 등록이 완료되었습니다.`);
      if (lastStudent) onSuccess(lastStudent);
      resetAll();
      onClose();
    } else {
      toast.error('등록에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  // 일괄 등록 좌석 충돌 — 같은 센터의 기존 원생 + 붙여넣은 다른 행과 좌석번호가 겹치는지
  const bulkSeatConflict = (idx: number): string[] => {
    const seat = normalizeSeatNumber(bulkRows[idx]?.seatNumber ?? '');
    if (seat === undefined || seat <= 0) return [];
    const existing = students
      .filter((s) => s.campus === bulkCampus && s.seatNumber === seat)
      .map((s) => s.name.trim());
    const otherRows = bulkRows
      .filter((row, i) => i !== idx && normalizeSeatNumber(row.seatNumber) === seat)
      .map((row) => `${row.name.trim()}(목록)`);
    return [...existing, ...otherRows];
  };
  const bulkConflictCount = bulkRows.filter((_, i) => bulkSeatConflict(i).length > 0).length;

  const campusOptions = [
    { value: 'wonju', label: '원주 캠퍼스' },
    { value: 'chuncheon', label: '춘천 캠퍼스' },
    { value: 'chungju', label: '충주 캠퍼스' },
    { value: 'etc', label: '기타/퇴원' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-2xl border-black/[0.05] bg-white p-6 sm:max-w-3xl">
        <DialogHeader className="pb-3 pr-8">
          <DialogTitle className="text-lg font-bold text-slate-900">신규 원생 등록</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            학생 정보 탭에서 관리하는 핵심 프로필을 등록 시점에 함께 입력합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 모드 탭 */}
        <div className="inline-flex p-0.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05] mb-4">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            개별 등록
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            <ClipboardPaste className="w-3 h-3" />
            엑셀 일괄 등록
          </button>
        </div>

        {/* ── 개별 등록 ── */}
        {mode === 'single' && (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
           <div className="flex-1 space-y-4 overflow-y-auto">
            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-slate-900">기본 정보</h4>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-name" className="text-xs font-semibold text-slate-900">이름 *</Label>
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
                  <Label htmlFor="new-campus" className="text-xs font-semibold text-slate-900">소속 센터</Label>
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
                  <Label htmlFor="new-manager" className="text-xs font-semibold text-slate-900">담당 상담자</Label>
                  <Input
                    id="new-manager"
                    placeholder="원주센터장"
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                    list="managers-list"
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                  <datalist id="managers-list">
                    {uniqueManagers.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact" className="text-xs font-semibold text-slate-900">목표시험</Label>
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
                  <Label htmlFor="new-seat-number" className="text-xs font-semibold text-slate-900">좌석 번호</Label>
                  <Input
                    id="new-seat-number"
                    type="number"
                    min={1}
                    placeholder="예: 104"
                    value={seatNumber}
                    onChange={(e) => setSeatNumber(e.target.value)}
                    className={`rounded-xl text-xs h-9 bg-white ${
                      seatConflicts.length > 0
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                        : 'border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3]'
                    }`}
                  />
                  {seatConflicts.length > 0 && (
                    <p className="text-[10px] font-semibold text-red-500">
                      이 센터에 이미 {parsedSeat}번 좌석이 있습니다: {seatConflicts.map((s) => s.name).join(', ')}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-enrollment-end" className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
                    등록 종료일
                  </Label>
                  <Input
                    id="new-enrollment-end"
                    type="date"
                    value={enrollmentEndDate}
                    onChange={(e) => setEnrollmentEndDate(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                  <p className="text-[10px] text-slate-500">종료 3일 전(D-3)부터 학생 출결 화면에 재등록 안내가 표시됩니다.</p>
                </div>
              </div>


            </section>

            {/* 로그인 정보 — 아이디·비밀번호 동일 타일 */}
            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#0071E3]" />
                  <h4 className="text-xs font-bold text-slate-900">학생 포털 로그인 정보</h4>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateTempCredentials}
                  disabled={generatingId}
                  className="h-7 rounded-lg border-[#0071E3]/20 bg-white text-[10px] font-bold text-[#0071E3] px-2.5"
                >
                  {generatingId ? <Loader2 className="w-3 h-3 animate-spin" /> : '임시 ID·비번 자동발급'}
                </Button>
              </div>
              <p className="text-[10px] text-slate-500">
                임시 계정(sparta00001 형식)은 전 센터 통합 순차로 발급되어 중복되지 않습니다. ID·비번이 노출돼도 다른 개인정보에는 영향이 없습니다.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-login-id" className="text-xs font-semibold text-slate-900">로그인 ID</Label>
                  <Input
                    id="new-login-id"
                    placeholder="영어/숫자 조합"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value.trim().toLowerCase())}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-semibold text-slate-900">비밀번호 (4자 이상)</Label>
                  <Input
                    id="new-password"
                    placeholder="미입력 시 추후 설정"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-slate-900">출결 알림 문자</h4>
              </div>
              <p className="text-[10px] text-slate-500">
                등/하원 시 아래 번호로 자동 발송됩니다. 학생 홈에는 노출되지 않습니다.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-parent-phone" className="text-xs font-semibold text-slate-900">학부모 휴대폰</Label>
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
                  <Label htmlFor="new-student-phone" className="text-xs font-semibold text-slate-900">학생 휴대폰</Label>
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
                <span className="text-[11px] font-semibold text-slate-500">수신 대상</span>
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
                {smsTargets.length === 0 && (
                  <span className="text-[11px] font-semibold text-slate-500">자동 문자 발송 안 함</span>
                )}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-black/[0.05] bg-white p-4">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-[#0071E3]" />
                <h4 className="text-xs font-bold text-slate-900">정기 외출 / 빠지는 시간대</h4>
              </div>
              <p className="text-[10px] text-slate-500">
                지정된 시간에 출결판 교시 셀 내부에 외출 예정 시각이 자동으로 표시됩니다.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-500">외출</span>
                  <Input
                    type="time"
                    value={newAwayTime}
                    onChange={(e) => setNewAwayTime(e.target.value)}
                    className="h-9 w-[128px] min-w-[128px] shrink-0 rounded-xl border-black/[0.08] bg-white text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-bold text-slate-500">복귀</span>
                  <Input
                    type="time"
                    value={newReturnTime}
                    onChange={(e) => setNewReturnTime(e.target.value)}
                    className="h-9 w-[128px] min-w-[128px] shrink-0 rounded-xl border-black/[0.08] bg-white text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 text-[11px] font-bold text-slate-500">요일</span>
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
                <span className="shrink-0 text-[11px] font-bold text-slate-500">기간</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={newUntilForever}
                    onChange={() => setNewUntilForever(true)}
                    className="accent-[#0071E3]"
                  />
                  <span className="text-[11px] font-semibold text-slate-900">계속 반복</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    checked={!newUntilForever}
                    onChange={() => setNewUntilForever(false)}
                    className="accent-[#0071E3]"
                  />
                  <span className="text-[11px] font-semibold text-slate-900">종료일 지정</span>
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
                  className="h-8 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-[#323236]"
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
              <h4 className="text-xs font-bold text-slate-900">내부 메모 (특이사항)</h4>
              <div className="space-y-1.5">
                <Label htmlFor="new-special-note" className="text-xs font-semibold text-slate-900">특이사항</Label>
                <Textarea
                  id="new-special-note"
                  placeholder="해당 원생의 특이사항만 적어주세요. 예: 어디가 아프다 / 집이 멀다 / 기존 학습량 등"
                  value={specialNote}
                  onChange={(e) => setSpecialNote(e.target.value)}
                  className="min-h-[88px] rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs"
                />
                <p className="text-[10px] text-slate-500">내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다. 생활 코멘트는 추후 상담하면서 입력합니다.</p>
              </div>
            </section>

           </div>
            <DialogFooter className="-mx-6 -mb-6 mt-4 shrink-0 border-t border-black/[0.05] bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl text-xs py-4 bg-white">
                취소
              </Button>
              <Button type="submit" disabled={loading} className="rounded-xl text-xs bg-slate-900 hover:bg-[#323236] text-white py-4">
                {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />등록 중...</> : '원생 등록'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── 엑셀 일괄 등록 (붙여넣기) ── */}
        {mode === 'bulk' && (
          <div className="flex min-h-0 flex-1 flex-col">
           <div className="flex-1 space-y-4 overflow-y-auto">
            {/* 공통 설정 */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-black/[0.05] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">캠퍼스</Label>
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
                <Label className="text-xs font-semibold text-slate-900">담당 관리자</Label>
                <Input
                  placeholder="원주센터장"
                  value={bulkManager}
                  onChange={(e) => setBulkManager(e.target.value)}
                  className="rounded-xl border-black/[0.08] text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">목표시험</Label>
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
                <Label className="text-xs font-semibold text-slate-900">등록 종료일</Label>
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
              <Label className="text-xs font-semibold text-slate-900">
                엑셀 데이터 붙여넣기
              </Label>
              <div className="rounded-xl border border-[#0071E3]/15 bg-[#0071E3]/[0.04] p-3 text-[10px] font-semibold leading-relaxed text-slate-600">
                <p className="mb-1 font-semibold text-[#0071E3]">권장 열 순서</p>
                <p>좌석번호 · 이름 · 본인전화번호 · 부모님전화번호 · 부모님출결문자여부(Y/N) · 빠지는요일 · 나가는시간 · 들어오는시간 · 출결번호(로그인 비밀번호)</p>
                <p className="mt-1 text-slate-400">빠지는요일 예: 월수금 또는 월,수,금. 시간이 비어 있으면 정기외출은 만들지 않습니다.</p>
              </div>
              <div className="relative">
                <Textarea
                  placeholder={`엑셀에서 아래 열 순서로 복사한 뒤 여기에 붙여넣기 (Ctrl+V)\n\n예시:\n101\t홍길동\t01012345678\t01099998888\tY\t월수금\t14:30\t16:00\t1234\n0\t김철수\t01022223333\t01044445555\tN\t화목\t18:00\t\t5678`}
                  value={pasteText}
                  onChange={handleTextChange}
                  onPaste={handlePaste}
                  className="rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs min-h-[140px] font-mono resize-none"
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
              <p className="text-[10px] text-slate-500">
                좌석번호와 이름만 있어도 등록 가능하며, 추가 열이 있으면 학생정보·출결문자·정기외출·로그인 비밀번호까지 함께 입력됩니다.
              </p>
            </div>

            {/* 파싱 미리보기 */}
            {bulkRows.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-900">
                    등록 예정 {bulkRows.length}명
                    {bulkConflictCount > 0 && (
                      <span className="ml-2 text-red-500">· 좌석 중복 {bulkConflictCount}건</span>
                    )}
                  </Label>
                  {bulkLoading && (
                    <span className="text-[10px] text-[#0071E3] font-bold">
                      {bulkDone} / {bulkRows.length} 완료...
                    </span>
                  )}
                </div>
                <div className="rounded-xl border border-black/[0.06] overflow-auto max-h-[220px]">
                  <table className="min-w-[900px] w-full text-xs">
                    <thead className="bg-[#F5F5F7] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-500 w-16">좌석</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">이름</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">본인전화</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">부모전화</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">부모문자</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">빠지는요일</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">외출</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">복귀</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">출결번호</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, i) => {
                        const conflicts = bulkSeatConflict(i);
                        return (
                        <tr key={`${row.seatNumber}-${row.name}-${i}`} className={`border-t border-black/[0.04] ${conflicts.length > 0 ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-[#F5F5F7]/60'}`}>
                          <td className="px-3 py-2 font-mono">
                            {row.seatNumber
                              ? <span className={conflicts.length > 0 ? 'font-bold text-red-500' : 'text-slate-500'}>{row.seatNumber}</span>
                              : <span className="text-slate-300">-</span>}
                            {conflicts.length > 0 && (
                              <span className="block text-[10px] font-semibold text-red-500">중복: {conflicts.join(', ')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-900">{row.name}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{row.studentPhone || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{row.parentPhone || '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{row.parentSmsFlag || 'Y'}</td>
                          <td className="px-3 py-2 text-slate-500">{row.awayDays || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{row.awayTime || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{row.returnTime || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{row.attendanceCode || '-'}</td>
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
                        );
                      })}
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

           </div>
            <DialogFooter className="-mx-6 -mb-6 mt-4 shrink-0 border-t border-black/[0.05] bg-white px-6 py-4">
              <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl text-xs py-4 bg-white">
                취소
              </Button>
              <Button
                type="button"
                onClick={handleBulkSubmit}
                disabled={bulkLoading || bulkRows.length === 0}
                className="rounded-xl text-xs bg-slate-900 hover:bg-[#323236] text-white py-4 gap-1.5"
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
