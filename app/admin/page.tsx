'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 이미 로그인 되어 있는지 인증 체크
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            router.replace('/admin/dashboard');
            return;
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  // 2. 로그인 처리
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success('로그인에 성공했습니다.');
        router.replace('/admin/dashboard');
      } else {
        setErrorMsg(data.message || '로그인에 실패했습니다.');
        toast.error(data.message || '로그인 실패');
      }
    } catch (err) {
      setErrorMsg('로그인 중 네트워크 에러가 발생했습니다.');
      toast.error('로그인 에러');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-8 h-8 text-[#0071E3] animate-spin mb-4" />
        <p className="text-slate-500 text-sm">로그인 세션 확인 중...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#F5F5F7] via-white to-[#E5E7EB] flex flex-col items-center justify-center px-4 font-sans text-slate-900">
      <div className="w-full max-w-md">

        {/* Logo or Title */}
        <div className="text-center mb-8">
          <span className="text-[10px] font-bold tracking-[0.4em] text-slate-500 uppercase block mb-2">
            Supreme Spartan Control
          </span>
          <h1 className="text-2xl font-bold tracking-tight">SSC 스파르타 학습관리자</h1>
        </div>

        {/* Login Card */}
        <Card className="border border-black/[0.05] shadow-xl rounded-2xl bg-white/80 backdrop-blur-md overflow-hidden">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl font-bold text-center">관리자 로그인</CardTitle>
            <CardDescription className="text-center text-slate-500 text-xs">
              원생 관리 및 진도 조절을 위한 대시보드에 로그인합니다.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold text-slate-900">
                  아이디
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 py-5 rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-sm bg-white"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-900">
                  비밀번호
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 py-5 rounded-xl border-black/[0.08] focus:border-[#0071E3] focus:ring-[#0071E3] text-sm bg-white"
                    required
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-4 pb-6">
              <Button
                type="submit"
                disabled={loading}
                className="w-full py-5 rounded-xl font-bold bg-slate-900 hover:bg-[#323236] text-white transition-all text-xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    로그인 중...
                  </>
                ) : (
                  '로그인'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Footer Notice */}
        <p className="text-center text-[10px] text-slate-500 mt-6">
          © {new Date().getFullYear()} SSC 스파르타. All rights reserved.
        </p>
      </div>
    </main>
  );
}
