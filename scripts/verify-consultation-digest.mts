import assert from 'node:assert';
import { buildConsultationDigest } from '../lib/consultation-digest';

const date = '2026-07-06';
const student: any = {
  consultationLogs: [
    { id: 'r1', type: 'request', requestType: 'progress', status: 'resolved', resolvedAt: `${date}T05:00:00.000Z`, content: '진도 1주 당김' },
    { id: 'r2', type: 'request', requestType: 'subject', status: 'pending', content: '아직 처리 안됨' },
    { id: 'n1', type: 'learning', date, content: '집중도 점검' },
  ],
  leaveRequests: [
    { id: 'l1', type: 'halfDay', status: 'approved', reviewedAt: `${date}T06:00:00.000Z`, date },
    { id: 'l2', type: 'fullDay', status: 'pending' },
  ],
};

const digest = buildConsultationDigest(student, date);
assert.ok(digest.some((d) => d.kind === 'request' && d.label.includes('진도')), '처리된 변경신청 누락');
assert.ok(!digest.some((d) => d.detail === '아직 처리 안됨'), 'pending 신청이 잘못 포함됨');
assert.ok(digest.some((d) => d.kind === 'leave' && d.label.includes('승인')), '승인 휴가 누락');
assert.ok(digest.some((d) => d.kind === 'note'), '학습노트 누락');

// 다른 날짜는 비어야 함
assert.strictEqual(buildConsultationDigest(student, '2099-01-01').length, 0, '엉뚱한 날짜에 항목 발생');

console.log('PASS: consultation digest');
