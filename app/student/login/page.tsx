'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, GraduationCap, Loader2, LockKeyhole, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function StudentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '';

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedId = loginId.trim().toLowerCase();

    if (!trimmedId || !password) {
      setErrorMsg('아이디와 비밀번호를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/student/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: trimmedId, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMsg(data.message || '아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      // 로그인 성공 시 next 파라미터가 있으면 그곳으로 이동, 없으면 결과지 URL로 이동
      if (next) {
        router.replace(next);
      } else {
        router.replace(data.reportUrl);
      }
    } catch (error) {
      setErrorMsg('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF] px-4 py-10 text-[#1D1D1F] md:min-h-[calc(100vh-5rem)] md:py-16">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_420px]">
        <div className="hidden space-y-5 md:block">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3] text-white shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#64748B]">SSC Student Report</p>
            <h1 className="max-w-xl text-3xl font-bold tracking-tight text-[#111827] md:text-5xl">
              학생 결과지 로그인
            </h1>
            <p className="max-w-lg text-sm leading-7 text-[#64748B] md:text-base">
              오늘의 학습 계획, 교재별 진도, 평균 페이스 비교를 학생용 화면에서 확인합니다.
            </p>
          </div>
        </div>

        <Card className="rounded-2xl border-black/[0.06] bg-white shadow-xl">
          <CardHeader className="space-y-2 pb-5">
            <CardTitle className="text-xl font-bold tracking-tight">내 결과지 보기</CardTitle>
            <CardDescription className="text-sm text-[#64748B]">
              설정된 로그인 ID와 비밀번호를 입력해 주세요.
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
                <Label htmlFor="student-login-id" className="text-sm font-semibold">
                  로그인 ID
                </Label>
                <div className="relative">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <Input
                    id="student-login-id"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    placeholder="아이디 입력"
                    autoComplete="username"
                    className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-password" className="text-sm font-semibold">
                  비밀번호
                </Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <Input
                    id="student-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                  />
                </div>
                <p className="text-xs leading-5 text-[#64748B]">
                  비밀번호를 모르거나 분실한 경우, 담당 코멘터 선생님께 말씀해 주세요.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="!h-12 w-full rounded-xl bg-[#0071E3] text-sm font-bold text-white hover:bg-[#005DB9] shadow-[0_4px_14px_rgba(0,113,227,0.3)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-[#64748B]">
                처음이신가요?{' '}
                <Link href="/student/signup" className="font-semibold text-[#0071E3] hover:underline">
                  가입신청하기
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
      </div>
    }>
      <StudentLoginForm />
    </Suspense>
  );
}
