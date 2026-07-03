'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, Check, X, Phone, Building2, Target, Clock, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminTopNav } from '@/components/admin/admin-top-nav';

type Application = {
  id: string;
  name: string;
  loginId: string;
  studentPhone?: string;
  parentPhone?: string;
  smsTargets?: ('parent' | 'student')[];
  contact?: string;
  campus?: string;
  createdAt: string;
};

type PasswordRequest = {
  id: string;
  name: string;
  loginId: string;
  campus: string;
  requestedAt: string;
};

type ApprovalDraft = {
  campus: string;
  manager: string;
  seatNumber: string;
  enrollStartDate: string;
  enrollmentEndDate: string;
  weeklyGradeCheck: boolean;
};

const CAMPUS_LABELS: Record<string, string> = { wonju: '원주', chuncheon: '춘천', chungju: '충주' };

const campusOptions = [
  { value: 'wonju', label: '원주 캠퍼스' },
  { value: 'chuncheon', label: '춘천 캠퍼스' },
  { value: 'chungju', label: '충주 캠퍼스' },
];

function campusLabel(val?: string) {
  return (val && CAMPUS_LABELS[val]) || '미지정';
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

export default function AdminApplicationsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [pwRequests, setPwRequests] = useState<PasswordRequest[]>([]);
  const [pwLoading, setPwLoading] = useState(true);
  const [pwBusy, setPwBusy] = useState<Record<string, boolean>>({});

  const loadApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/applications', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const data: Application[] = json.data || [];
          setApplications(data);
          setDrafts((prev) => {
            const next = { ...prev };
            data.forEach((app) => {
              if (!next[app.id]) {
                next[app.id] = {
                  campus: app.campus && CAMPUS_LABELS[app.campus] ? app.campus : 'wonju',
                  manager: '',
                  seatNumber: '',
                  enrollStartDate: '',
                  enrollmentEndDate: '',
                  weeklyGradeCheck: false,
                };
              }
            });
            return next;
          });
        }
      } else {
        toast.error('가입신청 목록을 불러오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadPasswordRequests = async () => {
    setPwLoading(true);
    try {
      const res = await fetch('/api/admin/password-requests', { cache: 'no-store', credentials: 'same-origin' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setPwRequests(json.data || []);
        }
      } else {
        toast.error('출결번호 변경 신청 목록을 불러오지 못했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setPwLoading(false);
    }
  };

  const approvePassword = async (req: PasswordRequest) => {
    setPwBusy((b) => ({ ...b, [req.id]: true }));
    try {
      const res = await fetch(`/api/admin/password-requests/${req.id}`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || `${req.name} 님의 출결번호를 변경했습니다.`);
        setPwRequests((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        toast.error(json.message || '승인에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setPwBusy((b) => ({ ...b, [req.id]: false }));
    }
  };

  const rejectPassword = async (req: PasswordRequest) => {
    if (!(await confirm({ title: `${req.name} 님의 출결번호 변경 신청을 반려할까요?`, description: '이 작업은 되돌릴 수 없습니다.', tone: 'danger', confirmText: '반려' }))) return;
    setPwBusy((b) => ({ ...b, [req.id]: true }));
    try {
      const res = await fetch(`/api/admin/password-requests/${req.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || '출결번호 변경 신청을 반려했습니다.');
        setPwRequests((prev) => prev.filter((r) => r.id !== req.id));
      } else {
        toast.error(json.message || '반려에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setPwBusy((b) => ({ ...b, [req.id]: false }));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        await Promise.all([loadApplications(), loadPasswordRequests()]);
      } catch {
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.replace('/admin');
    } catch { /* noop */ }
  };

  const updateDraft = (id: string, patch: Partial<ApprovalDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const removeApplication = (id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const approve = async (app: Application) => {
    const draft = drafts[app.id];
    if (!draft) return;
    setBusy((b) => ({ ...b, [app.id]: true }));
    try {
      const seatNum = draft.seatNumber.trim() ? Number(draft.seatNumber) : undefined;
      const res = await fetch(`/api/admin/applications/${app.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campus: draft.campus,
          manager: draft.manager.trim() || undefined,
          seatNumber: Number.isFinite(seatNum) ? seatNum : undefined,
          enrollStartDate: draft.enrollStartDate || undefined,
          enrollmentEndDate: draft.enrollmentEndDate || undefined,
          weeklyGradeCheck: draft.weeklyGradeCheck,
          parentPhone: app.parentPhone || undefined,
          studentPhone: app.studentPhone || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || `${app.name} 가입을 승인했습니다.`);
        removeApplication(app.id);
      } else {
        toast.error(json.message || '승인에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [app.id]: false }));
    }
  };

  const reject = async (app: Application) => {
    if (!(await confirm({ title: `${app.name} 님의 가입신청을 반려할까요?`, description: '이 작업은 되돌릴 수 없습니다.', tone: 'danger', confirmText: '반려' }))) return;
    setBusy((b) => ({ ...b, [app.id]: true }));
    try {
      const res = await fetch(`/api/admin/applications/${app.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || '가입신청을 반려했습니다.');
        removeApplication(app.id);
      } else {
        toast.error(json.message || '반려에 실패했습니다.');
      }
    } catch {
      toast.error('네트워크 에러가 발생했습니다.');
    } finally {
      setBusy((b) => ({ ...b, [app.id]: false }));
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-sm text-slate-500">가입신청 정보 로드 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-fluid-ui ios-app-bg min-h-screen text-slate-900 font-sans">
      <AdminTopNav
        title="가입신청 승인"
        titleIcon={<UserPlus className="w-4 h-4 text-[#0071E3]" />}
        onLogout={handleLogout}
      />

      <main className="stagger-children max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        <div className="rounded-2xl border border-[#0071E3]/15 bg-[#0071E3]/[0.03] p-4 text-[11px] font-semibold text-[#0071E3]">
          학생이 직접 신청한 가입 건을 검토하고, 승인 정보(캠퍼스·담당자·좌석 등)를 입력해 원생으로 전환합니다. 반려 시 신청 내역은 삭제됩니다.
        </div>

        {/* 출결번호 변경 신청 */}
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-slate-900">
              <KeyRound className="w-4 h-4 text-[#0071E3]" /> 출결번호 변경 신청
            </h2>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              승인하면 학생이 신청한 새 출결번호로 즉시 변경됩니다.
            </p>
          </div>

          {pwLoading ? (
            <div className="text-center py-12 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
              <Loader2 className="w-7 h-7 text-[#0071E3] animate-spin mb-3" />
              <p className="text-xs text-slate-500">불러오는 중...</p>
            </div>
          ) : pwRequests.length === 0 ? (
            <div className="text-center py-12 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-slate-500">
              대기 중인 출결번호 변경 신청이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {pwRequests.map((req) => {
                const isBusy = !!pwBusy[req.id];
                return (
                  <div key={req.id} className="bg-white border border-black/[0.05] rounded-2xl p-4 md:p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-semibold text-base text-slate-900">{req.name}</span>
                      <Badge className="rounded-md text-[11px] px-1.5 py-0.5 border bg-[#F5F5F7] text-slate-500 border-black/[0.06]">
                        ID {req.loginId}
                      </Badge>
                      <span className="flex items-center gap-1 rounded-lg bg-[#0071E3]/[0.08] text-[#0071E3] px-2 py-0.5 text-[11px] font-semibold">
                        <Building2 className="w-3 h-3" /> {campusLabel(req.campus)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                        <Clock className="w-3 h-3" /> {formatDateTime(req.requestedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={isBusy}
                        onClick={() => approvePassword(req)}
                        className="h-9 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold px-4"
                      >
                        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => rejectPassword(req)}
                        className="h-9 rounded-xl border-black/[0.08] text-xs font-semibold px-4 text-red-600 bg-white"
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" /> 반려
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 가입신청 */}
        <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-slate-900 pt-2">
          <UserPlus className="w-4 h-4 text-[#0071E3]" /> 가입신청
        </h2>

        {loading && applications.length === 0 ? (
          <div className="text-center py-20 bg-white border border-black/[0.05] rounded-3xl flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
            <p className="text-xs text-slate-500">불러오는 중...</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-black/[0.08] rounded-3xl text-xs text-slate-500">
            대기 중인 가입신청이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const draft = drafts[app.id];
              const isBusy = !!busy[app.id];
              if (!draft) return null;
              return (
                <div key={app.id} className="bg-white border border-black/[0.05] rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
                  {/* 신청 정보 */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-semibold text-base text-slate-900">{app.name}</span>
                      <Badge className="rounded-md text-[11px] px-1.5 py-0.5 border bg-[#F5F5F7] text-slate-500 border-black/[0.06]">
                        ID {app.loginId}
                      </Badge>
                      <span className="flex items-center gap-1 rounded-lg bg-[#0071E3]/[0.08] text-[#0071E3] px-2 py-0.5 text-[11px] font-semibold">
                        <Building2 className="w-3 h-3" /> 희망 {campusLabel(app.campus)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <Clock className="w-3 h-3" /> {formatDateTime(app.createdAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] font-semibold text-slate-500">
                    {app.studentPhone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> 본인 <b className="text-slate-900">{app.studentPhone}</b>
                      </span>
                    )}
                    {app.parentPhone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> 학부모 <b className="text-slate-900">{app.parentPhone}</b>
                      </span>
                    )}
                    {app.contact && (
                      <span className="flex items-center gap-1.5">
                        <Target className="w-3 h-3" /> 목표 시험 <b className="text-slate-900">{app.contact}</b>
                      </span>
                    )}
                  </div>

                  {/* 승인 정보 입력 */}
                  <div className="rounded-xl border border-black/[0.06] bg-[#F9F9FB] p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-900">승인 정보</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-900">캠퍼스</Label>
                        <Select value={draft.campus} onValueChange={(v) => updateDraft(app.id, { campus: v })}>
                          <SelectTrigger className="rounded-xl border-black/[0.08] text-xs h-9 bg-white">
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
                        <Label className="text-xs font-semibold text-slate-900">담당 상담자</Label>
                        <Input
                          placeholder="원주센터장"
                          value={draft.manager}
                          onChange={(e) => updateDraft(app.id, { manager: e.target.value })}
                          className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-900">좌석 번호</Label>
                        <Input
                          type="number"
                          min={1}
                          placeholder="예: 104"
                          value={draft.seatNumber}
                          onChange={(e) => updateDraft(app.id, { seatNumber: e.target.value })}
                          className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-900">이용 시작일</Label>
                        <Input
                          type="date"
                          value={draft.enrollStartDate}
                          onChange={(e) => updateDraft(app.id, { enrollStartDate: e.target.value })}
                          className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                        />
                        <p className="text-[11px] text-slate-500">비우면 즉시 이용 가능. 미래 날짜면 그 날부터 로그인 가능.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-900">등록 종료일</Label>
                        <Input
                          type="date"
                          value={draft.enrollmentEndDate}
                          onChange={(e) => updateDraft(app.id, { enrollmentEndDate: e.target.value })}
                          className="rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs h-9 bg-white"
                        />
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-900">
                      <input
                        type="checkbox"
                        checked={draft.weeklyGradeCheck}
                        onChange={(e) => updateDraft(app.id, { weeklyGradeCheck: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[#0071E3]"
                      />
                      매주 성적 입력 대상
                    </label>
                  </div>

                  {/* 액션 */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={isBusy}
                      onClick={() => approve(app)}
                      className="h-9 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold px-4"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => reject(app)}
                      className="h-9 rounded-xl border-black/[0.08] text-xs font-semibold px-4 text-red-600 bg-white"
                    >
                      <X className="w-3.5 h-3.5 mr-1.5" /> 반려
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
