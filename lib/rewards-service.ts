import { Student } from './types/student';
import { getStudentById, saveStudent, getStudySessions, activeBackend } from './store';

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
  const student = await getStudentById(studentId);
  if (!student) return { granted: false, reasons: [] };

  let noteObj: any = {};
  try {
    if (student.specialNote) {
      noteObj = JSON.parse(student.specialNote);
      if (typeof noteObj !== 'object' || noteObj === null) {
        noteObj = { noteText: student.specialNote };
      }
    }
  } catch {
    noteObj = { noteText: student.specialNote || '' };
  }

  if (!noteObj.rewards_log) {
    noteObj.rewards_log = [];
  }

  const todayKey = getSeoulDateKey();
  const grantedMissions: string[] = [];
  let couponsToGrant = 0;

  // 1. 뽀모도로 2시간 달성 미션 (하루 2세션 이상 집중 성공)
  const todayPomodoroCount = noteObj.pomodoro_sessions?.[todayKey] || 0;
  const pomodoroMissionName = '오전 뽀모도로 2시간 달성';
  const hasPomodoroRewardToday = noteObj.rewards_log.some(
    (log: any) => log.date === todayKey && log.missionName === pomodoroMissionName
  );

  if (todayPomodoroCount >= 2 && !hasPomodoroRewardToday) {
    couponsToGrant += 1;
    noteObj.rewards_log.push({
      date: todayKey,
      missionName: pomodoroMissionName,
      status: 'completed',
      rewardGranted: 1
    });
    grantedMissions.push(pomodoroMissionName);
  }

  // 2. 지각 0회 & 11시 등원 완료 미션
  const attendanceMissionName = '지각 0회 및 등원 완료';
  const hasAttendanceRewardToday = noteObj.rewards_log.some(
    (log: any) => log.date === todayKey && log.missionName === attendanceMissionName
  );

  if (!hasAttendanceRewardToday) {
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
          const maxLimitTotalMin = 11 * 60; // 11시 등원 완료 조건

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
        if (adjustedHours < 11) {
          checkInOnTime = true;
        }
      }
    }

    if (checkInOnTime) {
      couponsToGrant += 1;
      noteObj.rewards_log.push({
        date: todayKey,
        missionName: attendanceMissionName,
        status: 'completed',
        rewardGranted: 1
      });
      grantedMissions.push(attendanceMissionName);
    }
  }

  if (couponsToGrant > 0) {
    student.leaveCoupons = (student.leaveCoupons || 0) + couponsToGrant;
    student.specialNote = JSON.stringify(noteObj);
    await saveStudent(student);
    return { granted: true, reasons: grantedMissions };
  }

  return { granted: false, reasons: [] };
}
