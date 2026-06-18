'use client';

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// 입구 디스플레이용 키오스크. 30초마다 바뀌는 QR을 띄우고 학생이 본인 폰으로 스캔한다.
// (관리자 세션이 있어야 토큰을 받을 수 있음 — 관리자 기기에서 띄울 것)
export default function AttendKioskPage() {
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [refreshedAt, setRefreshedAt] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const fetchToken = async () => {
      try {
        const res = await fetch('/api/attend/token', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.success) {
          setUrl(`${window.location.origin}/attend?token=${encodeURIComponent(json.token)}`);
          setError('');
          setRefreshedAt(Date.now());
        } else {
          setError(json.message || '토큰을 받지 못했습니다. 관리자 로그인이 필요합니다.');
        }
      } catch {
        if (active) setError('네트워크 오류로 QR을 갱신하지 못했습니다.');
      }
    };
    fetchToken();
    const t = setInterval(fetchToken, 15000); // 15초마다 갱신 (30초 윈도우 내 유지)
    return () => { active = false; clearInterval(t); };
  }, []);

  return (
    <div className="min-h-screen bg-[#1D1D1F] text-white flex flex-col items-center justify-center p-8 font-sans">
      <div className="text-center mb-8">
        <p className="text-sm font-bold tracking-[0.3em] text-[#86868B] uppercase">SSC SPARTA</p>
        <h1 className="text-3xl font-bold mt-2">등하원 체크</h1>
        <p className="text-[#86868B] mt-3 text-sm">휴대폰 카메라로 아래 QR을 스캔하세요 · 처음 한 번 / 나갈 때 한 번</p>
      </div>

      <div className="bg-white rounded-3xl p-8 shadow-2xl">
        {error ? (
          <div className="w-[280px] h-[280px] flex items-center justify-center text-center text-red-600 text-sm px-6">
            {error}
          </div>
        ) : url ? (
          <QRCodeSVG value={url} size={280} level="M" includeMargin={false} />
        ) : (
          <div className="w-[280px] h-[280px] flex items-center justify-center text-[#86868B] text-sm">
            QR 생성 중…
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#86868B] mt-6">
        QR은 30초마다 자동으로 바뀝니다 (부정 출결 방지). 화면을 켜 두세요.
      </p>
    </div>
  );
}
