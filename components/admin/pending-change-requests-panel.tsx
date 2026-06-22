'use client';

import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Student } from '@/lib/types/student';
import { buildPendingAdminTaskRows } from '@/lib/student-requests';

interface PendingAdminTasksPanelProps {
  students: Student[];
  onOpenStudent: (studentId: string) => void;
  getCampusLabel?: (campus: string) => string;
  className?: string;
  maxRows?: number;
  title?: string;
  description?: string;
}

export function PendingAdminTasksPanel({
  students,
  onOpenStudent,
  getCampusLabel = (campus) => campus,
  className = '',
  maxRows = 6,
  title,
  description,
}: PendingAdminTasksPanelProps) {
  const rows = buildPendingAdminTaskRows(students);
  const visibleRows = rows.slice(0, maxRows);
  const totalChangeCount = rows.reduce((sum, row) => sum + row.changeRequests.length, 0);
  const totalLeaveCount = rows.reduce((sum, row) => sum + row.leaveRequests.length, 0);
  const totalSuggestionCount = rows.reduce((sum, row) => sum + row.suggestions.length, 0);
  const totalRequestCount = totalChangeCount + totalLeaveCount + totalSuggestionCount;

  if (totalRequestCount === 0) return null;

  return (
    <div className={`admin-fit-box rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.03] to-amber-500/[0.07] p-5 shadow-[0_2px_8px_rgba(245,99,0,0.02)] ${className}`}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="admin-fit-row flex items-start gap-3.5">
            <div className="shrink-0 rounded-xl bg-amber-500/10 p-2 text-amber-700">
              <ClipboardList className="admin-fit-icon h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="admin-fit-text text-sm font-black tracking-tight text-amber-900">
                  {title || `대기중 요청 ${totalRequestCount}건`}
                </h4>
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {rows.length}명
                </span>
              </div>
              <p className="admin-fit-caption mt-1 text-xs font-semibold leading-relaxed text-amber-700/90">
                {description || `학생별 요청 수와 신청 종류를 확인한 뒤 기존 학생 상세 시트에서 답변 및 처리할 수 있습니다.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-amber-800">학습 변경 {totalChangeCount}건</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-amber-800">반차/휴가 {totalLeaveCount}건</span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-amber-800">건의사항 {totalSuggestionCount}건</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visibleRows.map((row) => {
            const latestRequest = row.changeRequests[0] || row.suggestions[0];
            const rowCount = row.changeRequests.length + row.leaveRequests.length + row.suggestions.length;
            const latestText = latestRequest?.content || row.leaveRequests[0]?.reason || '요청 내용 확인 필요';

            return (
              <button
                key={row.student.id}
                type="button"
                onClick={() => onOpenStudent(row.student.id)}
                className="group flex min-w-0 flex-col gap-2 rounded-2xl border border-amber-100 bg-white p-3 text-left shadow-sm transition hover:border-amber-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-black text-[#1D1D1F]">{row.student.name}</span>
                    <Badge className="rounded-md border border-black/[0.06] bg-[#F5F5F7] px-1.5 py-0.5 text-[9px] font-bold text-[#86868B]">
                      {getCampusLabel(row.student.campus)}
                    </Badge>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      {rowCount}건
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.labels.map((label) => (
                      <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="truncate text-[11px] font-semibold text-slate-500">
                    {latestText}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center justify-end gap-0.5 text-[11px] font-black text-amber-700 group-hover:underline">
                  바로 열기 <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>

        {rows.length > visibleRows.length && (
          <p className="text-[10px] font-extrabold text-amber-700">
            외 {rows.length - visibleRows.length}명 더 있음
          </p>
        )}
      </div>
    </div>
  );
}

export const PendingChangeRequestsPanel = PendingAdminTasksPanel;
