import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { getStudentById } from './store';

export const STUDENT_SESSION_COOKIE = 'student-session';

// 관리자 계정의 허용 campus/role 값 (AdminAccount 타입과 일치)
export const ADMIN_CAMPUSES = ['all', 'wonju', 'chuncheon', 'chungju'] as const;
export const ADMIN_ROLES = ['super', 'campus_admin'] as const;
export type AdminCampus = (typeof ADMIN_CAMPUSES)[number];
export type AdminRole = (typeof ADMIN_ROLES)[number];
export function isValidAdminCampus(v: unknown): v is AdminCampus {
  return typeof v === 'string' && (ADMIN_CAMPUSES as readonly string[]).includes(v);
}
export function isValidAdminRole(v: unknown): v is AdminRole {
  return typeof v === 'string' && (ADMIN_ROLES as readonly string[]).includes(v);
}

export interface AdminSession {
  id: string;
  username: string;
  campus: string;
  role: string;
}

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

// 관리자 세션 서명 발급: `<id>:<username>:<campus>:<role>.<sig>`
export function signAdminSession(session: AdminSession): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET이 설정되지 않았습니다.');
  const payload = `${session.id}:${session.username}:${session.campus}:${session.role}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// 관리자 세션 파싱 및 검증
export async function getAdminSession(): Promise<AdminSession | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  const store = await cookies();
  const value = store.get('admin-session')?.value;
  if (!value) return null;

  // 레거시 세션 폴백 (쿠키가 환경 변수의 세션 시크릿과 완전히 일치하면 마스터 관리자 세션으로 처리)
  if (value === secret) {
    return {
      id: 'super_admin',
      username: 'admin',
      campus: 'all',
      role: 'super',
    };
  }

  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const parts = payload.split(':');
  if (parts.length !== 4) return null;
  const [id, username, campus, role] = parts;
  return { id, username, campus, role };
}

export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

export async function getAdminCampus(): Promise<string | null> {
  const session = await getAdminSession();
  return session ? session.campus : null;
}

/**
 * 관리자가 특정 학생에 접근할 권한이 있는지 체크
 * - 슈퍼 관리자('all')는 전원 접근 가능
 * - 캠퍼스 관리자는 본인 캠퍼스 소속 학생만 접근 가능
 */
export async function canAdminAccessStudent(studentId: string): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  if (session.campus === 'all') return true;

  const student = await getStudentById(studentId);
  if (!student) return false;
  return student.campus === session.campus;
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
  if (await isAdmin()) {
    return canAdminAccessStudent(studentId);
  }
  const sid = await getStudentSessionId();
  return sid === studentId;
}

