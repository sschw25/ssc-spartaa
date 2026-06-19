import { createHmac, randomBytes } from 'node:crypto';

// 솔라피(SOLAPI) 기반 등하원 문자 발송.
// 필요한 환경변수(.env.local):
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(사전 등록된 발신번호)
//   SOLAPI_TEST_MODE=Y 로 두면 실제 발송 없이 로그만 남깁니다.

const API_KEY = process.env.SOLAPI_API_KEY;
const API_SECRET = process.env.SOLAPI_API_SECRET;
const SENDER = (process.env.SOLAPI_SENDER || '').replace(/\D/g, '');
const TEST_MODE = process.env.SOLAPI_TEST_MODE === 'Y';
const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';

export type AttendAction = 'in' | 'out';

export interface AttendNotifyInput {
  studentName: string;
  action: AttendAction;
  time: string; // 'HH:MM' (KST)
  minutes?: number | null;
  parentPhone?: string;
  studentPhone?: string;
  targets?: Array<'parent' | 'student'>;
}

const onlyDigits = (value?: string) => (value || '').replace(/\D/g, '');

function buildMessage(name: string, action: AttendAction, time: string, minutes?: number | null): string {
  if (action === 'in') {
    return `[SSC스파르타] ${name} 학생이 ${time}에 등원했습니다.`;
  }

  let studyText = '';
  if (minutes && minutes > 0) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const duration = `${hours > 0 ? `${hours}시간 ` : ''}${mins}분`;
    studyText = ` 오늘 순공 시간은 ${duration}입니다.`;
  }

  return `[SSC스파르타] ${name} 학생이 ${time}에 하원했습니다.${studyText}`;
}

function resolveRecipients(input: AttendNotifyInput): string[] {
  const targets = input.targets && input.targets.length ? input.targets : ['parent'];
  const recipients: string[] = [];

  if (targets.includes('parent')) recipients.push(onlyDigits(input.parentPhone));
  if (targets.includes('student')) recipients.push(onlyDigits(input.studentPhone));

  return Array.from(new Set(recipients.filter((phone) => phone.length >= 10)));
}

function buildAuthorizationHeader(): string {
  const dateTime = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', API_SECRET!)
    .update(dateTime + salt)
    .digest('hex');

  return `HMAC-SHA256 apiKey=${API_KEY}, date=${dateTime}, salt=${salt}, signature=${signature}`;
}

async function sendSolapiSms(recipients: string[], message: string): Promise<number> {
  const body = {
    messages: recipients.map((to) => ({
      to,
      from: SENDER,
      text: message,
    })),
  };

  const response = await fetch(SOLAPI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: buildAuthorizationHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messageText = data?.errorMessage || data?.message || response.statusText;
    throw new Error(`솔라피 문자 발송 실패: ${messageText}`);
  }

  const failedCount = Array.isArray(data?.failedMessageList)
    ? data.failedMessageList.length
    : Number(data?.failedCount || data?.groupInfo?.failedCount || 0);

  return Math.max(0, recipients.length - failedCount);
}

// 등하원 알림 발송. 실패해도 등하원 처리는 막지 않도록 호출부에서 예외를 삼킵니다.
export async function notifyAttendance(input: AttendNotifyInput): Promise<{ sent: number; skipped?: string }> {
  if (!API_KEY || !API_SECRET || !SENDER) {
    console.log('[sms] 솔라피 환경변수 미설정으로 발송 생략:', input.studentName, input.action);
    return { sent: 0, skipped: 'not-configured' };
  }

  const recipients = resolveRecipients(input);
  if (recipients.length === 0) return { sent: 0, skipped: 'no-recipient' };

  const message = buildMessage(input.studentName, input.action, input.time, input.minutes);
  if (TEST_MODE) {
    console.log('[sms] SOLAPI_TEST_MODE=Y 발송 생략:', recipients, message);
    return { sent: recipients.length, skipped: 'test-mode' };
  }

  try {
    const sent = await sendSolapiSms(recipients, message);
    if (sent < recipients.length) {
      console.warn(`[sms] 일부 문자 발송 실패: ${sent}/${recipients.length}건 성공`);
    }
    return { sent };
  } catch (error) {
    console.warn('[sms] 문자 발송 예외:', (error as Error)?.message);
    return { sent: 0 };
  }
}
