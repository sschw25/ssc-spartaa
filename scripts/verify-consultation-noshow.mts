import assert from 'node:assert';
import { addConsultationBooking, patchConsultationBooking, getConsultationBookings, removeConsultationBookingsForStudent } from '../lib/store';
import type { ConsultationBooking } from '../lib/types/student';

async function main() {
  const campus = '__verify_noshow__';
  const booking: ConsultationBooking = {
    id: `cbk_test_${Math.random().toString(36).slice(2, 7)}`,
    studentId: 'stu_test', studentName: '검증', campus,
    date: '2026-07-06', weekday: 'mon', slot: '14:00', counselor: '센터장',
    kind: 'regular', status: 'booked', source: 'admin', createdAt: new Date().toISOString(),
  };
  await addConsultationBooking(booking);

  const noshow = await patchConsultationBooking(campus, booking.id, {
    status: 'noshow', resolvedAt: new Date().toISOString(), resolvedBy: '센터장',
  });
  assert.ok(noshow && noshow.status === 'noshow' && noshow.resolvedBy === '센터장', 'noshow 전이 실패');

  await removeConsultationBookingsForStudent(campus, 'stu_test'); // 정리
  const after = await getConsultationBookings(campus);
  assert.ok(!after.find((b) => b.id === booking.id), '정리 실패');

  console.log('PASS: noshow 전이');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
