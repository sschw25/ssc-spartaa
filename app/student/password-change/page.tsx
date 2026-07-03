'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
  LockKeyhole,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function StudentPasswordChangePage() {
  const [loginId, setLoginId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedId = loginId.trim().toLowerCase();

    if (!trimmedId) {
      setErrorMsg('로그인 아이디를 입력해 주세요.');
      return;
    }
    if (!currentPassword) {
      setErrorMsg('현재 출결번호를 입력해 주세요.');
      return;
    }
    if (!/^\d{6}$/.test(newPassword)) {
      setErrorMsg('출결번호는 숫자 6자리로 입력해 주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setErrorMsg('출결번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/student/password-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: trimmedId, currentPassword, newPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMsg(data.message || '출결번호 변경 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      setSuccessMsg(
        data.message || '출결번호 변경 신청이 접수되었습니다. 관리자 승인 후 적용됩니다.',
      );
      setSubmitted(true);
    } catch (error) {
      setErrorMsg('출결번호 변경 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF] px-4 py-10 text-[#1D1D1F] md:min-h-[calc(100vh-5rem)] md:py-16">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_460px]">
        <div className="hidden space-y-5 md:block">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3] text-white shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#64748B]">SSC Student Report</p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-[#1D1D1F] md:text-5xl">
              출결번호 변경 신청
            </h1>
            <p className="max-w-lg text-sm leading-7 text-[#64748B] md:text-base">
              현재 출결번호와 새 출결번호를 입력해 변경을 신청해 주세요. 관리자 승인 후 적용됩니다.
            </p>
          </div>
        </div>

        <Card className="rounded-2xl border-black/[0.06] bg-white shadow-xl">
          {submitted ? (
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F5E9] text-[#16A34A]">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight">변경 신청 완료</h2>
                  <p className="text-sm leading-6 text-[#64748B]">{successMsg}</p>
                </div>
                <Button
                  asChild
                  className="!h-12 w-full rounded-xl bg-[#0071E3] text-sm font-semibold text-white hover:bg-[#005DB9] shadow-[0_4px_14px_rgba(0,113,227,0.3)]"
                >
                  <Link href="/student/login">
                    로그인 화면으로 이동
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-xl font-semibold tracking-tight">출결번호 변경 신청</CardTitle>
                <CardDescription className="text-sm text-[#64748B]">
                  아래 정보를 입력해 출결번호 변경을 신청해 주세요.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  {errorMsg && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pwc-login-id" className="text-sm font-semibold">
                      로그인 아이디
                    </Label>
                    <div className="relative">
                      <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="pwc-login-id"
                        value={loginId}
                        onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                        placeholder="아이디 입력"
                        autoComplete="username"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pwc-current-password" className="text-sm font-semibold">
                      현재 출결번호
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="pwc-current-password"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value.replace(/\D/g, ''))}
                        placeholder="현재 출결번호 입력"
                        autoComplete="current-password"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pwc-new-password" className="text-sm font-semibold">
                      새 출결번호
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="pwc-new-password"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value.replace(/\D/g, ''))}
                        placeholder="숫자 6자리 입력"
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                    <p className="text-xs leading-5 text-[#64748B]">숫자 6자리 · 휴대폰 번호와 겹치지 않게</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pwc-new-password-confirm" className="text-sm font-semibold">
                      새 출결번호 확인
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="pwc-new-password-confirm"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={newPasswordConfirm}
                        onChange={(event) => setNewPasswordConfirm(event.target.value.replace(/\D/g, ''))}
                        placeholder="새 출결번호 다시 입력"
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="!h-12 w-full rounded-xl bg-[#0071E3] text-sm font-semibold text-white hover:bg-[#005DB9] shadow-[0_4px_14px_rgba(0,113,227,0.3)]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        신청 중...
                      </>
                    ) : (
                      <>
                        출결번호 변경 신청
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="text-center text-sm text-[#64748B]">
                    <Link href="/student/login" className="font-semibold text-[#0071E3] hover:underline">
                      로그인 화면으로 돌아가기
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </section>
    </main>
  );
}
