import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

export const STUDENT_SESSION_COOKIE = 'student-session';

// 학생 세션 서명용 비밀키 (전용 키 우선, 없으면 어드민 키 재사용)
function studentSessionSecret(): string | null {
  return process.env.STUDENT_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || null;
}

// 학생 id를 HMAC-SHA256으로 서명한 세션 토큰 발급: `<id>.<sig>`
// 쿠키가 평문 id가 아니라 서명값이므로 클라이언트가 id를 임의로 바꿔 타인을 사칭할 수 없다.
export function signStudentSession(id: string): string {
  const secret = studentSessionSecret();
  if (!secret) throw new Error('STUDENT_SESSION_SECRET(또는 ADMIN_SESSION_SECRET)이 설정되지 않았습니다.');
  const sig = createHmac('sha256', secret).update(id).digest('hex');
  return `${id}.${sig}`;
}

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const store = await cookies();
  const value = store.get('admin-session')?.value;
  if (!value) return false;
  // 타이밍 사이드채널 완화를 위해 timingSafeEqual 사용
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// 학생 세션에서 검증된 학생 id (서명 불일치/미서명 쿠키는 거부)
export async function getStudentSessionId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(STUDENT_SESSION_COOKIE)?.value;
  if (!raw) return null;
  const secret = studentSessionSecret();
  if (!secret) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null; // 서명 형식이 아니면(레거시 평문 쿠키 포함) 거부
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(id).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

// 특정 학생 리소스에 대한 열람 권한: 관리자이거나 본인 학생일 때만 true
export async function canViewStudent(studentId: string): Promise<boolean> {
  if (await isAdmin()) return true;
  const sid = await getStudentSessionId();
  return sid === studentId;
}
