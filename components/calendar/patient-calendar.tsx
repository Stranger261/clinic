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
  justBecameUnavailable,
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
  // A time on the day being viewed that someone else just took (shown briefly).
  const [justTaken, setJustTaken] = useState<{
    id: number;
    time: string;
    date: string;
  } | null>(null);

  // Refs let the live handler read the latest values without re-subscribing every time they change.
  const liveRef = useRef(false);
  const slotsRef = useRef(slots);
  const selectedRef = useRef(selected);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const supabase = createClient();

    const commit = (next: Map<number, CalSlot>) => {
      slotsRef.current = next;
      setSlots(next);
    };

    // Ask the database for the truth. Used when the live connection starts, restarts, or is down.
    const refetch = async () => {
      const { data } = await supabase.rpc("calendar_slots", {
        p_doctor_id: doctorId,
        p_from: first,
        p_days: days,
      });
      if (data) commit(toMap(data as CalSlot[]));
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
          const change = payload as unknown as SlotChange;
          const before = slotsRef.current;
          const after = applyChange(
            before,
            change,
            { from: first, to: last },
            Date.now(),
          );

          // If a time on the day this patient is looking at was just taken, tell them and highlight it.
          const id = Number(change.new?.id);
          if (justBecameUnavailable(before, after, id, selectedRef.current)) {
            const slot = after.get(id)!;
            setJustTaken({
              id,
              time: formatTime(slot.slot_start),
              date: selectedRef.current,
            });
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            noticeTimer.current = setTimeout(() => setJustTaken(null), 6000);
          }
          commit(after);
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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      supabase.removeChannel(channel);
    };
  }, [doctorId, first, last, days]);

  const stats = dayStats(slots.values());
  const dayStat = stats.get(selected) ?? { open: 0, total: 0 };
  const fullyBooked = dayStat.total > 0 && dayStat.open === 0;
  const list = [...slots.values()]
    .filter((s) => dayKey(s.slot_start) === selected)
    .sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start));
  const notice = justTaken && justTaken.date === selected ? justTaken : null;

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

        {fullyBooked && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            This date is fully booked. Every time has already been taken, so
            please pick another day.
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            {notice.time} was just taken by someone else.
          </p>
        )}

        {list.length > 0 && (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((s) => {
              const time = formatTime(s.slot_start);
              const flash =
                notice?.id === s.slot_id
                  ? "ring-2 ring-red-300 ring-offset-1"
                  : "";
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
                    className={`block rounded-lg px-2 py-2.5 text-center text-sm transition ${flash} ${
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
