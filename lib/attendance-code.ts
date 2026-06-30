// 출결번호(= 학생 포털 로그인 비밀번호) 규칙 검증.
// - 숫자 6자리
// - 휴대폰 번호(본인/학부모)와 겹치지 않을 것 (추측 방지)
// 가입신청과 비밀번호 변경 신청에서 공통으로 사용한다.

export function normalizeAttendanceCode(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
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
