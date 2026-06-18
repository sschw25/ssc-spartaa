import crypto from 'crypto';

// 키오스크 QR용 짧은 만료 서명 토큰.
// 30초 윈도우마다 토큰이 바뀌고, 검증 시 현재/직전 윈도우만 허용 → 캡처본을 나중에/원격에서 재사용 불가.
const SECRET = process.env.ATTEND_TOKEN_SECRET || 'ssc-attend-dev-secret-change-me';
const WINDOW_MS = 30_000;

function sign(windowId: number): string {
  return crypto.createHmac('sha256', SECRET).update(String(windowId)).digest('base64url').slice(0, 20);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function createAttendToken(now: number = Date.now()): string {
  const w = Math.floor(now / WINDOW_MS);
  return `${w}.${sign(w)}`;
}

export function verifyAttendToken(token: string, now: number = Date.now()): boolean {
  if (!token || !token.includes('.')) return false;
  const [wStr, sig] = token.split('.');
  const w = Number(wStr);
  if (!Number.isFinite(w) || !sig) return false;
  const current = Math.floor(now / WINDOW_MS);
  for (const cand of [current, current - 1]) {
    if (w === cand && safeEqual(sig, sign(cand))) return true;
  }
  return false;
}

export const ATTEND_WINDOW_MS = WINDOW_MS;
