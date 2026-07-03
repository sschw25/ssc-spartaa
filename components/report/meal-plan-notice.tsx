'use client';

import React, { useState } from 'react';
import { Utensils, CheckCircle2, Loader2, Lock, Clock, XCircle } from 'lucide-react';
import type { MealPlan, MealOrder, MealKind, MealDay } from '@/lib/types/student';
import {
  MEAL_DAYS, MEAL_DAY_LABELS, MEAL_KIND_LABELS,
  weekRangeLabel, formatDeadline, eatsOn, withSelection, isClosedDay,
} from '@/lib/meal';

export type MealPlanWithOrder = MealPlan & { myOrder: MealOrder | null; pastDeadline: boolean };

interface MealPlanNoticeProps {
  plans: MealPlanWithOrder[];
  onSaved: (planId: string, order: MealOrder) => void;
}

function PlanCard({ plan, onSaved }: { plan: MealPlanWithOrder; onSaved: (planId: string, order: MealOrder) => void }) {
  const [sel, setSel] = useState<MealOrder['selections']>(plan.myOrder?.selections || {});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(plan.myOrder?.updatedAt || null);
  // 추가신청(마감 후)
  const [addDay, setAddDay] = useState<MealDay>(MEAL_DAYS.find((d) => !isClosedDay(plan, d)) || 'mon');
  const [addMeal, setAddMeal] = useState<MealKind>(plan.meals[0]);
  const [addReason, setAddReason] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addDone, setAddDone] = useState(false);

  const toggle = (day: MealDay, kind: MealKind) => {
    setSel((cur) => withSelection(cur, day, kind, !eatsOn({ planId: plan.id, selections: cur, updatedAt: '' }, day, kind)));
  };

  const persistSelections = async (nextSelections: MealOrder['selections']) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/student/meal-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, selections: nextSelections }),
      });
      const json = await res.json();
      if (json.success) {
        setSel(nextSelections);
        setSavedAt(json.order?.updatedAt || new Date().toISOString());
        onSaved(plan.id, json.order);
      }
    } catch {} finally { setSaving(false); }
  };

  const save = async () => {
    await persistSelections(sel);
  };

  const saveNone = async () => {
    await persistSelections({});
  };

  const submitAdd = async () => {
    if (addSubmitting) return;
    setAddSubmitting(true);
    try {
      const res = await fetch('/api/student/meal-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, addRequest: { day: addDay, meal: addMeal, reason: addReason.trim() || undefined } }),
      });
      const json = await res.json();
      if (json.success) {
        setAddDone(true);
        onSaved(plan.id, json.order);
        setAddReason('');
      }
    } catch {} finally { setAddSubmitting(false); }
  };

  const pendingAdds = (plan.myOrder?.addRequests || []).filter((r) => r.status === 'pending');

  return (
    <div className="rounded-2xl border border-[#FDE7C9] bg-[#FFF8EE] overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#FCE7BE] text-[#B45309]">
          <Utensils className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-900">
            {weekRangeLabel(plan.weekStart)} 주 도시락 신청 · {plan.meals.map((m) => MEAL_KIND_LABELS[m]).join('·')}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
            {plan.pastDeadline
              ? '신청이 마감되었어요. 추가가 필요하면 아래에서 요청하면 선생님 승인 후 반영돼요.'
              : <>먹을 끼니를 <b className="text-[#B45309]">요일별로</b> 선택하고 저장하세요.{plan.deadline && ` 마감: ${formatDeadline(plan.deadline)}`}</>}
          </p>
        </div>
      </div>

      {/* 마감 전 — 끼니별 선택 그리드 */}
      {!plan.pastDeadline ? (
        <div className="px-4 pb-4 space-y-3">
          <div className="overflow-hidden rounded-xl border border-[#F1DFC0] bg-white">
            <table className="w-full text-center text-xs">
              <thead className="bg-[#FFF3E0] text-[10px] font-black text-[#B45309]">
                <tr>
                  <th className="py-2 px-2">요일</th>
                  {plan.meals.map((k) => <th key={k} className="py-2 px-2">{MEAL_KIND_LABELS[k]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F6E8CF]">
                {MEAL_DAYS.map((day) => {
                  const closed = isClosedDay(plan, day);
                  return (
                    <tr key={day} className={closed ? 'bg-slate-50' : ''}>
                      <td className="py-1.5 px-2 font-black text-slate-600">{MEAL_DAY_LABELS[day]}</td>
                      {closed ? (
                        <td colSpan={plan.meals.length} className="py-1.5 px-2 text-[11px] font-bold text-slate-300">휴무</td>
                      ) : plan.meals.map((kind) => {
                        const on = eatsOn({ planId: plan.id, selections: sel, updatedAt: '' }, day, kind);
                        return (
                          <td key={kind} className="py-1.5 px-2">
                            <button type="button" onClick={() => toggle(day, kind)}
                              className={`h-8 w-full rounded-lg text-[11px] font-black border transition active:scale-95 ${
                                on ? 'border-[#B45309] bg-[#F59E0B] text-white' : 'border-slate-200 bg-slate-50 text-slate-300'
                              }`}>
                              {on ? '먹음' : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" disabled={saving} onClick={save}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#B45309] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#92400E] disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {savedAt ? '신청 수정 저장' : '도시락 신청 저장'}
            </button>
            <button type="button" disabled={saving} onClick={saveNone}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-[#F1DFC0] bg-white px-4 py-2.5 text-xs font-semibold text-[#B45309] transition hover:bg-[#FFF3E0] disabled:opacity-50"
              title="이번 주 도시락을 먹지 않는 것으로 저장">
              <XCircle className="w-3.5 h-3.5" />
              미신청
            </button>
          </div>
          {savedAt && <p className="text-center text-[10px] font-bold text-emerald-600">저장됨 — 마감 전까지 자유롭게 수정할 수 있어요</p>}
        </div>
      ) : (
        /* 마감 후 — 현재 신청 요약 + 추가신청 */
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              내 신청:{' '}
              {plan.meals.map((kind) => {
                const days = MEAL_DAYS.filter((d) => eatsOn(plan.myOrder || undefined, d, kind)).map((d) => MEAL_DAY_LABELS[d]);
                return <span key={kind} className="mr-2">{MEAL_KIND_LABELS[kind]} {days.length ? days.join('') : '없음'}</span>;
              })}
            </span>
          </div>

          {pendingAdds.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 space-y-1">
              {pendingAdds.map((r) => (
                <p key={r.id} className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                  <Clock className="w-3 h-3" /> {MEAL_DAY_LABELS[r.day]} {MEAL_KIND_LABELS[r.meal]} 추가 — 승인 대기
                </p>
              ))}
            </div>
          )}

          {addDone ? (
            <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> 추가 신청이 접수되었어요. 선생님 승인 후 도시락표에 반영됩니다.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-black text-slate-500">추가 신청 (선생님 승인 필요)</p>
              <div className="flex gap-2">
                <select value={addDay} onChange={(e) => setAddDay(e.target.value as MealDay)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 focus:outline-none">
                  {MEAL_DAYS.filter((d) => !isClosedDay(plan, d)).map((d) => <option key={d} value={d}>{MEAL_DAY_LABELS[d]}요일</option>)}
                </select>
                <select value={addMeal} onChange={(e) => setAddMeal(e.target.value as MealKind)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 focus:outline-none">
                  {plan.meals.map((k) => <option key={k} value={k}>{MEAL_KIND_LABELS[k]}</option>)}
                </select>
              </div>
              <input value={addReason} onChange={(e) => setAddReason(e.target.value)} maxLength={200}
                placeholder="사유 (선택)"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none" />
              <button type="button" disabled={addSubmitting} onClick={submitAdd}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-black text-white hover:bg-slate-900 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                {addSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} 추가 신청 보내기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MealPlanNotice({ plans, onSaved }: MealPlanNoticeProps) {
  if (plans.length === 0) return null;
  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onSaved={onSaved} />
      ))}
    </div>
  );
}
