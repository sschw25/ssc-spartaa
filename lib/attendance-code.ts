// 출결번호(= 학생 포털 로그인 비밀번호) 규칙 검증.
// - 숫자 6자리
// - 휴대폰 번호(본인/학부모)와 겹치지 않을 것 (추측 방지)
// 가입신청과 비밀번호 변경 신청에서 공통으로 사용한다.

import bcrypt from 'bcryptjs';

export function normalizeAttendanceCode(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

// 저장된 해시와 입력값을 비교한다.
// 기존(임의 비밀번호) 데이터 호환을 위해 원문을 먼저 비교하고,
// 실패 시 숫자만 남긴 출결번호로 한 번 더 비교한다(하이픈/공백 입력 허용).
export async function compareAttendanceCode(value: unknown, hash: string): Promise<boolean> {
  const raw = String(value ?? '');
  if (await bcrypt.compare(raw, hash)) return true;

  const attendanceCode = normalizeAttendanceCode(raw);
  return attendanceCode !== raw && attendanceCode.length > 0
    ? bcrypt.compare(attendanceCode, hash)
    : false;
}

// 통과 시 null, 실패 시 한국어 에러 메시지 반환.
export function validateAttendanceCode(code: string, phones: Array<string | undefined | null>): string | null {
  if (!/^\d{6}$/.test(code)) {
    return '출결번호는 숫자 6자리로 입력해 주세요.';
  }
  for (const phone of phones) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (digits && digits.includes(code)) {
      return '출결번호는 휴대폰 번호와 겹치지 않는 숫자로 정해 주세요.';
    }
  }
  return null;
}
