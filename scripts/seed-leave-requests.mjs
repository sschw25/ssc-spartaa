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

async function run() {
  console.log('🔄 학생 목록을 불러오는 중...');
  const { data: students, error: fetchError } = await supabase
    .from('students')
    .select('id, name, leave_requests');

  if (fetchError) {
    console.error('❌ 학생 목록 조회 실패:', fetchError);
    process.exit(1);
  }

  if (!students || students.length === 0) {
    console.error('❌ 등록된 학생이 없습니다.');
    process.exit(1);
  }

  console.log(`📡 총 ${students.length}명의 학생을 찾았습니다.`);

  // 예시 데이터를 주입할 학생 목록
  // 6명 정도 확보
  const targetStudents = students.slice(0, 6);
  
  // 6월 23일과 6월 25일에 넣을 예시 정의
  const mockLeaves = [
    // 6월 23일 (오늘)
    {
      studentIdx: 0,
      req: {
        id: `req_mock_23_0_${Math.random().toString(36).substr(2, 5)}`,
        type: 'morning',
        date: '2026-06-23',
        reason: '치과 진료 예약',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 1,
      req: {
        id: `req_mock_23_1_${Math.random().toString(36).substr(2, 5)}`,
        type: 'afternoon',
        date: '2026-06-23',
        reason: '개인 사정',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 2,
      req: {
        id: `req_mock_23_2_${Math.random().toString(36).substr(2, 5)}`,
        type: 'afternoon',
        date: '2026-06-23',
        reason: '가족 행사 참석',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 3,
      req: {
        id: `req_mock_23_3_${Math.random().toString(36).substr(2, 5)}`,
        type: 'fullday',
        date: '2026-06-23',
        reason: '백신 접종 후 몸살 예방 휴식',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 4,
      req: {
        id: `req_mock_23_4_${Math.random().toString(36).substr(2, 5)}`,
        type: 'night',
        date: '2026-06-23',
        reason: '피로 누적으로 인한 저녁 자습 대체 휴식',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 5,
      req: {
        id: `req_mock_23_5_${Math.random().toString(36).substr(2, 5)}`,
        type: 'sick',
        date: '2026-06-23',
        reason: '감기 기운으로 이비인후과 내원 (처방전 증빙 예정)',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },

    // 6월 25일
    {
      studentIdx: 0,
      req: {
        id: `req_mock_25_0_${Math.random().toString(36).substr(2, 5)}`,
        type: 'afternoon',
        date: '2026-06-25',
        reason: '중요 학교 과제 수행',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 1,
      req: {
        id: `req_mock_25_1_${Math.random().toString(36).substr(2, 5)}`,
        type: 'fullday',
        date: '2026-06-25',
        reason: '지방 친척집 방문',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 2,
      req: {
        id: `req_mock_25_2_${Math.random().toString(36).substr(2, 5)}`,
        type: 'morning',
        date: '2026-06-25',
        reason: '컨디션 난조로 인한 오전 휴식',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 3,
      req: {
        id: `req_mock_25_3_${Math.random().toString(36).substr(2, 5)}`,
        type: 'morning',
        date: '2026-06-25',
        reason: '병원 정기 안과 검진',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 4,
      req: {
        id: `req_mock_25_4_${Math.random().toString(36).substr(2, 5)}`,
        type: 'fullday',
        date: '2026-06-25',
        reason: '가족 단체 여행',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    },
    {
      studentIdx: 5,
      req: {
        id: `req_mock_25_5_${Math.random().toString(36).substr(2, 5)}`,
        type: 'night',
        date: '2026-06-25',
        reason: '밀린 인강 집중 수강을 위한 자습 대체',
        status: 'approved',
        createdAt: new Date().toISOString()
      }
    }
  ];

  console.log('🔄 학생별 leave_requests 업데이트 중...');
  
  for (let i = 0; i < targetStudents.length; i++) {
    const student = targetStudents[i];
    
    // 현재 학생에게 해당하는 mock 데이터들만 필터링
    const currentMockLeaves = mockLeaves
      .filter(ml => ml.studentIdx === i)
      .map(ml => ml.req);

    // 기존의 leave_requests 리스트 확보
    let currentRequests = [];
    if (student.leave_requests) {
      if (typeof student.leave_requests === 'string') {
        try {
          currentRequests = JSON.parse(student.leave_requests);
        } catch {
          currentRequests = [];
        }
      } else if (Array.isArray(student.leave_requests)) {
        currentRequests = student.leave_requests;
      }
    }

    // 중복 날짜/중복 항목 제거 후 새 mock 데이터 푸시
    const filteredRequests = currentRequests.filter((r) => r.date !== '2026-06-23' && r.date !== '2026-06-25');
    const updatedRequests = [...filteredRequests, ...currentMockLeaves];

    // Supabase DB에 업데이트
    const { error: updateError } = await supabase
      .from('students')
      .update({ leave_requests: updatedRequests })
      .eq('id', student.id);

    if (updateError) {
      console.error(`❌ 학생 ${student.name} 업데이트 실패:`, updateError);
    } else {
      console.log(`✅ 학생 ${student.name} 업데이트 완료 (${currentMockLeaves.length}개 예시 주입)`);
    }
  }

  console.log('🎉 모든 예시 데이터가 정상적으로 주입되었습니다.');
}

run();
