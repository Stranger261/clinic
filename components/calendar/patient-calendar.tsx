"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LiveBadge from "@/components/live-badge";
import MonthGrid from "@/components/calendar/month-grid";
import { daysInMonth, firstOfMonth, lastOfMonth } from "@/lib/calendar";
import { dayKey, formatDateOnly, formatTime } from "@/lib/clinic";
import {
  type CalSlot,
  type SlotChange,
  applyChange,
  dayStats,
  toMap,
} from "@/lib/slots-state";
import { createClient } from "@/lib/supabase/client";

export default function PatientCalendar({
  doctorId,
  month,
  initialSlots,
  defaultDate,
  today,
}: {
  doctorId: number;
  month: string;
  initialSlots: CalSlot[];
  defaultDate: string;
  today: string;
}) {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const days = daysInMonth(month);

  // This component owns its slots after the first paint. New server data (a page navigation) replaces them.
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

    // Ask the database for the truth. Used when the live connection starts, restarts, or is down.
    const refetch = async () => {
      const { data } = await supabase.rpc("calendar_slots", {
        p_doctor_id: doctorId,
        p_from: first,
        p_days: days,
      });
      if (data) setSlots(toMap(data as CalSlot[]));
    };

    // One "room" per doctor: we only hear about this doctor's slots. Each event patches the screen directly,
    // with no page reload and no extra request.
    const channel = supabase
      .channel(`doctor-${doctorId}-slots`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "slots",
          filter: `doctor_id=eq.${doctorId}`,
        },
        (payload) => {
          setSlots((current) =>
            applyChange(
              current,
              payload as unknown as SlotChange,
              { from: first, to: last },
              Date.now(),
            ),
          );
        },
      )
      .subscribe((status) => {
        liveRef.current = status === "SUBSCRIBED";
        setLive(liveRef.current);
        // Anything that changed while we were not connected is picked up here.
        if (liveRef.current) void refetch();
      });

    // Safety net: while the live connection is down, check the database now and then.
    const fallback = setInterval(() => {
      if (!liveRef.current) void refetch();
    }, 30000);

    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [doctorId, first, last, days]);

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
          mode="patient"
          onSelect={setSelected}
        />
      </div>

      <section
        aria-live="polite"
        className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
      >
        <h2 className="font-semibold">{formatDateOnly(selected)}</h2>
        <p className="mt-1 text-sm text-muted">
          {dayStat.total === 0
            ? "No slots on this day."
            : `${dayStat.open} of ${dayStat.total} times open`}
        </p>

        {list.length > 0 && (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((s) => {
              const time = formatTime(s.slot_start);
              if (s.slot_status === "open") {
                return (
                  <li key={s.slot_id}>
                    <Link
                      href={`/book/confirm?slot=${s.slot_id}&doctor=${doctorId}&date=${selected}`}
                      className="block rounded-lg border border-brand-300 bg-brand-50 px-2 py-2.5 text-center text-sm font-medium text-brand-800 transition hover:bg-brand-600 hover:text-white"
                    >
                      {time}
                    </Link>
                  </li>
                );
              }
              const held = s.slot_status === "held";
              return (
                <li key={s.slot_id}>
                  <span
                    aria-label={`${time}, ${held ? "held" : "taken"}`}
                    className={`block rounded-lg px-2 py-2.5 text-center text-sm ${
                      held
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-100 text-slate-400 line-through"
                    }`}
                  >
                    {time}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Crossed out times are already taken.
          </p>
        )}
      </section>
    </div>
  );
}
