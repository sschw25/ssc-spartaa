'use client';

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ClipboardPaste, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import { Student } from '@/lib/types/student';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStudent: Student) => void;
  students?: Student[];
}

type Mode = 'single' | 'bulk';

interface BulkRow {
  seatNumber: string;
  name: string;
}

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

export function AddStudentModal({ isOpen, onClose, onSuccess, students = [] }: AddStudentModalProps) {
  const [mode, setMode] = useState<Mode>('single');

  // ── 개별 등록 상태 ──────────────────────────────────────────────
  const [name, setName] = useState('');
  const [campus, setCampus] = useState('wonju');
  const [manager, setManager] = useState('');
  const [contact, setContact] = useState('');
  const [nextConsultationDate, setNextConsultationDate] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [loading, setLoading] = useState(false);

  // ── 일괄 등록 상태 ──────────────────────────────────────────────
  const [bulkCampus, setBulkCampus] = useState('wonju');
  const [bulkManager, setBulkManager] = useState('');
  const [bulkContact, setBulkContact] = useState('');
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
    setName(''); setCampus('wonju'); setManager(''); setContact('');
    setNextConsultationDate(''); setSpecialNote('');
    setBulkCampus('wonju'); setBulkManager(''); setBulkContact('');
    setPasteText(''); setBulkRows([]); setBulkDone(0);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

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
          name: name.trim(), campus, manager: manager.trim(),
          contact: contact.trim(), nextConsultationDate: nextConsultationDate || undefined,
          speedMultiplier: 1.0, lifeComment: '', specialNote,
          consultationLogs: [], books: [], lectures: [], grades: [], subjects: [],
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
        const seatNum = row.seatNumber ? parseInt(row.seatNumber, 10) : undefined;
        const res = await fetch('/api/admin/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name, campus: bulkCampus,
            manager: bulkManager.trim(), contact: bulkContact.trim(),
            seatNumber: seatNum && !isNaN(seatNum) ? seatNum : undefined,
            speedMultiplier: 1.0, lifeComment: '', specialNote: '',
            consultationLogs: [], books: [], lectures: [], grades: [], subjects: [],
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
      <DialogContent className="max-w-lg rounded-2xl border-black/[0.05] p-6 bg-white overflow-hidden">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg font-bold text-[#1D1D1F]">신규 원생 등록</DialogTitle>
          <DialogDescription className="text-xs text-[#86868B]">
            스파르타 밀착 관리를 위한 신규 원생 기본 프로필을 생성합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 모드 탭 */}
        <div className="inline-flex p-0.5 rounded-lg bg-[#F5F5F7] border border-black/[0.05] mb-4">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'single' ? 'bg-white text-[#1D1D1F] shadow-sm' : 'text-[#86868B]'}`}
          >
            개별 등록
          </button>
          <button
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-name" className="text-xs font-semibold text-[#1D1D1F]">이름 *</Label>
                <Input
                  id="new-name"
                  placeholder="홍길동"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-campus" className="text-xs font-semibold text-[#1D1D1F]">소속 캠퍼스</Label>
                <Select value={campus} onValueChange={setCampus}>
                  <SelectTrigger id="new-campus" className="rounded-xl border-black/[0.08] text-xs py-4.5 bg-white">
                    <SelectValue placeholder="캠퍼스 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {campusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-manager" className="text-xs font-semibold text-[#1D1D1F]">담당 관리자</Label>
                <Input
                  id="new-manager"
                  placeholder="원주센터장"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-contact" className="text-xs font-semibold text-[#1D1D1F]">목표시험</Label>
                <Input
                  id="new-contact"
                  placeholder="예: 수능, 9급 공무원"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  list="target-exams-list"
                  className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5 bg-white"
                />
                <datalist id="target-exams-list">
                  {uniqueExams.map((exam) => <option key={exam} value={exam} />)}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-next-consult" className="text-xs font-semibold text-[#1D1D1F]">다음 상담 예정일</Label>
              <Input
                id="new-next-consult"
                type="date"
                value={nextConsultationDate}
                onChange={(e) => setNextConsultationDate(e.target.value)}
                className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs py-4.5 bg-white"
              />
              <p className="text-[10px] text-[#86868B]">지정하면 상담 알림 대시보드에 자동으로 반영됩니다. (선택)</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-special-note" className="text-xs font-semibold text-[#1D1D1F]">특이사항</Label>
              <Textarea
                id="new-special-note"
                placeholder="예: 연락 가능 시간, 보호자 요청, 건강/생활 참고사항 등 내부 관리 메모를 입력하세요."
                value={specialNote}
                onChange={(e) => setSpecialNote(e.target.value)}
                className="rounded-xl border-black/[0.08] focus:border-[#0071E3] text-xs min-h-[72px]"
              />
              <p className="text-[10px] text-[#86868B]">내부 관리용 메모이며 학부모용 결과지에는 표시되지 않습니다.</p>
            </div>

            <DialogFooter className="pt-3 border-t border-black/[0.05]">
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-[#1D1D1F]">캠퍼스</Label>
                <Select value={bulkCampus} onValueChange={setBulkCampus}>
                  <SelectTrigger className="rounded-xl border-black/[0.08] text-xs h-9 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {campusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
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
                        <tr key={i} className="border-t border-black/[0.04] hover:bg-[#F5F5F7]/60">
                          <td className="px-3 py-2 text-[#86868B] font-mono">
                            {row.seatNumber || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#1D1D1F]">{row.name}</td>
                          <td className="px-3 py-2 text-right">
                            <button
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

            <DialogFooter className="pt-3 border-t border-black/[0.05]">
              <Button type="button" variant="outline" onClick={handleClose} className="rounded-xl text-xs py-4 bg-white">
                취소
              </Button>
              <Button
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
