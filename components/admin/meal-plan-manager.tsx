'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Clock, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Student, MealPlan, MealOrder, MealDay, MealKind, MealAddRequest } from '@/lib/types/student';
import {
  MEAL_DAYS, MEAL_DAY_LABELS, MEAL_KIND_LABELS, getCampusLabel, weekRangeLabel,
  isClosedDay, eatsOn, orderHasMeal, mealCounts, withSelection, isPastDeadline,
} from '@/lib/meal';

const CAMPUS_FILTERS = ['all', 'wonju', 'chuncheon', 'chungju'];

interface MealPlanManagerProps {
  plan: MealPlan;
  students: Student[];
  onStudentsChange: (updater: (prev: Student[]) => Student[]) => void;
  onPlanChange: (plan: MealPlan) => void;
  onReloadNeeded?: () => void;
  adminCampus?: string;
}

// 도시락 라운드 관리 뷰(정산·A4인쇄·대리입력 그리드·추가신청 승인·휴무요일) — 단독 페이지와 캘린더 모달 공용.
export function MealPlanManager({ plan, students, onStudentsChange, onPlanChange, onReloadNeeded, adminCampus }: MealPlanManagerProps) {
  const [campusFilter, setCampusFilter] = useState(adminCampus && adminCampus !== 'all' ? adminCampus : 'all');
  const [updating, setUpdating] = useState<string | null>(null);

  const scopedStudents = useMemo(() => students
    .filter((s) => campusFilter === 'all' || s.campus === campusFilter)
    .filter((s) => !plan.campus || plan.campus === 'all' || s.campus === plan.campus)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  [students, campusFilter, plan.campus]);

  const orderOf = (s: Student): MealOrder | undefined => (s.mealOrders || []).find((o) => o.planId === plan.id);
  const past = isPastDeadline(plan);

  const toggleCell = async (s: Student, day: MealDay, kind: MealKind) => {
    const key = `${s.id}-${day}-${kind}`;
    setUpdating(key);
    const cur = orderOf(s);
    const on = !eatsOn(cur, day, kind);
    const nextSelections = withSelection(cur?.selections || {}, day, kind, on);
    onStudentsChange((prev) => prev.map((stu) => {
      if (stu.id !== s.id) return stu;
      const others = (stu.mealOrders || []).filter((o) => o.planId !== plan.id);
      const base = (stu.mealOrders || []).find((o) => o.planId === plan.id);
      return { ...stu, mealOrders: [...others, { ...(base || { planId: plan.id, updatedAt: '' }), planId: plan.id, selections: nextSelections, updatedAt: new Date().toISOString() }] };
    }));
    try {
      const res = await fetch(`/api/admin/students/${s.id}/meal-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, selections: nextSelections }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || '저장 실패'); onReloadNeeded?.(); }
    } catch { toast.error('네트워크 에러'); onReloadNeeded?.(); } finally { setUpdating(null); }
  };

  const reviewAddRequest = async (s: Student, requestId: string, approve: boolean) => {
    const key = `req-${requestId}`;
    setUpdating(key);
    try {
      const res = await fetch(`/api/admin/students/${s.id}/meal-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, requestId, approve, reject: !approve }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(approve ? '추가 신청을 승인했습니다.' : '추가 신청을 반려했습니다.');
        onStudentsChange((prev) => prev.map((stu) => {
          if (stu.id !== s.id) return stu;
          const others = (stu.mealOrders || []).filter((o) => o.planId !== plan.id);
          return { ...stu, mealOrders: [...others, json.order] };
        }));
      } else { toast.error(json.message || '처리 실패'); }
    } catch { toast.error('네트워크 에러'); } finally { setUpdating(null); }
  };

  const toggleClosedDay = async (day: MealDay) => {
    const cur = plan.closedDays || [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    onPlanChange({ ...plan, closedDays: next });
    try {
      const res = await fetch('/api/admin/meal-plans', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, closedDays: next }),
      });
      const json = await res.json();
      if (!json.success) { toast.error(json.message || '휴무 설정 실패'); onReloadNeeded?.(); }
      else onPlanChange(json.plan);
    } catch { toast.error('네트워크 에러'); onReloadNeeded?.(); }
  };

  const settlement = useMemo(() => {
    const lp = plan.lunchPrice || 0;
    const dp = plan.dinnerPrice || 0;
    const closed = plan.closedDays || [];
    let lunch = 0, dinner = 0;
    const rows: { id: string; name: string; lunch: number; dinner: number; amount: number }[] = [];
    for (const s of scopedStudents) {
      const c = mealCounts(orderOf(s), closed);
      if (c.lunch + c.dinner === 0) continue;
      lunch += c.lunch; dinner += c.dinner;
      rows.push({ id: s.id, name: s.name, lunch: c.lunch, dinner: c.dinner, amount: c.lunch * lp + c.dinner * dp });
    }
    return { lunch, dinner, lunchAmt: lunch * lp, dinnerAmt: dinner * dp, total: lunch * lp + dinner * dp, lp, dp, rows };
  }, [plan, scopedStudents]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingRequests = useMemo(() => {
    const out: { s: Student; req: MealAddRequest }[] = [];
    for (const s of scopedStudents) {
      for (const r of orderOf(s)?.addRequests || []) {
        if (r.status === 'pending') out.push({ s, req: r });
      }
    }
    return out;
  }, [scopedStudents, plan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* 센터 필터 + 인쇄 (화면 전용) */}
      <div className="no-print flex flex-wrap items-center gap-1.5">
        {(plan.campus && plan.campus !== 'all' ? [plan.campus] : CAMPUS_FILTERS).map((c) => (
          <button key={c} onClick={() => setCampusFilter(c)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-black border transition active:scale-95 ${
              campusFilter === c ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-500 dark:text-slate-400 hover:border-slate-300'
            }`}>
            {c === 'all' ? '전체 캠퍼스' : getCampusLabel(c)}
          </button>
        ))}
        <Button onClick={() => window.print()}
          className="ml-auto rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black h-9 px-4">
          <Printer className="w-3.5 h-3.5 mr-1.5" /> A4 인쇄
        </Button>
      </div>

      {/* 휴무 요일 설정 (화면 전용) */}
      <div className="no-print rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-black text-slate-600 dark:text-slate-300">휴무 요일</span>
        <span className="text-[11px] font-semibold text-slate-400">(공휴일/휴무일 — 신청·표·정산에서 제외)</span>
        <div className="ml-auto flex gap-1.5">
          {MEAL_DAYS.map((day) => {
            const closed = isClosedDay(plan, day);
            return (
              <button key={day} type="button" onClick={() => toggleClosedDay(day)}
                className={`h-8 w-9 rounded-lg text-xs font-black border transition active:scale-90 ${
                  closed ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-400 hover:border-slate-300'
                }`} title={closed ? '휴무 해제' : '휴무로 지정'}>
                {MEAL_DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 정산 요약 (화면 전용) */}
      <div className="no-print grid grid-cols-2 sm:grid-cols-4 gap-3">
        {plan.meals.includes('lunch') && (
          <div className="rounded-2xl border border-[#F56300]/25 bg-[#F56300]/[0.07] dark:bg-[#F56300]/15 px-4 py-3">
            <p className="text-[18px] font-semibold tracking-tight text-[#F56300]">{settlement.lunch}<span className="text-xs font-bold ml-0.5">끼</span></p>
            <p className="text-[11px] font-bold text-[#F56300]/80 mt-0.5">점심 · {settlement.lunchAmt.toLocaleString()}원</p>
          </div>
        )}
        {plan.meals.includes('dinner') && (
          <div className="rounded-2xl border border-[#0071E3]/25 bg-[#0071E3]/[0.06] dark:bg-[#0071E3]/15 px-4 py-3">
            <p className="text-[18px] font-semibold tracking-tight text-[#0071E3]">{settlement.dinner}<span className="text-xs font-bold ml-0.5">끼</span></p>
            <p className="text-[11px] font-bold text-[#0071E3]/80 mt-0.5">저녁 · {settlement.dinnerAmt.toLocaleString()}원</p>
          </div>
        )}
        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3">
          <p className="text-[18px] font-semibold tracking-tight text-emerald-800 dark:text-emerald-400">{settlement.total.toLocaleString()}<span className="text-xs font-bold ml-0.5">원</span></p>
          <p className="text-[11px] font-bold text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">총 정산액</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3">
          <p className="text-[18px] font-semibold tracking-tight text-slate-700 dark:text-slate-200">{settlement.rows.length}<span className="text-xs font-bold ml-0.5">명</span></p>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">신청 인원</p>
        </div>
      </div>

      {/* 이름별 정산 내역 (화면 전용) */}
      {settlement.rows.length > 0 && (
        <div className="no-print rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs font-black text-slate-600 dark:text-slate-300">이름별 정산 내역</p>
            <p className="text-[11px] font-bold text-slate-400">점심 {settlement.lp.toLocaleString()}원 · 저녁 {settlement.dp.toLocaleString()}원</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-slate-50/80 dark:bg-white/5 text-[10px] font-black text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">이름</th>
                  {plan.meals.includes('lunch') && <th className="px-3 py-2.5 text-right">점심</th>}
                  {plan.meals.includes('dinner') && <th className="px-3 py-2.5 text-right">저녁</th>}
                  <th className="px-4 py-2.5 text-right">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 dark:divide-white/10">
                {settlement.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.name}</td>
                    {plan.meals.includes('lunch') && <td className="px-3 py-2 text-right font-bold text-slate-500 dark:text-slate-400">{r.lunch}끼</td>}
                    {plan.meals.includes('dinner') && <td className="px-3 py-2 text-right font-bold text-slate-500 dark:text-slate-400">{r.dinner}끼</td>}
                    <td className="px-4 py-2 text-right font-black text-slate-800 dark:text-slate-200">{r.amount.toLocaleString()}원</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/5">
                  <td className="px-4 py-2.5 font-black text-slate-700 dark:text-slate-200">합계</td>
                  {plan.meals.includes('lunch') && <td className="px-3 py-2.5 text-right font-black text-slate-700 dark:text-slate-200">{settlement.lunch}끼</td>}
                  {plan.meals.includes('dinner') && <td className="px-3 py-2.5 text-right font-black text-slate-700 dark:text-slate-200">{settlement.dinner}끼</td>}
                  <td className="px-4 py-2.5 text-right font-black text-emerald-700 dark:text-emerald-400">{settlement.total.toLocaleString()}원</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 마감 후 추가신청 승인 대기 (화면 전용) */}
      {pendingRequests.length > 0 && (
        <div className="no-print rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10 p-4 space-y-2">
          <p className="text-xs font-black text-amber-800 dark:text-amber-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 마감 후 추가 신청 {pendingRequests.length}건 — 승인 시 도시락표에 반영됩니다</p>
          {pendingRequests.map(({ s, req }) => (
            <div key={req.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-[#1c1c1e] border border-amber-100 dark:border-amber-500/20 px-3 py-2">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200">{s.name}</span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{MEAL_DAY_LABELS[req.day]} {MEAL_KIND_LABELS[req.meal]}</span>
              {req.reason && <span className="text-[11px] font-semibold text-slate-400 truncate">· {req.reason}</span>}
              <div className="ml-auto flex gap-1.5">
                <button type="button" disabled={updating === `req-${req.id}`} onClick={() => reviewAddRequest(s, req.id, true)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 text-[11px] font-black active:scale-95 disabled:opacity-50">
                  <Check className="w-3 h-3" /> 승인
                </button>
                <button type="button" disabled={updating === `req-${req.id}`} onClick={() => reviewAddRequest(s, req.id, false)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] text-slate-600 dark:text-slate-300 px-2.5 py-1.5 text-[11px] font-black active:scale-95 disabled:opacity-50">
                  <X className="w-3 h-3" /> 반려
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 대리입력 그리드 (화면 전용) */}
      <div className="no-print rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-[#1c1c1e] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <p className="text-xs font-black text-slate-600 dark:text-slate-300">신청 현황 · 대리 입력 <span className="font-bold text-slate-400">(셀 클릭 = 먹음/안먹음)</span></p>
          {past && <span className="text-[10px] font-bold text-red-500">마감됨 — 추가는 위 승인 흐름으로</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead className="bg-slate-50/80 dark:bg-white/5 text-[10px] font-black text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left sticky left-0 bg-slate-50/80 dark:bg-[#1c1c1e]">학생</th>
                {plan.meals.map((kind) => MEAL_DAYS.map((day) => (
                  <th key={`${kind}-${day}`} className={`px-2 py-3 ${isClosedDay(plan, day) ? 'text-red-300' : ''}`}>
                    <span className={kind === 'dinner' ? 'text-[#0071E3]/70' : 'text-[#F56300]/80'}>{MEAL_KIND_LABELS[kind][0]}</span>{MEAL_DAY_LABELS[day]}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 dark:divide-white/10">
              {scopedStudents.map((s) => {
                const order = orderOf(s);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-left font-black text-slate-700 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-white dark:bg-[#1c1c1e]">{s.name}</td>
                    {plan.meals.map((kind) => MEAL_DAYS.map((day) => {
                      const key = `${s.id}-${day}-${kind}`;
                      if (isClosedDay(plan, day)) {
                        return (
                          <td key={key} className="px-1 py-1.5">
                            <div className="h-7 w-7 mx-auto rounded-lg bg-red-50 dark:bg-red-500/10 text-red-300 text-[9px] font-black grid place-items-center" title="휴무">휴</div>
                          </td>
                        );
                      }
                      const on = eatsOn(order, day, kind);
                      return (
                        <td key={key} className="px-1 py-1.5">
                          <button type="button" disabled={updating === key} onClick={() => toggleCell(s, day, kind)}
                            className={`h-7 w-7 rounded-lg text-[11px] font-black transition active:scale-90 ${
                              on ? (kind === 'dinner' ? 'bg-[#0071E3] text-white' : 'bg-[#F56300] text-white') : 'bg-slate-100 dark:bg-white/10 text-slate-300 dark:text-slate-500 hover:bg-slate-200'
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
          <h2 className="text-[17px] font-semibold">{weekRangeLabel(plan.weekStart)} 주 도시락 신청표</h2>
          <p className="text-[11px] font-semibold text-slate-500">
            {plan.campus && plan.campus !== 'all' ? getCampusLabel(plan.campus) : '전체 캠퍼스'}
            {' · 먹는 날엔 ○ 칸에 본인이 동그라미 표시 후 수령'}
          </p>
        </div>
        <div className="flex gap-4 items-start">
          {plan.meals.map((kind) => {
            const rows = scopedStudents.filter((s) => orderHasMeal(orderOf(s), kind, plan.closedDays));
            return (
              <div key={kind} className="flex-1">
                <p className="text-center text-sm font-black mb-1">{MEAL_KIND_LABELS[kind]}</p>
                <table className="w-full border-collapse text-center text-[11px]" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th className="border border-black px-1 py-1.5 font-black">이름</th>
                      {MEAL_DAYS.map((day) => (
                        <th key={day} className="border border-black px-1 py-1.5 font-black w-9">
                          {MEAL_DAY_LABELS[day]}{isClosedDay(plan, day) ? '(휴)' : ''}
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
                              style={isClosedDay(plan, day) ? { background: '#E5E7EB' } : undefined}>
                              {isClosedDay(plan, day) ? '휴무' : eatsOn(order, day, kind) ? '' : 'X'}
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
        {settlement.rows.length > 0 && (settlement.lp > 0 || settlement.dp > 0) && (
          <div style={{ breakBefore: 'page' }} className="mt-6">
            <div className="text-center mb-3">
              <h2 className="text-[17px] font-semibold">{weekRangeLabel(plan.weekStart)} 주 도시락 정산표</h2>
              <p className="text-[11px] font-semibold text-slate-500">
                점심 {settlement.lp.toLocaleString()}원 · 저녁 {settlement.dp.toLocaleString()}원
              </p>
            </div>
            <table className="w-full border-collapse text-center text-[11px]">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1.5 font-black">이름</th>
                  {plan.meals.includes('lunch') && <th className="border border-black px-2 py-1.5 font-black">점심</th>}
                  {plan.meals.includes('dinner') && <th className="border border-black px-2 py-1.5 font-black">저녁</th>}
                  <th className="border border-black px-2 py-1.5 font-black">금액</th>
                </tr>
              </thead>
              <tbody>
                {settlement.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-black px-2 py-1.5 font-bold">{r.name}</td>
                    {plan.meals.includes('lunch') && <td className="border border-black px-2 py-1.5">{r.lunch}</td>}
                    {plan.meals.includes('dinner') && <td className="border border-black px-2 py-1.5">{r.dinner}</td>}
                    <td className="border border-black px-2 py-1.5 font-bold">{r.amount.toLocaleString()}원</td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-black px-2 py-1.5 font-black">합계</td>
                  {plan.meals.includes('lunch') && <td className="border border-black px-2 py-1.5 font-black">{settlement.lunch}</td>}
                  {plan.meals.includes('dinner') && <td className="border border-black px-2 py-1.5 font-black">{settlement.dinner}</td>}
                  <td className="border border-black px-2 py-1.5 font-black">{settlement.total.toLocaleString()}원</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
