import { Student } from './types/student';
import { getStudentById, patchStudentProgress, getStudySessions, activeBackend } from './store';
import { getMissionConfig } from './mission-engine';
import { MISSION_META } from './missions';
import { readActivityEnvelope, writeActivityEnvelope } from './student-activity';

const getSeoulDateKey = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

export async function checkAndGrantRewards(studentId: string): Promise<{ granted: boolean; reasons: string[] }> {
  // optimistic locking: conflict 시 fresh 데이터로 재평가·재시도(쿠폰 적립이 동시 저장에 유실되지 않게). 멱등성은 rewards_log.
  for (let attempt = 0; attempt < 2; attempt++) {
  const student = await getStudentById(studentId);
  if (!student) return { granted: false, reasons: [] };
  const originalUpdatedAt = student.updatedAt ?? '';

  const noteObj: any = readActivityEnvelope(student);
  if (!noteObj.rewards_log) {
    noteObj.rewards_log = [];
  }

  const config = await getMissionConfig();
  const todayKey = getSeoulDateKey();
  const grantedMissions: string[] = [];
  let couponsToGrant = 0;

  // 1. 하루 뽀모도로 N세션 미션 (설정형)
  const pomodoroCfg = config.daily_pomodoro;
  const todayPomodoroCount = noteObj.pomodoro_sessions?.[todayKey] || 0;
  const pomodoroMissionName = MISSION_META.daily_pomodoro.name;
  const hasPomodoroRewardToday = noteObj.rewards_log.some(
    (log: any) => log.date === todayKey && log.missionName === pomodoroMissionName
  );

  if (pomodoroCfg.enabled && todayPomodoroCount >= (pomodoroCfg.pomodoroSessions ?? 2) && !hasPomodoroRewardToday) {
    couponsToGrant += pomodoroCfg.coupons;
    noteObj.rewards_log.push({
      date: todayKey,
      missionName: pomodoroMissionName,
      status: 'completed',
      rewardGranted: pomodoroCfg.coupons,
    });
    grantedMissions.push(pomodoroMissionName);
  }

  // 2. 정시 등원(지각 0) 미션 (설정형)
  const checkinCfg = config.punctual_checkin;
  const attendanceMissionName = MISSION_META.punctual_checkin.name;
  const checkinByHour = checkinCfg.checkinByHour ?? 11;
  const hasAttendanceRewardToday = noteObj.rewards_log.some(
    (log: any) => log.date === todayKey && log.missionName === attendanceMissionName
  );

  if (checkinCfg.enabled && !hasAttendanceRewardToday) {
    let checkInOnTime = false;
    if (activeBackend() === 'supabase') {
      try {
        const sessions = await getStudySessions(studentId, todayKey);
        const todaySession = sessions.find(s => s.date === todayKey);
        if (todaySession && todaySession.check_in) {
          const checkInDate = new Date(todaySession.check_in);
          const limitTime = student.expectedArrival || '08:20';
          const [limitHour, limitMin] = limitTime.split(':').map(Number);
          
          // 서울 시간대 기준으로 시/분 확인
          const seoulHours = checkInDate.getUTCHours() + 9; // 단순 UTC+9 보정 (정밀 계산은 Next.js 서버 타임 기준)
          const adjustedHours = seoulHours >= 24 ? seoulHours - 24 : seoulHours;
          const minutes = checkInDate.getUTCMinutes();
          
          const checkInTotalMin = adjustedHours * 60 + minutes;
          const limitTotalMin = limitHour * 60 + limitMin;
          const maxLimitTotalMin = checkinByHour * 60; // 설정된 등원 마감 시각 조건

          if (checkInTotalMin <= limitTotalMin && checkInTotalMin <= maxLimitTotalMin) {
            checkInOnTime = true;
          }
        }
      } catch {
        // 백엔드 에러 시 안전하게 패스
      }
    } else {
      // 로컬 json 모드인 경우 자가 점검표 제출을 등원으로 간주하여 점검표가 생성된 경우 11시 전 등원으로 쳐줌
      const todayChecklist = noteObj.daily_checklist?.[todayKey];
      if (todayChecklist && todayChecklist.submitted_at) {
        const checkInDate = new Date(todayChecklist.submitted_at);
        const seoulHours = checkInDate.getUTCHours() + 9;
        const adjustedHours = seoulHours >= 24 ? seoulHours - 24 : seoulHours;
        if (adjustedHours < checkinByHour) {
          checkInOnTime = true;
        }
      }
    }

    if (checkInOnTime) {
      couponsToGrant += checkinCfg.coupons;
      noteObj.rewards_log.push({
        date: todayKey,
        missionName: attendanceMissionName,
        status: 'completed',
        rewardGranted: checkinCfg.coupons,
      });
      grantedMissions.push(attendanceMissionName);
    }
  }

  if (couponsToGrant > 0) {
    student.leaveCoupons = (student.leaveCoupons || 0) + couponsToGrant;
    writeActivityEnvelope(student, noteObj);
    const saved = await patchStudentProgress(student, originalUpdatedAt);
    if (saved === 'conflict') continue;
    return { granted: true, reasons: grantedMissions };
  }

  return { granted: false, reasons: [] };
  }

  // 재시도 소진(연속 conflict) — 이번엔 미지급, 다음 트리거에서 재평가됨
  return { granted: false, reasons: [] };
}
