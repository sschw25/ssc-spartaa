// 알리고(Aligo) 기반 출결 알림 발송.
// - ALIGO_KAKAO_SENDERKEY + ALIGO_KAKAO_TPL_CODE 가 있으면 카카오 알림톡(실패 시 SMS 자동 폴백)
// - 없으면 일반 SMS 로 발송
// - API 키 자체가 없으면 no-op (개발/미설정 환경에서 출결이 깨지지 않게)
//
// 필요한 환경변수(.env.local):
//   ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER(발신번호, 사전등록 필수)
//   (알림톡 사용 시) ALIGO_KAKAO_SENDERKEY, ALIGO_KAKAO_TPL_CODE
//   ALIGO_TEST_MODE=Y 로 두면 실제 발송 없이 테스트

const API_KEY = process.env.ALIGO_API_KEY;
const USER_ID = process.env.ALIGO_USER_ID;
const SENDER = (process.env.ALIGO_SENDER || '').replace(/\D/g, '');
const SENDERKEY = process.env.ALIGO_KAKAO_SENDERKEY;
const TPL_CODE = process.env.ALIGO_KAKAO_TPL_CODE;
const TEST_MODE = process.env.ALIGO_TEST_MODE === 'Y' ? 'Y' : 'N';

export type AttendAction = 'in' | 'out';

export interface AttendNotifyInput {
  studentName: string;
  action: AttendAction;
  time: string;        // 'HH:MM' (KST)
  minutes?: number | null;
  parentPhone?: string;
  studentPhone?: string;
  targets?: Array<'parent' | 'student'>;
}

const onlyDigits = (v?: string) => (v || '').replace(/\D/g, '');

function buildMessage(name: string, action: AttendAction, time: string, minutes?: number | null): string {
  if (action === 'in') {
    return `[SSC스파르타] ${name} 학생이 ${time} 등원했습니다.`;
  }
  let extra = '';
  if (minutes && minutes > 0) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    extra = ` (오늘 학습 ${h > 0 ? `${h}시간 ` : ''}${m}분)`;
  }
  return `[SSC스파르타] ${name} 학생이 ${time} 하원했습니다.${extra}`;
}

function resolveRecipients(input: AttendNotifyInput): string[] {
  const targets = input.targets && input.targets.length ? input.targets : ['parent'];
  const list: string[] = [];
  if (targets.includes('parent')) list.push(onlyDigits(input.parentPhone));
  if (targets.includes('student')) list.push(onlyDigits(input.studentPhone));
  return list.filter((p) => p.length >= 10); // 유효 번호만
}

async function sendAlimtalk(receiver: string, message: string): Promise<boolean> {
  const body = new URLSearchParams({
    apikey: API_KEY!,
    userid: USER_ID!,
    senderkey: SENDERKEY!,
    tpl_code: TPL_CODE!,
    sender: SENDER,
    receiver_1: receiver,
    subject_1: 'SSC 출결 알림',
    message_1: message,
    failover: 'Y',           // 알림톡 실패 시 SMS 자동 대체
    fsubject_1: 'SSC 출결 알림',
    fmessage_1: message,
    testMode: TEST_MODE,
  });
  const res = await fetch('https://kakaoapi.aligo.in/akv10/alimtalk/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return json?.code === 0 || json?.result_code === '1';
}

async function sendSms(receiver: string, message: string): Promise<boolean> {
  const body = new URLSearchParams({
    key: API_KEY!,
    user_id: USER_ID!,
    sender: SENDER,
    receiver,
    msg: message,
    testmode_yn: TEST_MODE,
  });
  const res = await fetch('https://apis.aligo.in/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return json?.result_code === 1 || json?.result_code === '1';
}

// 출결 알림 발송. 실패해도 throw 하지 않음(출결 흐름 비차단). 발송 건수 반환.
export async function notifyAttendance(input: AttendNotifyInput): Promise<{ sent: number; skipped?: string }> {
  if (!API_KEY || !USER_ID || !SENDER) {
    console.log('[sms] 미설정 — 발송 생략:', input.studentName, input.action);
    return { sent: 0, skipped: 'not-configured' };
  }
  const recipients = resolveRecipients(input);
  if (recipients.length === 0) return { sent: 0, skipped: 'no-recipient' };

  const message = buildMessage(input.studentName, input.action, input.time, input.minutes);
  const useAlimtalk = Boolean(SENDERKEY && TPL_CODE);

  let sent = 0;
  for (const r of recipients) {
    try {
      const ok = useAlimtalk ? await sendAlimtalk(r, message) : await sendSms(r, message);
      if (ok) sent += 1;
      else console.warn('[sms] 발송 실패(수신거부/오류 가능):', r);
    } catch (e) {
      console.warn('[sms] 발송 예외:', (e as Error)?.message);
    }
  }
  return { sent };
}
