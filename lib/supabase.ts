import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Student, SharedMaterial, BookProgress, LectureProgress } from './types/student';
import { mergeOrphanMaterials } from './db';

// ── 환경 변수 ────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

let cachedClient: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

// ── 매핑 헬퍼 ────────────────────────────────────────────────
// subjects 를 단일 진실 소스로 두고, 하위 호환을 위해 최상위 books/lectures 를 파생 생성한다.
function flattenSubjects(subjects: any[]): { books: BookProgress[]; lectures: LectureProgress[] } {
  const books: BookProgress[] = [];
  const lectures: LectureProgress[] = [];
  (subjects || []).forEach((s) => {
    (s.books || []).forEach((b: BookProgress) => books.push(b));
    (s.lectures || []).forEach((l: LectureProgress) => lectures.push(l));
  });
  return { books, lectures };
}

function rowToStudent(r: any): Student {
  const subjects = (r.subjects || []) as any[];
  const { books, lectures } = flattenSubjects(subjects);
  return {
    id: r.id,
    name: r.name,
    campus: r.campus,
    manager: r.manager || '',
    contact: r.contact || '',
    lifeComment: r.life_comment || '',
    studentLifeComment: r.student_life_comment || '',
    specialNote: r.special_note || '',
    nextConsultationDate: r.next_consultation_date || undefined,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    speedMultiplier: r.speed_multiplier !== undefined && r.speed_multiplier !== null ? Number(r.speed_multiplier) : 1.0,
    books,
    lectures,
    consultationLogs: r.consultation_logs || [],
    grades: r.grades || [],
    subjects,
  };
}

function studentToRow(student: Student, nowIso: string) {
  // 최상위 books/lectures 중 과목에 없는 고아 항목을 흡수하여 subjects 를 완전한 단일 소스로 만든다.
  const subjects = mergeOrphanMaterials(
    student.subjects || [],
    student.books || [],
    student.lectures || [],
    nowIso
  );
  return {
    id: student.id,
    name: student.name,
    campus: student.campus,
    manager: student.manager || '',
    contact: student.contact || '',
    next_consultation_date: student.nextConsultationDate || null,
    speed_multiplier: student.speedMultiplier ?? 1.0,
    life_comment: student.lifeComment || '',
    special_note: student.specialNote || '',
    student_life_comment: student.studentLifeComment || '',
    subjects,
    consultation_logs: student.consultationLogs || [],
    grades: student.grades || [],
    updated_at: nowIso,
    created_at: student.createdAt || nowIso,
  };
}

function rowToMaterial(r: any): SharedMaterial {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    subject: r.subject || '',
    publisher: r.publisher || '',
    author: r.author || '',
    totalPagesOrLectures: Number(r.total_pages_or_lectures) || 0,
    unit: r.unit || undefined,
    createdAt: r.created_at || '',
  };
}

// ── 학생 CRUD ────────────────────────────────────────────────
export async function getStudentsSupabase(): Promise<Student[]> {
  const { data, error } = await getClient()
    .from('students')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToStudent);
}

export async function getStudentByIdSupabase(id: string): Promise<Student | null> {
  const { data, error } = await getClient()
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToStudent(data) : null;
}

export async function saveStudentSupabase(student: Student): Promise<Student> {
  const nowIso = new Date().toISOString();
  const row = studentToRow(student, nowIso);
  // 단일 행 upsert — 학생 수와 무관하게 O(1)
  const { data, error } = await getClient()
    .from('students')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToStudent(data);
}

export async function deleteStudentSupabase(id: string): Promise<boolean> {
  const { error } = await getClient().from('students').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ── 공유 교재/강의 ───────────────────────────────────────────
export async function readSharedMaterialsSupabase(): Promise<SharedMaterial[]> {
  const { data, error } = await getClient().from('shared_materials').select('*');
  if (error) throw error;
  return (data || []).map(rowToMaterial);
}

export async function saveSharedMaterialSupabase(material: SharedMaterial): Promise<SharedMaterial> {
  const client = getClient();
  // 기존 db.ts 동작 유지: id 또는 (name+type) 동일하면 갱신, 아니면 신규
  const { data: existing } = await client
    .from('shared_materials')
    .select('id')
    .or(`id.eq.${material.id},and(name.eq.${material.name},type.eq.${material.type})`)
    .limit(1);

  const targetId = existing && existing.length > 0 ? existing[0].id : material.id;
  const row = {
    id: targetId,
    type: material.type,
    name: material.name,
    subject: material.subject || '',
    publisher: material.publisher || '',
    author: material.author || '',
    total_pages_or_lectures: Number(material.totalPagesOrLectures) || 0,
    unit: material.unit || '',
    created_at: material.createdAt || new Date().toISOString(),
  };
  const { data, error } = await client
    .from('shared_materials')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToMaterial(data);
}
