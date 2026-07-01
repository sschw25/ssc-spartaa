'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, Utensils, RefreshCw, Loader2, Plus, Trash2,
  Bell, MessageSquare, Printer, Check, X, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Student, MealPlan, MealKind, MealDay, MealOrder, MealAddRequest } from '@/lib/types/student';
import type { MealPlanRoutineTemplate } from '@/lib/meal-routines';
import { AdminTopNav } from '@/components/admin/admin-top-nav';
import { ScheduledJobsPanel } from '@/components/admin/scheduled-jobs-panel';
import {
  MEAL_DAYS, MEAL_DAY_LABELS, MEAL_KIND_LABELS, CAMPUSES, getCampusLabel,
  weekRangeLabel, formatDeadline, isPastDeadline, isClosedDay, eatsOn, orderHasMeal, mealCounts, withSelection, mondayOf,
} from '@/lib/meal';

const CAMPUS_FILTERS = ['all', ...CAMPUSES];
const DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 이번 주 월요일 (date input 기본값)
function thisMonday(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextMonday(): string {
  return addDaysYmd(thisMonday(), 7);
}

function deadlineForMealWeek(weekStart: string): string {
  return `${addDaysYmd(weekStart, -3)}T14:00`;
}

function toKstIsoFromDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}:00+09:00`).toISOString();
}

function createRoutineDraft(campus = 'all'): MealPlanRoutineTemplate {
  const now = new Date().toISOString();
  const scopedCampus = campus === 'all' ? undefined : campus;
  return {
    id: `meal_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: scopedCampus ? `${getCampusLabel(scopedCampus)} 다음 주 도시락` : '다음 주 도시락',
    active: true,
    campus: scopedCampus,
    meals: ['lunch'],
    closedDays: [],
    createDay: 1,
    createTime: '14:00',
    targetWeekOffset: 1,
    deadlineBase: 'create',
    deadlineDay: 5,
    deadlineTime: '14:00',
    notifyMode: 'none',
    notifyDay: 1,
    notifyTime: '14:00',
    createdAt: now,
    updatedAt: now,
  };
}

export default function MealsPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [campusFilter, setCampusFilter] = useState('all');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [adminCampus, setAdminCampus] = useState<string>('all');
  const [updating, setUpdating] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [routineTemplates, setRoutineTemplates] = useState<MealPlanRoutineTemplate[]>([]);
  const [routineForm, setRoutineForm] = useState<MealPlanRoutineTemplate>(() => createRoutineDraft());
  const [routineSaving, setRoutineSaving] = useState(false);
  const [routineRunning, setRoutineRunning] = useState(false);

  // 라운드 등록 폼
  const [newWeek, setNewWeek] = useState(nextMonday());
  const [newMeals, setNewMeals] = useState<Record<MealKind, boolean>>({ lunch: true, dinner: false });
  const [newDeadline, setNewDeadline] = useState(() => deadlineForMealWeek(nextMonday()));
  const [newLunchPrice, setNewLunchPrice] = useState('');
  const [newDinnerPrice, setNewDinnerPrice] = useState('');
  const [newClosedDays, setNewClosedDays] = useState<MealDay[]>([]);
  const [newCampus, setNewCampus] = useState('all');

  const handleLogout = async () => {
    try { await fetch('/api/admin/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/admin');
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stuRes, planRes, routineRes] = await Promise.all([
        fetch('/api/admin/students', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/meal-plans', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/admin/meal-routines', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (stuRes.ok) { const j = await stuRes.json(); if (j.success) setStudents(j.data || []); }
      if (planRes.ok) {
        const j = await planRes.json();
        if (j.success) { setPlans(j.plans || []); setSelectedPlanId((cur) => cur || j.plans?.[0]?.id || null); }
      }
      if (routineRes.ok) {
        const j = await routineRes.json();
        if (j.success) setRoutineTemplates(j.templates || []);
      }
    } catch {
      toast.error('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/auth/me');
        if (!res.ok) { router.replace('/admin'); return; }
        try {
          const me = await res.json();
          if (me?.campus && me.campus !== 'all') {
            setAdminCampus(me.campus);
            setNewCampus(me.campus);
            setRoutineForm(createRoutineDraft(me.campus));
          }
        } catch { /* noop */ }
        loadAll();
      } catch { router.replace('/admin'); } finally { setCheckingAuth(false); }
    })();
  }, [router, loadAll]);

  const createPlan = async (input: {
    weekStart: string;
    meals: MealKind[];
    campus: string;
    deadline: string;
    lunchPrice?: string;
    dinnerPrice?: string;
    closedDays: MealDay[];
  }) => {
    if (!input.weekStart) { toast.error('주차(월요일)를 선택해주세요.'); return; }
    if (input.meals.length === 0) { toast.error('점심/저녁 중 하나 이상 선택해주세요.'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart: input.weekStart,
          meals: input.meals,
          campus: input.campus,
          deadline: toKstIsoFromDateTimeLocal(input.deadline),
          lunchPrice: input.lunchPrice || undefined,
          dinnerPrice: input.dinnerPrice || undefined,
          closedDays: input.closedDays,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('도시락 라운드가 등록되었습니다.');
        setPlans((prev) => [json.plan, ...prev]);
        setSelectedPlanId(json.plan.id);
        setNewDeadline(''); setNewLunchPrice(''); setNewDinnerPrice('');
      } else { toast.error(json.message || '등록 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setAdding(false); }
  };

  const addPlan = async () => {
    const meals = (Object.keys(newMeals) as MealKind[]).filter((k) => newMeals[k]);
    await createPlan({
      weekStart: newWeek,
      meals,
      campus: newCampus,
      deadline: newDeadline,
      lunchPrice: newLunchPrice,
      dinnerPrice: newDinnerPrice,
      closedDays: newClosedDays,
    });
  };

  const quickCreateNextWeek = async () => {
    const weekStart = nextMonday();
    await createPlan({
      weekStart,
      meals: ['lunch'],
      campus: newCampus,
      deadline: deadlineForMealWeek(weekStart),
      lunchPrice: newLunchPrice,
      dinnerPrice: '',
      closedDays: [],
    });
  };

  const deletePlan = async (planId: string) => {
    if (!confirm('이 도시락 라운드를 삭제하시겠습니까? (학생 신청 내역은 보존되나 표에서 사라집니다)')) return;
    try {
      const res = await fetch(`/api/admin/meal-plans?planId=${encodeURIComponent(planId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('삭제되었습니다.');
        setPlans((prev) => prev.filter((p) => p.id !== planId));
        if (selectedPlanId === planId) setSelectedPlanId(null);
      } else { toast.error(json.message || '삭제 실패'); }
    } catch { toast.error('네트워크 에러'); }
  };

  const notifyToStudents = async (planId: string, action: 'send' | 'cancel' = 'send') => {
    if (notifyingId) return;
    if (action === 'cancel' && !confirm('발송된 도시락 신청 알림을 취소할까요? 학생 화면에서 사라지고, 다시 발송할 수 있습니다.')) return;
    setNotifyingId(planId);
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === 'cancel' ? '도시락 신청 알림을 취소했습니다.' : '학생들에게 도시락 신청 알림을 발송했습니다.');
        setPlans((prev) => prev.map((p) => (p.id === planId ? json.plan : p)));
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setNotifyingId(null); }
  };

  const saveRoutineTemplate = async (template: MealPlanRoutineTemplate = routineForm) => {
    setRoutineSaving(true);
    try {
      const res = await fetch('/api/admin/meal-routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      const json = await res.json();
      if (json.success) {
        setRoutineTemplates((prev) => {
          const exists = prev.some((item) => item.id === json.template.id);
          return exists ? prev.map((item) => item.id === json.template.id ? json.template : item) : [...prev, json.template];
        });
        setRoutineForm(createRoutineDraft(adminCampus !== 'all' ? adminCampus : newCampus));
        toast.success('도시락 반복 템플릿을 저장했습니다.');
      } else {
        toast.error(json.message || '템플릿 저장 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setRoutineSaving(false);
    }
  };

  const deleteRoutineTemplate = async (id: string) => {
    if (!confirm('이 반복 템플릿을 삭제할까요? 이미 생성된 도시락 라운드는 유지됩니다.')) return;
    try {
      const res = await fetch(`/api/admin/meal-routines?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setRoutineTemplates((prev) => prev.filter((item) => item.id !== id));
        toast.success('반복 템플릿을 삭제했습니다.');
      } else {
        toast.error(json.message || '템플릿 삭제 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    }
  };

  const toggleRoutineActive = async (template: MealPlanRoutineTemplate) => {
    await saveRoutineTemplate({ ...template, active: !template.active });
  };

  const runRoutinesNow = async () => {
    setRoutineRunning(true);
    try {
      const res = await fetch('/api/admin/meal-routines/run', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast.success(`반복 실행 완료: 생성 ${json.created || 0}건, 알림 ${json.notified || 0}건`);
        await loadAll();
      } else {
        toast.error(json.message || '반복 실행 실패');
      }
    } catch {
      toast.error('네트워크 에러');
    } finally {
      setRoutineRunning(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;
  const scopedStudents = students
    .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
    .filter((s) => !selectedPlan?.campus || selectedPlan.campus === 'all' || s.campus === selectedPlan.campus)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const orderOf = (s: Student): MealOrder | undefined =>
    selectedPlanId ? (s.mealOrders || []).find((o) => o.planId === selectedPlanId) : undefined;

  // 관리자 대리 토글 — 셀 하나 켜고/끄고 전체 selections 를 저장
  const toggleCell = async (s: Student, day: MealDay, kind: MealKind) => {
    if (!selectedPlanId) return;
    const key = `${s.id}-${day}-${kind}`;
    setUpdating(key);
    const cur = orderOf(s);
    const on = !eatsOn(cur, day, kind);
    const nextSelections = withSelection(cur?.selections || {}, day, kind, on);
    // 낙관적 업데이트
    setStudents((prev) => prev.map((stu) => {
      if (stu.id !== s.id) return stu;
      const others = (stu.mealOrders || []).filter((o) => o.planId !== selectedPlanId);
      const base = (stu.mealOrders || []).find((o) => o.planId === selectedPlanId);
      return { ...stu, mealOrders: [...others, { ...(base || { planId: selectedPlanId, updatedAt: '' }), planId: selectedPlanId, selections: nextSelections, updatedAt: new Date().toISOString() }] };
    }));
    try {
      const res = await fetch(`/api/admin/students/${s.id}/meal-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId, selections: nextSelections }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || '저장 실패'); loadAll(); }
    } catch { toast.error('네트워크 에러'); loadAll(); } finally { setUpdating(null); }
  };

  // 추가신청 승인/반려
  const reviewAddRequest = async (s: Student, requestId: string, approve: boolean) => {
    const key = `req-${requestId}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/admin/students/${s.id}/meal-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId, requestId, approve, reject: !approve }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(approve ? '추가 신청을 승인했습니다.' : '추가 신청을 반려했습니다.');
        setStudents((prev) => prev.map((stu) => {
          if (stu.id !== s.id) return stu;
          const others = (stu.mealOrders || []).filter((o) => o.planId !== selectedPlanId);
          return { ...stu, mealOrders: [...others, json.order] };
        }));
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setUpdating(null); }
  };

  // 휴무 요일 토글 (PATCH closedDays)
  const toggleClosedDay = async (day: MealDay) => {
    if (!selectedPlan) return;
    const cur = selectedPlan.closedDays || [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    setPlans((prev) => prev.map((p) => (p.id === selectedPlan.id ? { ...p, closedDays: next } : p)));
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan.id, closedDays: next }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || '휴무 설정 실패'); loadAll(); }
      else setPlans((prev) => prev.map((p) => (p.id === json.plan.id ? json.plan : p)));
    } catch { toast.error('네트워크 에러'); loadAll(); }
  };

  // 정산 집계 (휴무 요일 제외) — 총합 + 이름별 내역
  const settlement = React.useMemo(() => {
    if (!selectedPlan) return null;
    const lp = selectedPlan.lunchPrice || 0;
    const dp = selectedPlan.dinnerPrice || 0;
    const closed = selectedPlan.closedDays || [];
    let lunch = 0, dinner = 0;
    const rows: { id: string; name: string; lunch: number; dinner: number; amount: number }[] = [];
    for (const s of scopedStudents) {
      const c = mealCounts(orderOf(s), closed);
      if (c.lunch + c.dinner === 0) continue;
      lunch += c.lunch; dinner += c.dinner;
      rows.push({ id: s.id, name: s.name, lunch: c.lunch, dinner: c.dinner, amount: c.lunch * lp + c.dinner * dp });
    }
    return { lunch, dinner, lunchAmt: lunch * lp, dinnerAmt: dinner * dp, total: lunch * lp + dinner * dp, lp, dp, rows };
  }, [selectedPlan, scopedStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마감 후 대기 중인 추가신청
  const pendingRequests = React.useMemo(() => {
    const out: { s: Student; req: MealAddRequest }[] = [];
    if (!selectedPlanId) return out;
    for (const s of scopedStudents) {
      const o = orderOf(s);
      for (const r of o?.addRequests || []) {
        if (r.status === 'pending') out.push({ s, req: r });
      }
    }
    return out;
  }, [scopedStudents, selectedPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const weeklyComparison = React.useMemo(() => {
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const currentWeekStart = mondayOf(todayYmd);
    const nextWeekStart = addDaysYmd(currentWeekStart, 7);

    const summarize = (weekStart: string, label: string) => {
      const weekPlans = plans.filter((plan) => {
        if (plan.weekStart !== weekStart) return false;
        if (campusFilter === 'all') return true;
        return !plan.campus || plan.campus === 'all' || plan.campus === campusFilter;
      });
      let totalStudents = 0;
      let responded = 0;
      let lunch = 0;
      let dinner = 0;
      for (const plan of weekPlans) {
        const planStudents = students.filter((student) => {
          if (campusFilter !== 'all' && student.campus !== campusFilter) return false;
          return !plan.campus || plan.campus === 'all' || student.campus === plan.campus;
        });
        totalStudents += planStudents.length;
        for (const student of planStudents) {
          const order = (student.mealOrders || []).find((item) => item.planId === plan.id);
          if (order) responded += 1;
          const counts = mealCounts(order, plan.closedDays || []);
          lunch += counts.lunch;
          dinner += counts.dinner;
        }
      }
      return {
        label,
        weekStart,
        plans: weekPlans,
        totalStudents,
        responded,
        missing: Math.max(0, totalStudents - responded),
        lunch,
        dinner,
      };
    };

    return [
      summarize(currentWeekStart, '이번 주 신청내역'),
      summarize(nextWeekStart, '다음 주 신청현황'),
    ];
  }, [campusFilter, plans, students]);

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center"><Loader2 className="w-7 h-7 text-[#0071E3] animate-spin" /></div>;
  }

  const past = selectedPlan ? isPastDeadline(selectedPlan) : false;

  return (
    <div className="ios-app-bg min-h-screen text-[#1D1D1F] font-sans">
      <div className="no-print">
        <AdminTopNav title="도시락 신청" titleIcon={<Utensils className="w-4 h-4 text-[#0071E3]" />} onLogout={handleLogout} />
      </div>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6 space-y-6">
        {/* 헤더 (화면 전용) */}
        <div className="no-print flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/admin/dashboard')}
            className="h-9 w-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Utensils className="w-5 h-5 text-[#0071E3]" /> 도시락 신청
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">주차별 도시락 신청을 받고, A4 게시용 표를 인쇄합니다.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll}
            className="ml-auto shrink-0 rounded-xl text-xs h-9 bg-white border-slate-200 hover:bg-slate-50">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> 새로고침
          </Button>
        </div>

        {/* 라운드 등록 (화면 전용) */}
        <div className="no-print rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-black text-slate-700">도시락 라운드 등록 (월~금)</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
              주 (월요일)
              <input type="date" value={newWeek} onChange={(e) => {
                setNewWeek(e.target.value);
                setNewDeadline(deadlineForMealWeek(e.target.value));
              }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
            </label>
            <div className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
              제공 끼니
              <div className="flex gap-1.5">
                {(['lunch', 'dinner'] as MealKind[]).map((k) => (
                  <button key={k} type="button" onClick={() => setNewMeals((m) => ({ ...m, [k]: !m[k] }))}
                    className={`rounded-xl px-3.5 py-2 text-xs font-black border transition active:scale-95 ${
                      newMeals[k] ? 'border-[#0071E3] bg-[#0071E3] text-white' : 'border-slate-200 bg-white text-slate-400'
                    }`}>
                    {MEAL_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
              신청 마감 일시
              <input type="datetime-local" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
            </label>
            <div className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
              신청 안 받는 요일
              <div className="flex gap-1.5">
                {MEAL_DAYS.map((day) => {
                  const off = newClosedDays.includes(day);
                  return (
                    <button key={day} type="button" onClick={() => setNewClosedDays((cur) => off ? cur.filter((d) => d !== day) : [...cur, day])}
                      className={`rounded-xl px-3 py-2 text-xs font-black border transition active:scale-95 ${
                        off ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-400'
                      }`}>
                      {MEAL_DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>
            {newMeals.lunch && (
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                점심 단가(원)
                <input type="number" min={0} value={newLunchPrice} onChange={(e) => setNewLunchPrice(e.target.value)} placeholder="0"
                  className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
              </label>
            )}
            {newMeals.dinner && (
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                저녁 단가(원)
                <input type="number" min={0} value={newDinnerPrice} onChange={(e) => setNewDinnerPrice(e.target.value)} placeholder="0"
                  className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
              대상 센터
              <select value={newCampus} onChange={(e) => setNewCampus(e.target.value)} disabled={adminCampus !== 'all'}
                title={adminCampus !== 'all' ? '담당 센터로 자동 지정됩니다' : '대상 센터 선택'}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none disabled:opacity-70">
                <option value="all">전체 센터</option>
                {CAMPUSES.map((c) => <option key={c} value={c}>{getCampusLabel(c)}</option>)}
              </select>
            </label>
            <Button onClick={addPlan} disabled={adding}
              className="rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white text-xs font-black h-10 px-4">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} 등록
            </Button>
            <Button onClick={quickCreateNextWeek} disabled={adding} variant="outline"
              className="rounded-xl border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-black h-10 px-4">
              다음 주 빠른 생성
            </Button>
          </div>

          {plans.length > 0 && (
            <div className="space-y-2 pt-1">
              {plans.map((plan) => (
                <div key={plan.id} className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition ${
                  selectedPlanId === plan.id ? 'border-[#0071E3]/30 bg-[#0071E3]/5' : 'border-slate-100 bg-slate-50/60'
                }`}>
                  <button type="button" onClick={() => setSelectedPlanId(plan.id)} className="flex-1 flex items-start gap-2 text-left">
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-black ${selectedPlanId === plan.id ? 'text-[#0071E3]' : 'text-slate-700'}`}>
                        {weekRangeLabel(plan.weekStart)} 주
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">{plan.meals.map((m) => MEAL_KIND_LABELS[m]).join('·')}</span>
                      <span className="rounded-lg bg-slate-200/70 text-slate-600 px-1.5 py-0.5 text-[9px] font-black">
                        {plan.campus && plan.campus !== 'all' ? getCampusLabel(plan.campus) : '전체 센터'}
                      </span>
                      {plan.deadline && (
                        <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-black ${isPastDeadline(plan) ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                          {isPastDeadline(plan) ? '마감됨' : `마감 ${formatDeadline(plan.deadline)}`}
                        </span>
                      )}
                      {plan.notifiedAt && (
                        <span className="flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-black">
                          <Bell className="w-2 h-2" /> 알림됨
                        </span>
                      )}
                    </div>
                  </button>
                  <button type="button" disabled={!!notifyingId} onClick={() => notifyToStudents(plan.id, plan.notifiedAt ? 'cancel' : 'send')}
                    title={plan.notifiedAt ? `발송: ${new Date(plan.notifiedAt).toLocaleString('ko-KR')} · 클릭하면 취소` : '학생에게 신청 알림 발송'}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition active:scale-95 shrink-0 ${
                      plan.notifiedAt ? 'border border-red-100 bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {notifyingId === plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : plan.notifiedAt ? <X className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                    {plan.notifiedAt ? '알림 취소' : '학생 알림'}
                  </button>
                  <button type="button" onClick={() => deletePlan(plan.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition shrink-0" title="삭제">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="no-print rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-[#1D1D1F]">센터별 반복 템플릿</h2>
              <p className="text-[12px] font-medium text-[#86868B] mt-0.5">생성 · 마감 · 알림 시각</p>
            </div>
            <Button onClick={runRoutinesNow} disabled={routineRunning} variant="outline"
              className="ml-auto rounded-xl border-slate-200 bg-white text-xs font-black h-9">
              {routineRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              지금 실행
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-2xl border border-black/[0.05] bg-[#FAFAFA] p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  템플릿명
                  <input value={routineForm.name} onChange={(e) => setRoutineForm((f) => ({ ...f, name: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  센터
                  <select value={routineForm.campus || 'all'} disabled={adminCampus !== 'all'}
                    onChange={(e) => setRoutineForm((f) => ({ ...f, campus: e.target.value === 'all' ? undefined : e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none disabled:opacity-70">
                    <option value="all">전체 센터</option>
                    {CAMPUSES.map((c) => <option key={c} value={c}>{getCampusLabel(c)}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  생성 요일
                  <select value={routineForm.createDay} onChange={(e) => setRoutineForm((f) => ({ ...f, createDay: Number(e.target.value) }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                    {DAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  생성 시각
                  <input type="time" value={routineForm.createTime} onChange={(e) => setRoutineForm((f) => ({ ...f, createTime: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  대상 주
                  <select value={routineForm.targetWeekOffset} onChange={(e) => setRoutineForm((f) => ({ ...f, targetWeekOffset: Number(e.target.value) }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                    <option value={0}>이번 주</option>
                    <option value={1}>다음 주</option>
                    <option value={2}>2주 뒤</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  마감 기준
                  <select value={routineForm.deadlineBase} onChange={(e) => setRoutineForm((f) => ({ ...f, deadlineBase: e.target.value as MealPlanRoutineTemplate['deadlineBase'] }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                    <option value="create">생성 주</option>
                    <option value="target">대상 주</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  마감 요일
                  <select value={routineForm.deadlineDay} onChange={(e) => setRoutineForm((f) => ({ ...f, deadlineDay: Number(e.target.value) }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                    {DAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  마감 시각
                  <input type="time" value={routineForm.deadlineTime} onChange={(e) => setRoutineForm((f) => ({ ...f, deadlineTime: e.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  알림
                  <select value={routineForm.notifyMode} onChange={(e) => setRoutineForm((f) => ({ ...f, notifyMode: e.target.value as MealPlanRoutineTemplate['notifyMode'] }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                    <option value="none">보내지 않음</option>
                    <option value="on_create">생성 즉시</option>
                    <option value="scheduled">예약 발송</option>
                  </select>
                </label>
              </div>

              {routineForm.notifyMode === 'scheduled' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                    알림 요일
                    <select value={routineForm.notifyDay ?? routineForm.createDay} onChange={(e) => setRoutineForm((f) => ({ ...f, notifyDay: Number(e.target.value) }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none">
                      {DAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                    알림 시각
                    <input type="time" value={routineForm.notifyTime || routineForm.createTime} onChange={(e) => setRoutineForm((f) => ({ ...f, notifyTime: e.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                  </label>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  끼니
                  <div className="flex gap-1.5">
                    {(['lunch', 'dinner'] as MealKind[]).map((kind) => {
                      const on = routineForm.meals.includes(kind);
                      return (
                        <button key={kind} type="button" onClick={() => setRoutineForm((f) => ({
                          ...f,
                          meals: on ? f.meals.filter((m) => m !== kind) : [...f.meals, kind],
                        }))}
                          className={`rounded-xl px-3 py-2 text-xs font-black border transition active:scale-95 ${
                            on ? 'border-[#0071E3] bg-[#0071E3] text-white' : 'border-slate-200 bg-white text-slate-400'
                          }`}>
                          {MEAL_KIND_LABELS[kind]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  신청 안 받는 요일
                  <div className="flex gap-1.5">
                    {MEAL_DAYS.map((day) => {
                      const off = routineForm.closedDays.includes(day);
                      return (
                        <button key={day} type="button" onClick={() => setRoutineForm((f) => ({
                          ...f,
                          closedDays: off ? f.closedDays.filter((d) => d !== day) : [...f.closedDays, day],
                        }))}
                          className={`rounded-xl px-3 py-2 text-xs font-black border transition active:scale-95 ${
                            off ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-400'
                          }`}>
                          {MEAL_DAY_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  점심 단가
                  <input type="number" min={0} value={routineForm.lunchPrice ?? ''} onChange={(e) => setRoutineForm((f) => ({ ...f, lunchPrice: e.target.value ? Number(e.target.value) : undefined }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">
                  저녁 단가
                  <input type="number" min={0} value={routineForm.dinnerPrice ?? ''} onChange={(e) => setRoutineForm((f) => ({ ...f, dinnerPrice: e.target.value ? Number(e.target.value) : undefined }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-[#0071E3] focus:outline-none" />
                </label>
                <Button onClick={() => saveRoutineTemplate()} disabled={routineSaving}
                  className="self-end rounded-xl bg-[#0071E3] hover:bg-[#005DB9] text-white text-xs font-black h-10 px-4">
                  {routineSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  템플릿 저장
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {routineTemplates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                  등록된 반복 템플릿이 없습니다.
                </div>
              ) : routineTemplates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => toggleRoutineActive(template)}
                      className={`mt-0.5 h-6 w-11 rounded-full border p-0.5 transition ${
                        template.active ? 'border-emerald-500 bg-emerald-500' : 'border-slate-200 bg-slate-100'
                      }`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${template.active ? 'translate-x-5' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-black text-slate-800">{template.name}</p>
                        <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500">
                          {template.campus ? getCampusLabel(template.campus) : '전체 센터'}
                        </span>
                        <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-black ${template.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {template.active ? '반복중' : '중지'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        {DAY_OPTIONS.find((d) => d.value === template.createDay)?.label} {template.createTime} 생성 · {template.targetWeekOffset === 1 ? '다음 주' : template.targetWeekOffset === 0 ? '이번 주' : `${template.targetWeekOffset}주 뒤`}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400">
                        마감 {template.deadlineBase === 'create' ? '생성 주' : '대상 주'} {DAY_OPTIONS.find((d) => d.value === template.deadlineDay)?.label} {template.deadlineTime} · 알림 {template.notifyMode === 'none' ? '없음' : template.notifyMode === 'on_create' ? '생성 즉시' : '예약'}
                      </p>
                    </div>
                    <button type="button" onClick={() => setRoutineForm(template)}
                      className="rounded-lg px-2 py-1.5 text-[11px] font-black text-[#0071E3] hover:bg-[#0071E3]/10">
                      수정
                    </button>
                    <button type="button" onClick={() => deleteRoutineTemplate(template.id)}
                      className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="no-print grid gap-3 md:grid-cols-2">
          {weeklyComparison.map((summary, index) => {
            const isNext = index === 1;
            return (
              <div key={summary.weekStart}
                className={`rounded-2xl border px-5 py-4 shadow-sm ${
                  isNext ? 'border-amber-200 bg-amber-50' : 'border-[#0071E3]/20 bg-[#0071E3]/[0.06]'
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-black ${isNext ? 'text-amber-700' : 'text-[#0071E3]'}`}>{summary.label}</p>
                    <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-[#1D1D1F]">
                      {weekRangeLabel(summary.weekStart)} 주
                    </h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    summary.plans.length > 0
                      ? isNext ? 'bg-amber-100 text-amber-700' : 'bg-[#0071E3]/10 text-[#0071E3]'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {summary.plans.length > 0 ? `${summary.plans.length}개 라운드` : '아직 없음'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl bg-white px-2 py-2">
                    <p className="text-[18px] font-semibold tabular-nums text-[#1D1D1F]">{summary.responded}</p>
                    <p className="text-[11px] font-medium text-[#86868B]">응답</p>
                  </div>
                  <div className="rounded-xl bg-white px-2 py-2">
                    <p className="text-[18px] font-semibold tabular-nums text-orange-600">{summary.missing}</p>
                    <p className="text-[11px] font-medium text-[#86868B]">미응답</p>
                  </div>
                  <div className="rounded-xl bg-white px-2 py-2">
                    <p className="text-[18px] font-semibold tabular-nums text-amber-700">{summary.lunch}</p>
                    <p className="text-[11px] font-medium text-[#86868B]">점심</p>
                  </div>
                  <div className="rounded-xl bg-white px-2 py-2">
                    <p className="text-[18px] font-semibold tabular-nums text-indigo-600">{summary.dinner}</p>
                    <p className="text-[11px] font-medium text-[#86868B]">저녁</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {selectedPlan && (
          <>
            {/* 센터 필터 + 인쇄 (화면 전용) */}
            <div className="no-print flex flex-wrap items-center gap-1.5">
              {(selectedPlan.campus && selectedPlan.campus !== 'all' ? [selectedPlan.campus] : CAMPUS_FILTERS).map((c) => (
                <button key={c} onClick={() => setCampusFilter(c)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
                    campusFilter === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}>
                  {c === 'all' ? '전체 센터' : getCampusLabel(c)}
                </button>
              ))}
              <Button onClick={() => window.print()}
                className="ml-auto rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black h-9 px-4">
                <Printer className="w-3.5 h-3.5 mr-1.5" /> A4 인쇄
              </Button>
            </div>

            {/* 휴무 요일 설정 (화면 전용) — 공휴일/학원 휴무 수동 지정 */}
            <div className="no-print rounded-2xl border border-slate-100 bg-white shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-slate-600">휴무 요일</span>
              <span className="text-[11px] font-semibold text-slate-400">(공휴일/휴무일 — 신청·표·정산에서 제외)</span>
              <div className="ml-auto flex gap-1.5">
                {MEAL_DAYS.map((day) => {
                  const closed = isClosedDay(selectedPlan, day);
                  return (
                    <button key={day} type="button" onClick={() => toggleClosedDay(day)}
                      className={`h-8 w-9 rounded-lg text-xs font-black border transition active:scale-90 ${
                        closed ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                      }`} title={closed ? '휴무 해제' : '휴무로 지정'}>
                      {MEAL_DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 정산 요약 (화면 전용) */}
            {settlement && (
              <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedPlan.meals.includes('lunch') && (
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3">
                    <p className="text-[18px] font-semibold tracking-tight text-amber-800">{settlement.lunch}<span className="text-xs font-bold ml-0.5">끼</span></p>
                    <p className="text-[11px] font-bold text-amber-700/80 mt-0.5">점심 · {settlement.lunchAmt.toLocaleString()}원</p>
                  </div>
                )}
                {selectedPlan.meals.includes('dinner') && (
                  <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50 px-4 py-3">
                    <p className="text-[18px] font-semibold tracking-tight text-indigo-800">{settlement.dinner}<span className="text-xs font-bold ml-0.5">끼</span></p>
                    <p className="text-[11px] font-bold text-indigo-700/80 mt-0.5">저녁 · {settlement.dinnerAmt.toLocaleString()}원</p>
                  </div>
                )}
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3">
                  <p className="text-[18px] font-semibold tracking-tight text-emerald-800">{settlement.total.toLocaleString()}<span className="text-xs font-bold ml-0.5">원</span></p>
                  <p className="text-[11px] font-bold text-emerald-700/80 mt-0.5">총 정산액</p>
                </div>
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <p className="text-[18px] font-semibold tracking-tight text-slate-700">{settlement.rows.length}<span className="text-xs font-bold ml-0.5">명</span></p>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">신청 인원</p>
                </div>
              </div>
            )}

            {/* 이름별 정산 내역 (화면 전용) */}
            {settlement && settlement.rows.length > 0 && (
              <div className="no-print rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-xs font-black text-slate-600">이름별 정산 내역</p>
                  <p className="text-[11px] font-bold text-slate-400">점심 {settlement.lp.toLocaleString()}원 · 저녁 {settlement.dp.toLocaleString()}원</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-50/80 text-[10px] font-black text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 text-left">이름</th>
                        {selectedPlan.meals.includes('lunch') && <th className="px-3 py-2.5 text-right">점심</th>}
                        {selectedPlan.meals.includes('dinner') && <th className="px-3 py-2.5 text-right">저녁</th>}
                        <th className="px-4 py-2.5 text-right">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/60">
                      {settlement.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 font-black text-slate-700 whitespace-nowrap">{r.name}</td>
                          {selectedPlan.meals.includes('lunch') && <td className="px-3 py-2 text-right font-bold text-slate-500">{r.lunch}끼</td>}
                          {selectedPlan.meals.includes('dinner') && <td className="px-3 py-2 text-right font-bold text-slate-500">{r.dinner}끼</td>}
                          <td className="px-4 py-2 text-right font-black text-slate-800">{r.amount.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                        <td className="px-4 py-2.5 font-black text-slate-700">합계</td>
                        {selectedPlan.meals.includes('lunch') && <td className="px-3 py-2.5 text-right font-black text-slate-700">{settlement.lunch}끼</td>}
                        {selectedPlan.meals.includes('dinner') && <td className="px-3 py-2.5 text-right font-black text-slate-700">{settlement.dinner}끼</td>}
                        <td className="px-4 py-2.5 text-right font-black text-emerald-700">{settlement.total.toLocaleString()}원</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* 마감 후 추가신청 승인 대기 (화면 전용) */}
            {pendingRequests.length > 0 && (
              <div className="no-print rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                <p className="text-xs font-black text-amber-800 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 마감 후 추가 신청 {pendingRequests.length}건 — 승인 시 도시락표에 반영됩니다</p>
                {pendingRequests.map(({ s, req }) => (
                  <div key={req.id} className="flex items-center gap-2 rounded-xl bg-white border border-amber-100 px-3 py-2">
                    <span className="text-xs font-black text-slate-700">{s.name}</span>
                    <span className="text-[11px] font-bold text-slate-500">{MEAL_DAY_LABELS[req.day]} {MEAL_KIND_LABELS[req.meal]}</span>
                    {req.reason && <span className="text-[11px] font-semibold text-slate-400 truncate">· {req.reason}</span>}
                    <div className="ml-auto flex gap-1.5">
                      <button type="button" disabled={updating === `req-${req.id}`} onClick={() => reviewAddRequest(s, req.id, true)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 text-[11px] font-black active:scale-95 disabled:opacity-50">
                        <Check className="w-3 h-3" /> 승인
                      </button>
                      <button type="button" disabled={updating === `req-${req.id}`} onClick={() => reviewAddRequest(s, req.id, false)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white text-slate-600 px-2.5 py-1.5 text-[11px] font-black active:scale-95 disabled:opacity-50">
                        <X className="w-3 h-3" /> 반려
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 대리입력 그리드 (화면 전용) — 셀 클릭으로 먹음/안먹음 토글 */}
            <div className="no-print rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs font-black text-slate-600">신청 현황 · 대리 입력 <span className="font-bold text-slate-400">(셀 클릭 = 먹음/안먹음)</span></p>
                {past && <span className="text-[10px] font-bold text-red-500">마감됨 — 추가는 위 승인 흐름으로</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-center text-xs">
                  <thead className="bg-slate-50/80 text-[10px] font-black text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left sticky left-0 bg-slate-50/80">원생</th>
                      {selectedPlan.meals.map((kind) => MEAL_DAYS.map((day) => (
                        <th key={`${kind}-${day}`} className={`px-2 py-3 ${isClosedDay(selectedPlan, day) ? 'text-red-300' : ''}`}>
                          <span className={kind === 'dinner' ? 'text-indigo-400' : 'text-amber-500'}>{MEAL_KIND_LABELS[kind][0]}</span>{MEAL_DAY_LABELS[day]}
                        </th>
                      )))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {scopedStudents.map((s) => {
                      const order = orderOf(s);
                      return (
                        <tr key={s.id}>
                          <td className="px-4 py-2 text-left font-black text-slate-700 whitespace-nowrap sticky left-0 bg-white">{s.name}</td>
                          {selectedPlan.meals.map((kind) => MEAL_DAYS.map((day) => {
                            const key = `${s.id}-${day}-${kind}`;
                            if (isClosedDay(selectedPlan, day)) {
                              return (
                                <td key={key} className="px-1 py-1.5">
                                  <div className="h-7 w-7 mx-auto rounded-lg bg-red-50 text-red-300 text-[9px] font-black grid place-items-center" title="휴무">휴</div>
                                </td>
                              );
                            }
                            const on = eatsOn(order, day, kind);
                            return (
                              <td key={key} className="px-1 py-1.5">
                                <button type="button" disabled={updating === key} onClick={() => toggleCell(s, day, kind)}
                                  className={`h-7 w-7 rounded-lg text-[11px] font-black transition active:scale-90 ${
                                    on ? (kind === 'dinner' ? 'bg-indigo-500 text-white' : 'bg-amber-400 text-white') : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                                  }`}>
                                  {updating === key ? '·' : on ? '○' : ''}
                                </button>
                              </td>
                            );
                          }))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ───────── 인쇄 전용 A4 게시 표 ───────── */}
            <div className="hidden print:block">
              <div className="text-center mb-3">
                <h2 className="text-base font-black">{weekRangeLabel(selectedPlan.weekStart)} 주 도시락 신청표</h2>
                <p className="text-[11px] font-semibold text-slate-500">
                  {selectedPlan.campus && selectedPlan.campus !== 'all' ? getCampusLabel(selectedPlan.campus) : '전체 센터'}
                  {' · 먹는 날엔 ○ 칸에 본인이 동그라미 표시 후 수령'}
                </p>
              </div>
              <div className="flex gap-4 items-start">
                {selectedPlan.meals.map((kind) => {
                  const rows = scopedStudents.filter((s) => orderHasMeal(orderOf(s), kind, selectedPlan.closedDays));
                  return (
                    <div key={kind} className="flex-1">
                      <p className="text-center text-sm font-black mb-1">{MEAL_KIND_LABELS[kind]}</p>
                      <table className="w-full border-collapse text-center text-[11px]" style={{ tableLayout: 'fixed' }}>
                        <thead>
                          <tr>
                            <th className="border border-black px-1 py-1.5 font-black">이름</th>
                            {MEAL_DAYS.map((day) => (
                              <th key={day} className="border border-black px-1 py-1.5 font-black w-9">
                                {MEAL_DAY_LABELS[day]}{isClosedDay(selectedPlan, day) ? '(휴)' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td className="border border-black px-1 py-3 text-slate-400" colSpan={MEAL_DAYS.length + 1}>신청자 없음</td></tr>
                          ) : rows.map((s) => {
                            const order = orderOf(s);
                            return (
                              <tr key={s.id}>
                                <td className="border border-black px-1 py-1.5 font-bold whitespace-nowrap">{s.name}</td>
                                {MEAL_DAYS.map((day) => (
                                  <td key={day} className="border border-black px-1 py-1.5 h-7"
                                    style={isClosedDay(selectedPlan, day) ? { background: '#E5E7EB' } : undefined}>
                                    {isClosedDay(selectedPlan, day) ? '휴무' : eatsOn(order, day, kind) ? '' : 'X'}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* 이름별 정산 내역 (단가 입력 시) — 페이지 나눔 */}
              {settlement && settlement.rows.length > 0 && (settlement.lp > 0 || settlement.dp > 0) && (
                <div style={{ breakBefore: 'page' }} className="mt-6">
                  <div className="text-center mb-3">
                    <h2 className="text-base font-black">{weekRangeLabel(selectedPlan.weekStart)} 주 도시락 정산표</h2>
                    <p className="text-[11px] font-semibold text-slate-500">
                      점심 {settlement.lp.toLocaleString()}원 · 저녁 {settlement.dp.toLocaleString()}원
                    </p>
                  </div>
                  <table className="w-full border-collapse text-center text-[11px]">
                    <thead>
                      <tr>
                        <th className="border border-black px-2 py-1.5 font-black">이름</th>
                        {selectedPlan.meals.includes('lunch') && <th className="border border-black px-2 py-1.5 font-black">점심</th>}
                        {selectedPlan.meals.includes('dinner') && <th className="border border-black px-2 py-1.5 font-black">저녁</th>}
                        <th className="border border-black px-2 py-1.5 font-black">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlement.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="border border-black px-2 py-1.5 font-bold">{r.name}</td>
                          {selectedPlan.meals.includes('lunch') && <td className="border border-black px-2 py-1.5">{r.lunch}</td>}
                          {selectedPlan.meals.includes('dinner') && <td className="border border-black px-2 py-1.5">{r.dinner}</td>}
                          <td className="border border-black px-2 py-1.5 font-bold">{r.amount.toLocaleString()}원</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="border border-black px-2 py-1.5 font-black">합계</td>
                        {selectedPlan.meals.includes('lunch') && <td className="border border-black px-2 py-1.5 font-black">{settlement.lunch}</td>}
                        {selectedPlan.meals.includes('dinner') && <td className="border border-black px-2 py-1.5 font-black">{settlement.dinner}</td>}
                        <td className="border border-black px-2 py-1.5 font-black">{settlement.total.toLocaleString()}원</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!selectedPlan && !loading && (
          <div className="no-print rounded-2xl bg-white border border-slate-100 p-12 text-center">
            <Utensils className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">도시락 라운드를 먼저 등록해주세요.</p>
          </div>
        )}

        {/* 도시락 반복 생성(meal) 예약 설정 — 전체 잡은 /admin/schedules 에서 관리. 인쇄 제외 */}
        <div className="no-print">
          <ScheduledJobsPanel jobIds={['meal']} compact />
        </div>
      </main>
    </div>
  );
}
