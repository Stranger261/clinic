"use client";

import { monthCells, dayNumber } from "@/lib/calendar";
import { formatDateOnly } from "@/lib/clinic";
import { tone, type Tone } from "@/lib/slots-state";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toneClass: Record<Tone, string> = {
  plenty: "border-green-200 bg-green-50 text-green-900 hover:bg-green-100",
  some: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  few: "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",
  full: "border-slate-200 bg-slate-100 text-slate-400",
  none: "border-transparent text-slate-300",
};

const legend = [
  { label: "Plenty open", swatch: "bg-green-100 border-green-300" },
  { label: "Filling up", swatch: "bg-amber-100 border-amber-300" },
  { label: "Almost full", swatch: "bg-red-100 border-red-300" },
  { label: "Full", swatch: "bg-slate-100 border-slate-300" },
];

// A real month calendar. Each day shows "open / total" and is tinted by how many are left.
// patient mode: full days and empty days cannot be opened. doctor mode: every future day can.
export default function MonthGrid({
  month,
  stats,
  selected,
  today,
  mode,
  onSelect,
}: {
  month: string;
  stats: Map<string, { open: number; total: number }>;
  selected: string;
  today: string;
  mode: "patient" | "doctor";
  onSelect: (date: string) => void;
}) {
  return (
    <div>
      <div
        className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted sm:gap-2"
        aria-hidden
      >
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1.5 sm:gap-2"
        role="group"
        aria-label="Calendar"
      >
        {monthCells(month).map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;

          const s = stats.get(date) ?? { open: 0, total: 0 };
          const past = date < today;
          const t = tone(s.open, s.total);
          const clickable =
            !past && (mode === "doctor" || (t !== "none" && t !== "full"));
          const isSelected = date === selected;

          const label =
            t === "none" ? "" : t === "full" ? "Full" : `${s.open}/${s.total}`;
          const spoken = past
            ? "Past"
            : t === "none"
              ? "No slots"
              : t === "full"
                ? "Full, no slots left"
                : `${s.open} of ${s.total} slots open`;

          return (
            <button
              key={date}
              type="button"
              disabled={!clickable}
              aria-pressed={clickable ? isSelected : undefined}
              aria-label={`${formatDateOnly(date)}: ${spoken}`}
              onClick={() => onSelect(date)}
              className={`flex min-h-16 flex-col justify-between rounded-xl border p-1.5 text-left transition sm:min-h-20 sm:p-2 ${
                past ? "border-transparent text-slate-300" : toneClass[t]
              } ${clickable ? "cursor-pointer" : "cursor-not-allowed"} ${
                isSelected
                  ? "ring-2 ring-brand-600 ring-offset-2 ring-offset-canvas"
                  : ""
              }`}
            >
              <span
                className={`text-sm font-semibold ${date === today ? "text-brand-700 underline underline-offset-4" : ""}`}
              >
                {dayNumber(date)}
              </span>
              <span className="text-[11px] font-medium sm:text-xs">
                {past ? "" : label}
              </span>
            </button>
          );
        })}
      </div>

      <ul
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted"
        aria-label="Legend"
      >
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border ${l.swatch}`} />
            {l.label}
          </li>
        ))}
        <li>Numbers show open / total slots</li>
      </ul>
    </div>
  );
}
