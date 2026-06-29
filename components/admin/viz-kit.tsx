'use client';

/**
 * 어드민 공용 시각화 키트 (iOS 26 스케일).
 * 경찰·소방 stream-data-viz의 게이지/도넛/바를 범용화 — 텍스트밀집 지표를 시각화.
 * 규칙: 의미색(파랑=정보·초록=양호·앰버=주의·빨강=위험), semibold, 절제. 보라/인디고 금지.
 */

import React from 'react';
import { motion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;
const TRACK = '#ECECEF';
const INK = '#1D1D1F';
const MUTE = '#86868B';

export type VizSegment = { label: string; value: number; color: string };

/* ── 270° 방사형 게이지 (단일 비율, 예: 진도율·통과율) ── */
export function Gauge({
  value,
  size = 168,
  color = '#0071E3',
  centerLabel,
  caption,
}: {
  value: number; // 0~100
  size?: number;
  color?: string;
  centerLabel?: string; // 가운데 큰 텍스트 (없으면 value%)
  caption?: string; // 게이지 아래 라벨
}) {
  const r = 78;
  const cx = 100;
  const cy = 100;
  const C = 2 * Math.PI * r;
  const SWEEP = 0.75; // 270°
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" style={{ width: size, height: size }}>
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={TRACK} strokeWidth={16}
          strokeLinecap="round" strokeDasharray={`${SWEEP * C} ${C}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />
        <motion.circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={16}
          strokeLinecap="round" strokeDasharray={`${SWEEP * C} ${C}`}
          transform={`rotate(135 ${cx} ${cy})`}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: SWEEP * (clamped / 100) }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 1.2, ease: EASE }}
        />
        <text x={cx} y={cy + 2} textAnchor="middle" style={{ fontSize: 30, fontWeight: 600, fill: INK, letterSpacing: '-0.02em' }} className="tabular-nums">
          {centerLabel ?? `${Math.round(clamped)}%`}
        </text>
      </svg>
      {caption && <p className="-mt-2 text-[13px] font-medium text-[#1D1D1F] tracking-tight">{caption}</p>}
    </div>
  );
}

/* ── 도넛 (세그먼트 비율, 예: 학습 vs 미학습) ── */
export function Donut({
  segments,
  size = 168,
  centerTop,
  centerBottom,
  thickness = 22,
}: {
  segments: VizSegment[];
  size?: number;
  centerTop?: string;
  centerBottom?: string;
  thickness?: number;
}) {
  const r = 74;
  const cx = 100;
  const cy = 100;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={TRACK} strokeWidth={thickness} />
      {segments.map((seg, i) => {
        const f = seg.value / total;
        const startDeg = -90 + (acc / total) * 360;
        acc += seg.value;
        return (
          <motion.circle
            key={seg.label}
            cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={thickness}
            strokeLinecap="butt"
            transform={`rotate(${startDeg} ${cx} ${cy})`}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: f }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.12 * i }}
          />
        );
      })}
      {centerTop && (
        <text x={cx} y={centerBottom ? cy - 3 : cy + 4} textAnchor="middle" style={{ fontSize: 22, fontWeight: 600, fill: INK, letterSpacing: '-0.02em' }} className="tabular-nums">
          {centerTop}
        </text>
      )}
      {centerBottom && (
        <text x={cx} y={cy + 17} textAnchor="middle" style={{ fontSize: 12, fontWeight: 500, fill: MUTE }}>
          {centerBottom}
        </text>
      )}
    </svg>
  );
}

/* ── 범례 ── */
export function VizLegend({ segments }: { segments: VizSegment[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
          <span className="text-[12px] font-medium text-[#6e6e73]">
            {s.label} <b className="tabular-nums font-semibold" style={{ color: s.color }}>{s.value}</b>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── 가로 비교 바 ── */
export function CompareBar({ label, value, max = 100, color, suffix = '%', delay = 0 }: {
  label: string; value: number; max?: number; color: string; suffix?: string; delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-medium text-[#434345]">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>{value}{suffix}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: TRACK }}>
        <motion.div
          className="h-full rounded-full" style={{ backgroundColor: color }}
          initial={{ width: 0 }} whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 1, ease: EASE, delay }}
        />
      </div>
    </div>
  );
}
