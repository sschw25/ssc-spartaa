'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, GraduationCap, Loader2, LockKeyhole, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function StudentLoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const code = authCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (!trimmedName || code.length !== 4) {
      setErrorMsg('이름과 확인코드 4자리를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/student/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, authCode: code }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMsg(data.message || '학생 정보를 확인할 수 없습니다.');
        return;
      }

      router.replace(data.reportUrl);
    } catch (error) {
      setErrorMsg('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#F5F7FA] px-4 py-10 text-[#1D1D1F] md:min-h-[calc(100vh-5rem)] md:py-16">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111827] text-white shadow-lg">
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
                  이름과 확인코드가 일치하면 바로 학생용 결과지로 이동합니다.
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
                <Label htmlFor="student-name" className="text-sm font-semibold">
                  이름
                </Label>
                <div className="relative">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <Input
                    id="student-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="예: 홍길동"
                    autoComplete="name"
                    className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-code" className="text-sm font-semibold">
                  확인코드 4자리
                </Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <Input
                    id="auth-code"
                    value={authCode}
                    onChange={(event) => setAuthCode(event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4))}
                    placeholder="예: 1234"
                    inputMode="text"
                    autoComplete="one-time-code"
                    maxLength={4}
                    className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                  />
                </div>
                <p className="text-xs leading-5 text-[#64748B]">
                  연락처가 등록된 학생은 연락처 뒤 4자리, 아니면 관리자에게 받은 학생코드 끝 4자리를 입력합니다.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-xl bg-[#111827] text-sm font-bold text-white hover:bg-[#0F172A]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    확인 중
                  </>
                ) : (
                  <>
                    로그인
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
