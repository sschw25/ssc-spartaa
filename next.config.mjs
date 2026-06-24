/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // 빌드 시 타입 검사 게이트 활성화 — 리팩터 회귀를 프로덕션 전에 차단.
    // (현재 `tsc --noEmit` 0 에러 상태)
    ignoreBuildErrors: false,
  },
}

export default nextConfig
