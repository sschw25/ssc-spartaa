// 베스트-에포트 인메모리 레이트 리미터.
// 단일 인스턴스(개발/롱러닝 서버)에서 동작. 서버리스(Vercel) 다중 인스턴스에선
// 인스턴스별로만 적용되므로, 운영 강화 시 Supabase/Upstash 기반으로 교체 권장.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

// 요청에서 클라이언트 IP 추출 (프록시 헤더 우선)
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
