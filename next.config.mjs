/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // 빌드 시 타입 검사 게이트 활성화 — 리팩터 회귀를 프로덕션 전에 차단.
    // (현재 `tsc --noEmit` 0 에러 상태)
    ignoreBuildErrors: false,
  },
  // 전 경로 보안 헤더. CSP는 인라인 스크립트/Vercel Analytics 부작용 위험이 커서 이번엔 제외.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
