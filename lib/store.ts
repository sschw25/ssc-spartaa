// 데이터 저장소 파사드 — 1차: Supabase.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 설정되어 있으면 Supabase 를 사용하고,
// (주로 로컬 개발에서) 미설정이면 로컬 JSON(lib/db) 으로 폴백한다.
// 구글 스프레드시트 경로는 제거됨.
import { Student, SharedMaterial } from './types/student';
import {
  isSupabaseConfigured,
  getStudentsSupabase,
  getStudentByIdSupabase,
  saveStudentSupabase,
  deleteStudentSupabase,
  readSharedMaterialsSupabase,
  saveSharedMaterialSupabase,
} from './supabase';
import {
  getStudentsLocal,
  getStudentLocal,
  saveStudentLocal,
  deleteStudentLocal,
  readSharedMaterials as readSharedMaterialsLocal,
  saveSharedMaterial as saveSharedMaterialLocal,
} from './db';

export function activeBackend(): 'supabase' | 'local-json' {
  return isSupabaseConfigured() ? 'supabase' : 'local-json';
}

export async function getStudents(): Promise<Student[]> {
  return isSupabaseConfigured() ? getStudentsSupabase() : getStudentsLocal();
}

export async function getStudentById(id: string): Promise<Student | null> {
  return isSupabaseConfigured() ? getStudentByIdSupabase(id) : (getStudentLocal(id) ?? null);
}

export async function saveStudent(student: Student): Promise<Student> {
  return isSupabaseConfigured() ? saveStudentSupabase(student) : saveStudentLocal(student);
}

export async function deleteStudent(id: string): Promise<boolean> {
  return isSupabaseConfigured() ? deleteStudentSupabase(id) : deleteStudentLocal(id);
}

export async function readSharedMaterials(): Promise<SharedMaterial[]> {
  return isSupabaseConfigured() ? readSharedMaterialsSupabase() : readSharedMaterialsLocal();
}

export async function saveSharedMaterial(material: SharedMaterial): Promise<SharedMaterial> {
  return isSupabaseConfigured() ? saveSharedMaterialSupabase(material) : saveSharedMaterialLocal(material);
}
