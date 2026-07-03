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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CAMPUS_OPTIONS = [
  { value: 'wonju', label: '원주' },
  { value: 'chuncheon', label: '춘천' },
  { value: 'chungju', label: '충주' },
];

export default function StudentSignupPage() {
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [smsParent, setSmsParent] = useState(true);
  const [smsStudent, setSmsStudent] = useState(false);
  const [contact, setContact] = useState('');
  const [campus, setCampus] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedId = loginId.trim();
    const trimmedStudentPhone = studentPhone.trim();
    const trimmedParentPhone = parentPhone.trim();

    if (!trimmedName) {
      setErrorMsg('이름을 입력해 주세요.');
      return;
    }
    if (trimmedId.length < 4) {
      setErrorMsg('로그인 아이디는 영문/숫자 4자 이상으로 입력해 주세요.');
      return;
    }
    if (!/^\d{6}$/.test(password)) {
      setErrorMsg('출결번호는 숫자 6자리로 입력해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setErrorMsg('출결번호가 일치하지 않습니다.');
      return;
    }
    if (!trimmedStudentPhone && !trimmedParentPhone) {
      setErrorMsg('본인 또는 학부모 휴대폰 중 하나는 반드시 입력해 주세요.');
      return;
    }
    const studentPhoneDigits = trimmedStudentPhone.replace(/\D/g, '');
    const parentPhoneDigits = trimmedParentPhone.replace(/\D/g, '');
    if (
      (studentPhoneDigits && studentPhoneDigits.includes(password)) ||
      (parentPhoneDigits && parentPhoneDigits.includes(password))
    ) {
      setErrorMsg('출결번호는 휴대폰 번호와 겹치지 않는 숫자로 정해 주세요.');
      return;
    }
    if (!campus) {
      setErrorMsg('희망 캠퍼스를 선택해 주세요.');
      return;
    }

    const smsTargets: string[] = [];
    if (smsParent) smsTargets.push('parent');
    if (smsStudent) smsTargets.push('student');

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('/api/student/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          loginId: trimmedId,
          password,
          studentPhone: trimmedStudentPhone,
          parentPhone: trimmedParentPhone,
          smsTargets,
          contact: contact.trim(),
          campus,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMsg(data.message || '가입신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      setSuccessMsg(data.message || '가입신청이 접수되었습니다. 승인 후 로그인하실 수 있습니다.');
      setSubmitted(true);
    } catch (error) {
      setErrorMsg('가입신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col justify-center bg-gradient-to-b from-[#F8FAFC] to-[#EEF2FF] px-4 py-10 text-slate-900 md:min-h-[calc(100vh-5rem)] md:py-16">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-8 md:grid-cols-[1fr_460px]">
        <div className="hidden space-y-5 md:block">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3] text-white shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">SSC Student Report</p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              학생 가입신청
            </h1>
            <p className="max-w-lg text-sm leading-7 text-slate-500 md:text-base">
              가입신청 후 담당 선생님의 승인을 거치면 학생 홈 화면을 이용하실 수 있습니다.
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
                  <h2 className="text-xl font-semibold tracking-tight">가입신청 완료</h2>
                  <p className="text-sm leading-6 text-slate-500">{successMsg}</p>
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
                <CardTitle className="text-xl font-semibold tracking-tight">가입신청하기</CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  아래 정보를 입력해 가입을 신청해 주세요.
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
                    <Label htmlFor="signup-name" className="text-sm font-semibold">
                      이름
                    </Label>
                    <div className="relative">
                      <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="signup-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="이름 입력"
                        autoComplete="name"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-login-id" className="text-sm font-semibold">
                      로그인 아이디
                    </Label>
                    <div className="relative">
                      <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="signup-login-id"
                        value={loginId}
                        onChange={(event) =>
                          setLoginId(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
                        }
                        placeholder="아이디 입력"
                        autoComplete="username"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                    <p className="text-xs leading-5 text-slate-500">영문/숫자 4자 이상</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-semibold">
                      출결번호
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="signup-password"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={password}
                        onChange={(event) => setPassword(event.target.value.replace(/\D/g, ''))}
                        placeholder="숫자 6자리 입력"
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                    <p className="text-xs leading-5 text-slate-500">숫자 6자리 · 휴대폰 번호와 겹치지 않게</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password-confirm" className="text-sm font-semibold">
                      출결번호 확인
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <Input
                        id="signup-password-confirm"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value.replace(/\D/g, ''))}
                        placeholder="출결번호 다시 입력"
                        autoComplete="new-password"
                        className="h-12 rounded-xl border-black/[0.08] bg-white pl-10 text-base"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-student-phone" className="text-sm font-semibold">
                      본인 휴대폰
                    </Label>
                    <Input
                      id="signup-student-phone"
                      type="tel"
                      inputMode="numeric"
                      value={studentPhone}
                      onChange={(event) => setStudentPhone(event.target.value)}
                      placeholder="010-0000-0000"
                      autoComplete="tel"
                      className="h-12 rounded-xl border-black/[0.08] bg-white text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-parent-phone" className="text-sm font-semibold">
                      학부모 휴대폰
                    </Label>
                    <Input
                      id="signup-parent-phone"
                      type="tel"
                      inputMode="numeric"
                      value={parentPhone}
                      onChange={(event) => setParentPhone(event.target.value)}
                      placeholder="010-0000-0000"
                      autoComplete="tel"
                      className="h-12 rounded-xl border-black/[0.08] bg-white text-base"
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      본인 / 학부모 휴대폰 중 하나는 반드시 입력해 주세요.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">출결 알림 SMS 수신 대상</Label>
                    <div className="flex flex-wrap gap-4 pt-1">
                      <label
                        htmlFor="sms-parent"
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-900"
                      >
                        <Checkbox
                          id="sms-parent"
                          checked={smsParent}
                          onCheckedChange={(checked) => setSmsParent(checked === true)}
                        />
                        학부모
                      </label>
                      <label
                        htmlFor="sms-student"
                        className="flex cursor-pointer items-center gap-2 text-sm text-slate-900"
                      >
                        <Checkbox
                          id="sms-student"
                          checked={smsStudent}
                          onCheckedChange={(checked) => setSmsStudent(checked === true)}
                        />
                        학생
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-contact" className="text-sm font-semibold">
                      목표시험
                    </Label>
                    <Input
                      id="signup-contact"
                      value={contact}
                      onChange={(event) => setContact(event.target.value)}
                      placeholder="예: 9급 공무원, 수능"
                      className="h-12 rounded-xl border-black/[0.08] bg-white text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-campus" className="text-sm font-semibold">
                      희망 캠퍼스
                    </Label>
                    <Select value={campus} onValueChange={setCampus}>
                      <SelectTrigger
                        id="signup-campus"
                        className="!h-12 rounded-xl border-black/[0.08] bg-white text-base"
                      >
                        <SelectValue placeholder="캠퍼스 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="!h-12 w-full rounded-xl bg-[#0071E3] text-sm font-semibold text-white hover:bg-[#005DB9] shadow-[0_4px_14px_rgba(0,113,227,0.3)]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        가입신청 중...
                      </>
                    ) : (
                      <>
                        가입신청하기
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="text-center text-sm text-slate-500">
                    이미 계정이 있으신가요?{' '}
                    <Link href="/student/login" className="font-semibold text-[#0071E3] hover:underline">
                      로그인하기
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
