import { cookies } from 'next/headers';

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const store = await cookies();
  return store.get('admin-session')?.value === secret;
}

// 학생 세션에 저장된 학생 id (없으면 null)
export async function getStudentSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get('student-session')?.value || null;
}

// 특정 학생 리소스에 대한 열람 권한: 관리자이거나 본인 학생일 때만 true
export async function canViewStudent(studentId: string): Promise<boolean> {
  if (await isAdmin()) return true;
  const sid = await getStudentSessionId();
  return sid === studentId;
}
