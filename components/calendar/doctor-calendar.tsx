"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LiveBadge from "@/components/live-badge";
import MonthGrid from "@/components/calendar/month-grid";
import SubmitButton from "@/components/submit-button";
import { StatusBadge } from "@/components/ui";
import { addSlot, deleteSlot, extendSlot } from "@/lib/actions/doctor";
import { firstOfMonth, lastOfMonth } from "@/lib/calendar";
import {
  BREAK_MINUTES,
  SLOT_MINUTES,
  dayKey,
  formatDateOnly,
  formatTime,
  reasonLabel,
} from "@/lib/clinic";
import { type SlotStatus, dayStats, toMap } from "@/lib/slots-state";
import { createClient } from "@/lib/supabase/client";
import { buttonClass, inputClass } from "@/constants";

export type DoctorSlot = {
  slot_id: number;
  slot_start: string;
  slot_end: string;
  slot_status: SlotStatus;
  patient_name: string | null;
  reschedule_pending: boolean;
  visit_reason: string | null;
  visit_note: string | null;
};

export default function DoctorCalendar({
  doctorId,
  month,
  initialSlots,
  defaultDate,
  today,
}: {
  doctorId: number;
  month: string;
  initialSlots: DoctorSlot[];
  defaultDate: string;
  today: string;
}) {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);

  const [slots, setSlots] = useState(() => toMap(initialSlots));
  const [prevInitial, setPrevInitial] = useState(initialSlots);
  if (initialSlots !== prevInitial) {
    setPrevInitial(initialSlots);
    setSlots(toMap(initialSlots));
  }

  const [selected, setSelected] = useState(defaultDate);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // A slot event does not say who booked it, so the doctor's view asks the database for the full picture.
    const refetch = async () => {
      const { data } = await supabase.rpc("my_schedule");
      if (!data) return;
      const inMonth = (data as DoctorSlot[]).filter((s) => {
        const d = dayKey(s.slot_start);
        return d >= first && d <= last;
      });
      setSlots(toMap(inMonth));
    };

    const channel = supabase
      .channel(`doctor-${doctorId}-schedule`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "slots",
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refetch(), 250);
        },
      )
      .subscribe((status) => {
        liveRef.current = status === "SUBSCRIBED";
        setLive(liveRef.current);
        if (liveRef.current) void refetch();
      });

    const fallback = setInterval(() => {
      if (!liveRef.current) void refetch();
    }, 30000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [doctorId, first, last]);

  const stats = dayStats(slots.values());
  const dayStat = stats.get(selected) ?? { open: 0, total: 0 };
  const list = [...slots.values()]
    .filter((s) => dayKey(s.slot_start) === selected)
    .sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex justify-end">
          <LiveBadge live={live} />
        </div>
        <MonthGrid
          month={month}
          stats={stats}
          selected={selected}
          today={today}
          mode="doctor"
          onSelect={setSelected}
        />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">{formatDateOnly(selected)}</h2>
        <p className="mt-1 text-sm text-muted">
          {dayStat.total === 0
            ? "No slots yet on this day."
            : `${dayStat.open} of ${dayStat.total} slots open`}
        </p>

        {/* The date comes from the calendar, so the doctor only needs to pick a time. */}
        <form action={addSlot} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="date" value={selected} />
          <label className="text-sm font-medium">
            <span className="mb-1 block">Add a slot at</span>
            <input type="time" name="time" required className={inputClass} />
          </label>
          <SubmitButton pendingLabel="Adding...">Add slot</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-muted">
          Each slot is {SLOT_MINUTES} minutes, with at least {BREAK_MINUTES}{" "}
          minutes between slots.
        </p>

        {list.length > 0 && (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {list.map((s) => (
              <li key={s.slot_id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatTime(s.slot_start)} to {formatTime(s.slot_end)}
                  </span>
                  <StatusBadge status={s.slot_status} />
                </div>

                {(s.slot_status === "booked" || s.slot_status === "held") && (
                  <div className="text-sm text-muted">
                    <p>
                      {s.slot_status === "held" ? "Held for " : ""}
                      {s.patient_name || "Patient"}
                    </p>
                    <p>
                      Reason: {reasonLabel(s.visit_reason)}
                      {s.visit_note ? ` (${s.visit_note})` : ""}
                    </p>
                    {s.reschedule_pending && (
                      <p className="font-medium text-amber-800">
                        Asked to reschedule
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {s.slot_status === "booked" ? (
                    <>
                      {s.reschedule_pending && (
                        <Link
                          href="/doctor/requests"
                          className={buttonClass("ghost", "sm")}
                        >
                          Review request
                        </Link>
                      )}
                      <form action={extendSlot}>
                        <input type="hidden" name="id" value={s.slot_id} />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          pendingLabel="Extending..."
                        >
                          Extend visit
                        </SubmitButton>
                      </form>
                    </>
                  ) : s.slot_status === "held" ? (
                    <span className="text-xs text-muted">
                      Held for a reschedule request
                    </span>
                  ) : (
                    <form action={deleteSlot}>
                      <input type="hidden" name="id" value={s.slot_id} />
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        pendingLabel="Deleting..."
                      >
                        Delete
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
