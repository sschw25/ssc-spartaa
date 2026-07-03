'use client';

import React, { useState } from 'react';
import { CalendarHeart, CheckCircle2, XCircle, Loader2, Ticket } from 'lucide-react';
import type { CampusEvent } from '@/lib/types/student';

interface CampusEventNoticeProps {
  events: CampusEvent[];
  onResponded: (eventId: string) => void;
}

function EventCard({ event, onResponded }: { event: CampusEvent; onResponded: (id: string) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [chosen, setChosen] = useState<'accepted' | 'declined' | null>(null);
  const [done, setDone] = useState(false);
  const [doneStatus, setDoneStatus] = useState<'accepted' | 'declined' | null>(null);

  const submit = async (status: 'accepted' | 'declined') => {
    if (submitting) return;
    setChosen(status);
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/campus-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, status }),
      });
      const json = await res.json();
      if (json.success) {
        setDoneStatus(status);
        setDone(true);
        setTimeout(() => onResponded(event.id), 1800);
      } else {
        setChosen(null);
      }
    } catch {
      setChosen(null);
    } finally {
      setSubmitting(false);
    }
  };

  const dateLabel = event.endDate && event.endDate !== event.date
    ? `${event.date} ~ ${event.endDate}`
    : event.date;
  const timeLabel = event.startTime ? ` ${event.startTime}${event.endTime ? `~${event.endTime}` : ''}` : '';

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 border border-slate-100">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        <p className="text-xs font-bold text-slate-500">
          <span className="font-black text-slate-700">{event.title}</span>{' '}
          {doneStatus === 'accepted' ? '참여 신청 완료 — 행사 후 쿠폰이 지급돼요!' : '불참으로 응답했어요'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#D9E8FF] bg-[#F2F8FF] overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#CFE4FF] text-[#0071E3]">
          <CalendarHeart className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-900">
            {event.title} · {dateLabel}{timeLabel} 참여하실래요?
          </p>
          {event.memo && (
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 whitespace-pre-wrap break-words">{event.memo}</p>
          )}
          {(event.couponReward || 0) > 0 && (
            <p className="text-[11px] font-bold text-[#0071E3] mt-1 inline-flex items-center gap-1">
              <Ticket className="w-3 h-3" /> 참여하면 행사 후 쿠폰 {event.couponReward}장 지급!
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit('accepted')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black border transition active:scale-[0.98] ${
              chosen === 'accepted' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
            }`}
          >
            {submitting && chosen === 'accepted' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            참여할게요
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit('declined')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black border transition active:scale-[0.98] ${
              chosen === 'declined' ? 'bg-slate-500 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {submitting && chosen === 'declined' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            어려워요
          </button>
        </div>
      </div>
    </div>
  );
}

export function CampusEventNotice({ events, onResponded }: CampusEventNoticeProps) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} onResponded={onResponded} />
      ))}
    </div>
  );
}
