// 리포트 진입(로그인 직후 포함) 시 페이드+상승 진입 — 전환 체감을 부드럽게 한다.
// (prefers-reduced-motion 은 globals.css 전역 가드가 처리)
export default function ReportTemplate({ children }: { children: React.ReactNode }) {
  return <div className="route-transition">{children}</div>;
}
