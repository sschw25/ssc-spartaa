import {
  buildUpcomingSchedule, daysUntil, isOtEventVisibleToStudent, isCampusEventTargetedToStudent,
  SCHEDULE_WINDOW_DAYS,
} from '../../lib/upcoming-schedule';
import type { CampusEvent, MockExam, OtEvent, Student } from '../../lib/types/student';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('ok:', msg);
}

const TODAY = '2026-07-02';

// 최소 학생 스텁 — 판정에 쓰는 필드만 채운다.
function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    campus: 'wonju',
    contact: '경찰 준비',
    ...overrides,
  } as Student;
}

function makeOt(overrides: Partial<OtEvent> = {}): OtEvent {
  return { id: 'ot1', name: '신학기 OT', date: '2026-07-10', createdAt: '', ...overrides };
}
function makeMock(overrides: Partial<MockExam> = {}): MockExam {
  return { id: 'm1', name: '7월 모의고사', date: '2026-07-12', notifiedAt: '2026-07-01T00:00:00Z', createdAt: '', ...overrides };
}
function makeEvent(overrides: Partial<CampusEvent> = {}): CampusEvent {
  return {
    id: 'e1', title: '클린데이', date: '2026-07-05', category: 'mission',
    isMission: true, notifiedAt: '2026-07-01T00:00:00Z', createdAt: '', ...overrides,
  };
}

// 1) daysUntil — 오늘/미래/과거/형식불량
assert(daysUntil('2026-07-02', TODAY) === 0, 'daysUntil 오늘=0');
assert(daysUntil('2026-07-05', TODAY) === 3, 'daysUntil 미래=+3');
assert(daysUntil('2026-06-30', TODAY) === -2, 'daysUntil 과거=-2');
assert(daysUntil('bad-date', TODAY) === null, 'daysUntil 형식불량=null');

// 2) OT 노출 규칙 — 센터 대상 + (notifiedAt or D-3)
const student = makeStudent();
assert(!isOtEventVisibleToStudent(makeOt({ campus: 'chuncheon' }), student, TODAY), 'OT 타센터 → 비노출');
assert(isOtEventVisibleToStudent(makeOt({ campus: 'wonju', notifiedAt: 'x' }), student, TODAY), 'OT 발송됨 → 노출');
assert(!isOtEventVisibleToStudent(makeOt({ date: '2026-07-10' }), student, TODAY), 'OT 미발송 D-8 → 비노출');
assert(isOtEventVisibleToStudent(makeOt({ date: '2026-07-05' }), student, TODAY), 'OT 미발송 D-3 → 자동 노출');
assert(isOtEventVisibleToStudent(makeOt({ campus: 'all', notifiedAt: 'x' }), student, TODAY), 'OT campus=all → 전체 노출');

// 3) 참여미션 대상 판정 — 센터 기본 / 지정 학생
assert(isCampusEventTargetedToStudent(makeEvent(), student), '행사 campus 미지정 → 대상');
assert(!isCampusEventTargetedToStudent(makeEvent({ campus: 'chuncheon' }), student), '행사 타센터 → 비대상');
assert(isCampusEventTargetedToStudent(makeEvent({ targetMode: 'students', targetStudentIds: ['s1'] }), student), '행사 지정학생 포함 → 대상');
assert(!isCampusEventTargetedToStudent(makeEvent({ targetMode: 'students', targetStudentIds: ['s2'] }), student), '행사 지정학생 미포함 → 비대상');

// 4) 집계 — 종류별 포함 + 임박순 정렬
const items = buildUpcomingSchedule({
  student,
  otEvents: [makeOt({ notifiedAt: 'x', date: '2026-07-10' })],
  mockExams: [makeMock({ date: '2026-07-12' })],
  campusEvents: [makeEvent({ date: '2026-07-05' })],
  todayKey: TODAY,
});
assert(items.length === 3, '3종 일정 모두 포함');
assert(items[0].kind === 'event' && items[0].dday === 3, '임박순 1위 = D-3 행사');
assert(items[1].kind === 'ot' && items[1].dday === 8, '임박순 2위 = D-8 OT');
assert(items[2].kind === 'mock' && items[2].dday === 10, '임박순 3위 = D-10 모의고사');
assert(items.every((i) => i.needsResponse), '무응답 → 모두 needsResponse');

// 5) 30일 윈도우 — 과거/윈도우 밖 제외
const windowed = buildUpcomingSchedule({
  student,
  otEvents: [
    makeOt({ id: 'past', notifiedAt: 'x', date: '2026-07-01' }),
    makeOt({ id: 'far', notifiedAt: 'x', date: '2026-08-05' }),
    makeOt({ id: 'edge', notifiedAt: 'x', date: '2026-08-01' }),
  ],
  mockExams: [], campusEvents: [], todayKey: TODAY,
});
assert(windowed.length === 1 && windowed[0].id === 'ot_edge', `과거·${SCHEDULE_WINDOW_DAYS}일 밖 제외, D-30 경계 포함`);

// 6) 응답 상태 반영 — 확정 불참/거절 제외, 참석 확정은 needsResponse=false
const responded = buildUpcomingSchedule({
  student: makeStudent({
    otEvents: [{ eventId: 'ot1', status: 'absent', updatedAt: '' }],
    mockExams: [{ examId: 'm1', status: 'attending', updatedAt: '' }],
    eventParticipations: [{ eventId: 'e1', status: 'declined', respondedAt: '' }],
  }),
  otEvents: [makeOt({ notifiedAt: 'x' })],
  mockExams: [makeMock()],
  campusEvents: [makeEvent()],
  todayKey: TODAY,
});
assert(responded.length === 1, 'OT 확정불참·행사 거절 제외 → 모의고사만');
assert(responded[0].kind === 'mock' && !responded[0].needsResponse, '참석 확정 모의고사 → needsResponse=false');

// 7) 모의고사 노출 규칙 재사용 — 미발송 제외, 직렬(contact substring) 대상 필터
const mockScoped = buildUpcomingSchedule({
  student,
  otEvents: [], campusEvents: [], todayKey: TODAY,
  mockExams: [
    makeMock({ id: 'unnotified', notifiedAt: undefined }),
    makeMock({ id: 'other-type', targetExamTypes: ['수능'] }),
    makeMock({ id: 'my-type', targetExamTypes: ['경찰'] }),
  ],
});
assert(mockScoped.length === 1 && mockScoped[0].id === 'mock_my-type', '모의고사: 미발송·타직렬 제외, contact 직렬 매칭만');

// 8) 참여미션 — isMission/notifiedAt 필수, 진행 중 다중일 행사 dday=0 클램프
const eventScoped = buildUpcomingSchedule({
  student,
  otEvents: [], mockExams: [], todayKey: TODAY,
  campusEvents: [
    makeEvent({ id: 'plain', isMission: false }),
    makeEvent({ id: 'silent', notifiedAt: undefined }),
    makeEvent({ id: 'ongoing', date: '2026-06-30', endDate: '2026-07-03', startTime: '18:00' }),
  ],
});
assert(eventScoped.length === 1 && eventScoped[0].id === 'event_ongoing', '행사: 일반일정·미발송 제외');
assert(eventScoped[0].dday === 0 && eventScoped[0].startTime === '18:00', '진행 중 다중일 행사 → D-Day(0) + 시간 유지');

// 9) 날짜 형식 불량 방어
const badDates = buildUpcomingSchedule({
  student,
  otEvents: [makeOt({ notifiedAt: 'x', date: 'invalid' })],
  mockExams: [], campusEvents: [], todayKey: TODAY,
});
assert(badDates.length === 0, '형식 불량 날짜는 제외');

if (failures > 0) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nAll upcoming-schedule checks passed');
