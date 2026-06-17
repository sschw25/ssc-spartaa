// 일회성 마이그레이션: data/students.json + data/shared_materials.json → Supabase
//
// 사용법:
//   1) Supabase 프로젝트 생성 후 supabase/schema.sql 을 SQL Editor 에서 실행
//   2) .env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 기입
//   3) node scripts/migrate-to-supabase.mjs
//
// 로컬 JSON 을 소스로 사용한다(현재 구글 시트와 동기화된 상태). 구글 자격증명은 필요 없음.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── .env.local 로드 (간단 파서) ──────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnv();

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// ── 고아 항목 흡수 (lib/db.ts 의 mergeOrphanMaterials 와 동일 로직) ──
function mergeOrphanMaterials(subjects = [], topBooks = [], topLectures = [], updatedAt) {
  const bookIds = new Set();
  const lecIds = new Set();
  subjects.forEach((s) => {
    (s.books || []).forEach((b) => bookIds.add(b.id));
    (s.lectures || []).forEach((l) => lecIds.add(l.id));
  });
  const orphanBooks = (topBooks || []).filter((b) => b && b.id && !bookIds.has(b.id)).map((b) => ({ ...b, detailedPlans: b.detailedPlans || [] }));
  const orphanLectures = (topLectures || []).filter((l) => l && l.id && !lecIds.has(l.id)).map((l) => ({ ...l, detailedPlans: l.detailedPlans || [] }));
  if (!orphanBooks.length && !orphanLectures.length) return subjects || [];
  const result = (subjects || []).map((s) => ({ ...s }));
  let base = result.find((s) => s.name === '기본');
  if (!base) {
    base = { id: 'sub_default_orphan', name: '기본', learningGoal: '', studyTime: '', studyDays: [], books: [], lectures: [], updatedAt };
    result.push(base);
  }
  base.books = [...(base.books || []), ...orphanBooks];
  base.lectures = [...(base.lectures || []), ...orphanLectures];
  return result;
}

function readJson(rel) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function run() {
  const students = readJson('data/students.json');
  const materials = readJson('data/shared_materials.json');

  const studentRows = students.map((s) => {
    const now = s.updatedAt || new Date().toISOString();
    const subjects = mergeOrphanMaterials(s.subjects || [], s.books || [], s.lectures || [], now);
    return {
      id: s.id,
      name: s.name,
      campus: s.campus || 'wonju',
      manager: s.manager || '',
      contact: s.contact || '',
      next_consultation_date: s.nextConsultationDate || null,
      speed_multiplier: s.speedMultiplier ?? 1.0,
      life_comment: s.lifeComment || '',
      special_note: s.specialNote || '',
      student_life_comment: s.studentLifeComment || '',
      subjects,
      consultation_logs: s.consultationLogs || [],
      grades: s.grades || [],
      created_at: s.createdAt || now,
      updated_at: now,
    };
  });

  const materialRows = materials.map((m) => ({
    id: m.id,
    type: m.type,
    name: m.name,
    subject: m.subject || '',
    publisher: m.publisher || '',
    author: m.author || '',
    total_pages_or_lectures: Number(m.totalPagesOrLectures) || 0,
    unit: m.unit || '',
    created_at: m.createdAt || new Date().toISOString(),
  }));

  if (studentRows.length) {
    const { error } = await supabase.from('students').upsert(studentRows, { onConflict: 'id' });
    if (error) throw error;
  }
  if (materialRows.length) {
    const { error } = await supabase.from('shared_materials').upsert(materialRows, { onConflict: 'id' });
    if (error) throw error;
  }

  const { count: sc } = await supabase.from('students').select('*', { count: 'exact', head: true });
  const { count: mc } = await supabase.from('shared_materials').select('*', { count: 'exact', head: true });
  console.log(`✅ 마이그레이션 완료 — 학생 ${studentRows.length}건 업로드 (테이블 총 ${sc}건), 공유자료 ${materialRows.length}건 (총 ${mc}건)`);
}

run().catch((e) => {
  console.error('❌ 마이그레이션 실패:', e.message || e);
  process.exit(1);
});
