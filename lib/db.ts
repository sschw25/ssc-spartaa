import fs from 'fs';
import path from 'path';
import { Student, BookProgress, LectureProgress, ConsultationLog, GradeItem, SubjectProgress, SharedMaterial, AdminAccount } from './types/student';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'students.json');
const SHARED_DB_FILE = path.join(DB_DIR, 'shared_materials.json');
const ADMIN_DB_FILE = path.join(DB_DIR, 'admin_accounts.json');
const SETTINGS_FILE = path.join(DB_DIR, 'app_settings.json');

// ── 전역 설정(key/value) 로컬 폴백 ──
export function getAppSettingLocal(key: string): any | null {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    return all && typeof all === 'object' ? (all[key] ?? null) : null;
  } catch {
    return null;
  }
}

export function setAppSettingLocal(key: string, value: any): void {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  let all: Record<string, any> = {};
  try {
    if (fs.existsSync(SETTINGS_FILE)) all = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) || {};
  } catch { all = {}; }
  all[key] = value;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

const normalizeStudyTime = (value: unknown): SubjectProgress['studyTime'] => {
  return value === 'morning' || value === 'afternoon' || value === 'night' ? value : '';
};

const normalizeStudyDays = (value: unknown): NonNullable<SubjectProgress['studyDays']> => {
  const validDays = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  return Array.isArray(value)
    ? value.filter((day): day is NonNullable<SubjectProgress['studyDays']>[number] => typeof day === 'string' && validDays.has(day))
    : [];
};

// 과목(subjects)에 속하지 않은 최상위 books/lectures(고아 항목)를 '기본' 과목으로 병합.
// subjects를 단일 진실 소스로 만들어, 역방향 매핑 시 고아 항목이 유실되는 것을 방지한다.
export function mergeOrphanMaterials(
  subjects: SubjectProgress[],
  topBooks: BookProgress[] = [],
  topLectures: LectureProgress[] = [],
  updatedAt = new Date().toISOString()
): SubjectProgress[] {
  const subjectBookIds = new Set<string>();
  const subjectLectureIds = new Set<string>();
  (subjects || []).forEach((s) => {
    (s.books || []).forEach((b) => subjectBookIds.add(b.id));
    (s.lectures || []).forEach((l) => subjectLectureIds.add(l.id));
  });

  const orphanBooks = (topBooks || [])
    .filter((b) => b && b.id && !subjectBookIds.has(b.id))
    .map((b) => ({ ...b, detailedPlans: b.detailedPlans || [] }));
  const orphanLectures = (topLectures || [])
    .filter((l) => l && l.id && !subjectLectureIds.has(l.id))
    .map((l) => ({ ...l, detailedPlans: l.detailedPlans || [] }));

  if (orphanBooks.length === 0 && orphanLectures.length === 0) {
    return subjects || [];
  }

  const result = (subjects || []).map((s) => ({ ...s }));
  let base = result.find((s) => s.name === '기본');
  if (!base) {
    base = {
      id: 'sub_default_orphan',
      name: '기본',
      learningGoal: '',
      studyTime: '',
      studyDays: [],
      books: [],
      lectures: [],
      updatedAt,
    };
    result.push(base);
  }
  base.books = [...(base.books || []), ...orphanBooks];
  base.lectures = [...(base.lectures || []), ...orphanLectures];
  return result;
}

// 디렉토리 및 파일 초기화
function initializeDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(SHARED_DB_FILE)) {
    fs.writeFileSync(SHARED_DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

// 공유 데이터베이스 읽기
export function readSharedMaterials(): SharedMaterial[] {
  initializeDb();
  try {
    const content = fs.readFileSync(SHARED_DB_FILE, 'utf-8');
    return JSON.parse(content) as SharedMaterial[];
  } catch (error) {
    console.error('Failed to read shared materials DB:', error);
    return [];
  }
}

// 공유 데이터베이스 쓰기
export function writeSharedMaterials(data: SharedMaterial[]): boolean {
  initializeDb();
  try {
    fs.writeFileSync(SHARED_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write shared materials DB:', error);
    return false;
  }
}

// 공유 교재/강의 단일 등록
export function saveSharedMaterial(material: SharedMaterial): SharedMaterial {
  const materials = readSharedMaterials();
  const index = materials.findIndex((m) => m.id === material.id || (m.name === material.name && m.type === material.type));

  const now = new Date().toISOString();
  const updatedMaterial = {
    ...material,
    createdAt: material.createdAt || now,
  };

  if (index >= 0) {
    // 기존에 이름과 타입이 같은 게 있으면 덮어씌움
    materials[index] = { ...materials[index], ...updatedMaterial };
  } else {
    materials.push(updatedMaterial);
  }

  writeSharedMaterials(materials);
  return updatedMaterial;
}

// 전체 데이터 읽기 + 하위 호환 마이그레이션
export function readDb(): Student[] {
  initializeDb();
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const students = JSON.parse(content) as Student[];
    
    return students.map(student => {
      // 1. subjects가 있는 경우, 하위 books와 lectures에 detailedPlans가 없으면 초기화
      if (student.subjects && student.subjects.length > 0) {
        const updatedSubjects = student.subjects.map(sub => ({
          ...sub,
          studyTime: normalizeStudyTime(sub.studyTime),
          studyDays: normalizeStudyDays(sub.studyDays),
          books: (sub.books || []).map(b => ({ ...b, detailedPlans: b.detailedPlans || [] })),
          lectures: (sub.lectures || []).map(l => ({ ...l, detailedPlans: l.detailedPlans || [] }))
        }));
        // 어느 과목에도 속하지 않은 최상위 고아 항목을 '기본' 과목으로 흡수 (유실 방지)
        const mergedSubjects = mergeOrphanMaterials(
          updatedSubjects,
          student.books || [],
          student.lectures || [],
          student.updatedAt
        );
        return {
          ...student,
          lifeComment: student.lifeComment || '',
          studentLifeComment: student.studentLifeComment || '',
          specialNote: student.specialNote || '',
          subjects: mergedSubjects
        };
      }

      // 2. subjects가 아예 없는 기존 데이터를 위한 마이그레이션
      const migratedSubjects: SubjectProgress[] = [];
      
      if ((student.books && student.books.length > 0) || (student.lectures && student.lectures.length > 0)) {
        migratedSubjects.push({
          id: `sub_default_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: '기본',
          learningGoal: '과목별 세부 학습 목표를 설정해 보세요.',
          studyTime: '',
          studyDays: [],
          books: (student.books || []).map(b => ({ ...b, detailedPlans: b.detailedPlans || [] })),
          lectures: (student.lectures || []).map(l => ({ ...l, detailedPlans: l.detailedPlans || [] })),
          updatedAt: student.updatedAt || new Date().toISOString()
        });
      }
      
      return {
        ...student,
        lifeComment: student.lifeComment || '',
        studentLifeComment: student.studentLifeComment || '',
        specialNote: student.specialNote || '',
        subjects: migratedSubjects,
        books: student.books || [],
        lectures: student.lectures || []
      };
    });
  } catch (error) {
    console.error('Failed to read local DB:', error);
    return [];
  }
}

// 전체 데이터 쓰기
export function writeDb(data: Student[]): boolean {
  initializeDb();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write local DB:', error);
    return false;
  }
}

// 전체 학생 조회
export function getStudentsLocal(): Student[] {
  return readDb();
}

// 특정 학생 조회
export function getStudentLocal(id: string): Student | undefined {
  const students = readDb();
  return students.find((s) => s.id === id);
}

// 학생 저장 (추가/수정)
export function saveStudentLocal(student: Student): Student {
  const students = readDb();
  const index = students.findIndex((s) => s.id === student.id);
  
  const now = new Date().toISOString();
  
  // 역방향 매핑 (하위 호환성 유지: subjects의 모든 books, lectures를 최상위 배열에도 동기화)
  const allBooks: BookProgress[] = [];
  const allLectures: LectureProgress[] = [];
  if (student.subjects) {
    student.subjects.forEach(sub => {
      if (sub.books) allBooks.push(...sub.books);
      if (sub.lectures) allLectures.push(...sub.lectures);
    });
  }

  const existingStudent = index >= 0 ? students[index] : null;

  const updatedStudent: Student = {
    ...student,
    books: allBooks.length > 0 ? allBooks : (student.books || []),
    lectures: allLectures.length > 0 ? allLectures : (student.lectures || []),
    passwordHash: student.passwordHash || (existingStudent ? existingStudent.passwordHash : undefined),
    updatedAt: now,
    createdAt: student.createdAt || now,
  };

  if (index >= 0) {
    students[index] = updatedStudent;
  } else {
    students.push(updatedStudent);
  }

  writeDb(students);
  return updatedStudent;
}

// 학생 삭제
export function deleteStudentLocal(id: string): boolean {
  const students = readDb();
  const filtered = students.filter((s) => s.id !== id);
  if (students.length === filtered.length) return false;
  return writeDb(filtered);
}

// ── 관리자 계정 로컬 CRUD ───────────────────────────────────────────
function initializeAdminDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(ADMIN_DB_FILE)) {
    fs.writeFileSync(ADMIN_DB_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function readAdminAccountsLocal(): AdminAccount[] {
  initializeAdminDb();
  try {
    const content = fs.readFileSync(ADMIN_DB_FILE, 'utf-8');
    return JSON.parse(content) as AdminAccount[];
  } catch (error) {
    console.error('Failed to read admin accounts DB:', error);
    return [];
  }
}

export function writeAdminAccountsLocal(data: AdminAccount[]): boolean {
  initializeAdminDb();
  try {
    fs.writeFileSync(ADMIN_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write admin accounts DB:', error);
    return false;
  }
}

export function getAdminAccountByUsernameLocal(username: string): AdminAccount | null {
  const accounts = readAdminAccountsLocal();
  return accounts.find((a) => a.username.toLowerCase() === username.toLowerCase()) || null;
}

export function saveAdminAccountLocal(admin: AdminAccount): AdminAccount {
  const accounts = readAdminAccountsLocal();
  const index = accounts.findIndex((a) => a.id === admin.id);
  if (index >= 0) {
    accounts[index] = admin;
  } else {
    accounts.push(admin);
  }
  writeAdminAccountsLocal(accounts);
  return admin;
}

export function deleteAdminAccountLocal(id: string): boolean {
  const accounts = readAdminAccountsLocal();
  const filtered = accounts.filter((a) => a.id !== id);
  if (accounts.length === filtered.length) return false;
  return writeAdminAccountsLocal(filtered);
}

