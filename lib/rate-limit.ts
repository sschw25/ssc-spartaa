import { createHash } from 'node:crypto';
import {
  getAppSettingWithVersionSupabase,
  isSupabaseConfigured,
  setAppSettingIfUnchangedSupabase,
} from './supabase';

// 베스트-에포트 인메모리 레이트 리미터.
// 단일 인스턴스(개발/롱러닝 서버)에서 동작한다. 운영 서버리스에서는 sharedRateLimit을 사용한다.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
type RateLimitResult = { allowed: boolean; retryAfterSec: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
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

function isBucket(value: unknown): value is Bucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<Bucket>;
  return Number.isFinite(bucket.count) && Number.isFinite(bucket.resetAt);
}

function sharedBucketKey(key: string, limit: number, windowMs: number): string {
  const digest = createHash('sha256').update(`${key}:${limit}:${windowMs}`).digest('hex').slice(0, 32);
  return `rate_limit:${digest}`;
}

export async function sharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!isSupabaseConfigured()) return rateLimit(key, limit, windowMs);

  const settingKey = sharedBucketKey(key, limit, windowMs);
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const now = Date.now();
      const { value, version } = await getAppSettingWithVersionSupabase(settingKey);
      const bucket = isBucket(value) ? value : null;

      if (!bucket || now > bucket.resetAt) {
        const result = await setAppSettingIfUnchangedSupabase(
          settingKey,
          { count: 1, resetAt: now + windowMs },
          version,
        );
        if (result === 'ok') return { allowed: true, retryAfterSec: 0 };
        continue;
      }

      if (bucket.count >= limit) {
        return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
      }

      const result = await setAppSettingIfUnchangedSupabase(
        settingKey,
        { count: bucket.count + 1, resetAt: bucket.resetAt },
        version,
      );
      if (result === 'ok') return { allowed: true, retryAfterSec: 0 };
    }
  } catch (error) {
    console.warn('[rate-limit] 공유 레이트 리미터 사용 실패, 인메모리로 폴백:', (error as Error)?.message);
    return rateLimit(key, limit, windowMs);
  }

  return { allowed: false, retryAfterSec: 1 };
}

// 요청에서 클라이언트 IP 추출 (프록시 헤더 우선)
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
