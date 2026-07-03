// View Transitions API 래퍼 — 라우트 전환을 부드러운 크로스페이드로.
// 미지원 브라우저(Firefox 등)에선 그냥 즉시 내비게이션(자동 폴백).
//
// Next App Router 의 router.push 는 비동기라, startViewTransition 콜백이
// "새 스냅샷"을 찍기 전에 새 라우트가 렌더될 시간을 잠깐 준다(짧은 지연).

type StartViewTransition = (cb: () => void | Promise<void>) => { finished: Promise<void> };

export function navigateWithTransition(navigate: () => void) {
  const doc = typeof document !== 'undefined' ? (document as unknown as { startViewTransition?: StartViewTransition }) : null;
  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!doc?.startViewTransition || reduce) {
    navigate();
    return;
  }

  doc.startViewTransition(async () => {
    navigate();
    // 새 라우트가 페인트될 시간을 잠깐 준 뒤 "새 스냅샷"을 찍게 한다.
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}
