'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Edit2, Trash2, Shield, User, Landmark, ShieldAlert } from 'lucide-react';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

interface AdminAccountData {
  id: string;
  username: string;
  campus: string;
  role: string;
  createdAt: string;
}

export default function AdminAccountsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentSession, setCurrentSession] = useState<{ id: string; username: string; campus: string; role: string } | null>(null);
  
  const [accounts, setAccounts] = useState<AdminAccountData[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 모달 상태
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // 폼 입력 상태
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [campusInput, setCampusInput] = useState('wonju');
  const [roleInput, setRoleInput] = useState('campus_admin');
  
  // 1. 인증 정보 확인
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && (data.campus === 'all' || data.role === 'super')) {
            setCurrentSession(data);
            fetchAccounts();
          } else {
            toast.error('슈퍼 관리자 권한이 없습니다.');
            router.replace('/admin/dashboard');
          }
        } else {
          router.replace('/admin');
        }
      } catch (err) {
        console.error('인증 확인 중 오류:', err);
        router.replace('/admin');
      } finally {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  // 2. 관리자 목록 조회
  async function fetchAccounts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/accounts');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAccounts(json.data);
        } else {
          toast.error(json.message || '목록을 불러오는 데 실패했습니다.');
        }
      }
    } catch (err) {
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // 3. 등록/수정 모달 열기
  const handleOpenAdd = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setUsernameInput('');
    setPasswordInput('');
    setCampusInput('wonju');
    setRoleInput('campus_admin');
    setIsOpen(true);
  };

  const handleOpenEdit = (account: AdminAccountData) => {
    setIsEditMode(true);
    setSelectedId(account.id);
    setUsernameInput(account.username);
    setPasswordInput(''); // 비밀번호 필드는 수정 시 비워둠
    setCampusInput(account.campus);
    setRoleInput(account.role);
    setIsOpen(true);
  };

  // 4. 폼 제출 (등록/수정)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      toast.error('아이디를 입력해 주세요.');
      return;
    }
    if (!isEditMode && !passwordInput.trim()) {
      toast.error('비밀번호를 입력해 주세요.');
      return;
    }

    try {
      const body = {
        username: usernameInput.trim(),
        password: passwordInput ? passwordInput.trim() : undefined,
        campus: campusInput,
        role: roleInput,
      };

      const url = isEditMode ? `/api/admin/accounts/${selectedId}` : '/api/admin/accounts';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(isEditMode ? '계정이 수정되었습니다.' : '계정이 생성되었습니다.');
        setIsOpen(false);
        fetchAccounts();
      } else {
        toast.error(data.message || '처리에 실패했습니다.');
      }
    } catch (err) {
      toast.error('네트워크 에러가 발생했습니다.');
    }
  };

  // 5. 계정 삭제
  const handleDelete = async (id: string, username: string) => {
    if (currentSession?.id === id) {
      toast.error('본인 계정은 삭제할 수 없습니다.');
      return;
    }

    if (!(await confirm({ title: `관리자 계정 "${username}"을(를) 삭제할까요?`, description: '삭제하면 되돌릴 수 없습니다.', tone: 'danger', confirmText: '삭제' }))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/accounts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('성공적으로 삭제되었습니다.');
        fetchAccounts();
      } else {
        toast.error(data.message || '삭제에 실패했습니다.');
      }
    } catch (err) {
      toast.error('네트워크 에러가 발생했습니다.');
    }
  };

  // 6. 다국어 / 한글 변환
  const getCampusLabel = (campus: string) => {
    switch (campus) {
      case 'wonju':
        return '원주';
      case 'chuncheon':
        return '춘천';
      case 'chungju':
        return '충주';
      case 'all':
        return '전체';
      default:
        return campus;
    }
  };

  const getRoleLabel = (role: string) => {
    return role === 'super' ? '최고 관리자' : '캠퍼스 관리자';
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-slate-500 text-sm">인증 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="ios-app-bg min-h-screen font-sans text-slate-900">
      <AdminTopNav title="관리자 계정 관리" titleIcon={<Shield className="w-4 h-4 text-[#0071E3]" />} />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">센터별 관리자 계정</h2>
            <p className="text-xs text-slate-500 mt-1">
              어드민 권한을 분할하여 특정 센터 정보만 조회할 수 있는 계정을 관리합니다.
            </p>
          </div>
          <Button
            onClick={handleOpenAdd}
            className="rounded-xl bg-[#0071E3] hover:bg-[#0071E3]/90 text-white font-bold text-xs gap-1.5 shadow-sm px-4 py-2.5 h-auto transition-premium"
          >
            <Plus className="w-4 h-4" />
            계정 추가
          </Button>
        </div>

        <Card className="border border-black/[0.05] shadow-md rounded-2xl bg-white overflow-hidden">
          <CardHeader className="border-b border-black/[0.03] bg-white pb-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              등록된 관리자 목록
            </CardTitle>
            <CardDescription className="text-[11px] text-slate-500">
              현재 시스템에 생성된 센터별 관리자 권한 목록입니다.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-0">
            {loading && accounts.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Loader2 className="w-6 h-6 text-[#0071E3] animate-spin mb-2" />
                <span className="text-xs text-slate-500">데이터 로딩 중...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                등록된 센터별 관리자 계정이 없습니다. 계정 추가를 통해 생성해 주세요.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F5F5F7]/30 hover:bg-[#F5F5F7]/30 border-b border-black/[0.03]">
                    <TableHead className="text-xs font-bold text-slate-500 w-[20%] pl-6">아이디</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500 w-[20%]">담당 센터</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500 w-[20%]">권한 등급</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500 w-[20%]">생성일</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500 w-[20%] text-right pr-6">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} className="border-b border-black/[0.02] hover:bg-[#F5F5F7]/20 transition-colors">
                      <TableCell className="font-semibold text-xs text-slate-900 pl-6 py-4">
                        {account.username}
                        {currentSession?.id === account.id && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-[#0071E3] border border-[#0071E3]/10">
                            본인
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        {/* AGENTS.md 규칙: 캠퍼스는 중립 회색 뱃지로 통일하고 텍스트로 식별 */}
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-[#F5F5F7] text-slate-900 border border-black/[0.03] gap-1">
                          <Landmark className="w-3 h-3 text-slate-500" />
                          {getCampusLabel(account.campus)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold gap-1",
                          account.role === 'super' 
                            ? "bg-emerald-50 text-[#34C759] border border-emerald-500/10" 
                            : "bg-[#F5F5F7] text-slate-500"
                        )}>
                          <Shield className="w-3 h-3" />
                          {getRoleLabel(account.role)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 py-4">
                        {new Date(account.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-right pr-6 py-4">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenEdit(account)}
                            className="h-8 w-8 rounded-lg hover:bg-[#F5F5F7] text-slate-500 hover:text-slate-900 transition-colors"
                            title="수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={currentSession?.id === account.id}
                            onClick={() => handleDelete(account.id, account.username)}
                            className={cn(
                              "h-8 w-8 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors",
                              currentSession?.id === account.id && "opacity-30 cursor-not-allowed"
                            )}
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md bg-white border border-black/[0.05] rounded-2xl shadow-xl p-6 font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0071E3]" />
              {isEditMode ? '관리자 계정 정보 수정' : '신규 관리자 계정 추가'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {isEditMode 
                ? '관리자의 소속 센터나 권한을 수정합니다. 비밀번호를 변경하려면 값을 입력하고, 변경하지 않으려면 비워두세요.'
                : '신규로 추가할 관리자의 정보와 담당 센터 및 권한을 설정해 주세요.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="dlg-username" className="text-xs font-bold text-slate-900">
                아이디
              </Label>
              <Input
                id="dlg-username"
                type="text"
                placeholder="예: sparta_wonju"
                disabled={isEditMode} // 수정 시 ID 변경 불가능하도록 처리하여 계정 일관성 유지
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="py-4.5 rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs bg-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dlg-password" className="text-xs font-bold text-slate-900">
                비밀번호 {isEditMode && '(변경 시에만 입력)'}
              </Label>
              <Input
                id="dlg-password"
                type="password"
                placeholder={isEditMode ? '••••••••' : '비밀번호 입력'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="py-4.5 rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-xs bg-white"
                required={!isEditMode}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dlg-campus" className="text-xs font-bold text-slate-900">
                  담당 센터
                </Label>
                <Select value={campusInput} onValueChange={setCampusInput}>
                  <SelectTrigger id="dlg-campus" className="rounded-xl border-black/[0.08] text-xs h-9.5">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem className="text-xs" value="wonju">원주 센터</SelectItem>
                    <SelectItem className="text-xs" value="chuncheon">춘천 센터</SelectItem>
                    <SelectItem className="text-xs" value="chungju">충주 센터</SelectItem>
                    <SelectItem className="text-xs" value="all">전체 센터 (슈퍼 관리자)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dlg-role" className="text-xs font-bold text-slate-900">
                  권한 등급
                </Label>
                <Select value={roleInput} onValueChange={setRoleInput}>
                  <SelectTrigger id="dlg-role" className="rounded-xl border-black/[0.08] text-xs h-9.5">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem className="text-xs" value="campus_admin">캠퍼스 관리자</SelectItem>
                    <SelectItem className="text-xs" value="super">최고 관리자 (Super)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {campusInput !== 'all' && roleInput === 'super' && (
              <div className="bg-amber-50 border border-amber-200 text-[#F56300] rounded-xl px-3 py-2 flex items-start gap-2 text-[10px] font-bold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>특정 센터 지정 상태로 최고 관리자 권한 부여 시, 대시보드에서는 필터가 해당 센터로 제한됩니다.</span>
              </div>
            )}

            <DialogFooter className="pt-4 border-t border-black/[0.03] gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                className="rounded-xl text-xs font-bold hover:bg-[#F5F5F7] px-4 py-2.5 h-auto"
              >
                취소
              </Button>
              <Button
                type="submit"
                className="rounded-xl bg-slate-900 hover:bg-[#323236] text-white text-xs font-bold px-4 py-2.5 h-auto transition-premium"
              >
                {isEditMode ? '저장' : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
