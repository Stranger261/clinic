"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LiveBadge from "@/components/live-badge";
import MonthGrid from "@/components/calendar/month-grid";
import SubmitButton from "@/components/submit-button";
import { StatusBadge } from "@/components/ui";
import {
  addSlot,
  deleteSlot,
  extendSlot,
  setOutcome,
} from "@/lib/actions/doctor";
import { firstOfMonth, lastOfMonth } from "@/lib/calendar";
import {
  BREAK_MINUTES,
  SLOT_MINUTES,
  dayKey,
  formatDateOnly,
  formatTime,
  reasonLabel,
} from "@/lib/clinic";
import { dayStats, toMap } from "@/lib/slots-state";
import { createClient } from "@/lib/supabase/client";
import { useNow } from "@/lib/use-now";
import { buttonClass, inputClass, Sex, SEX_OPTIONS } from "@/constants";
import { DoctorSlot } from "@/constants/calendar";

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
  const nowMs = useNow(); // 0 until the browser knows the time

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
  const isPast = selected < today;
  const visits = list.filter((s) => s.slot_status === "booked").length;

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
            ? "No slots on this day."
            : isPast
              ? `${visits} ${visits === 1 ? "visit" : "visits"}`
              : `${dayStat.open} of ${dayStat.total} slots open`}
        </p>

        {/* The date comes from the calendar, so the doctor only needs to pick a time. */}
        {!isPast && (
          <>
            <form
              action={addSlot}
              className="mt-4 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="date" value={selected} />
              <label className="text-sm font-medium">
                <span className="mb-1 block">Add a slot at</span>
                <input
                  type="time"
                  name="time"
                  required
                  className={inputClass}
                />
              </label>
              <SubmitButton pendingLabel="Adding...">Add slot</SubmitButton>
            </form>
            <p className="mt-2 text-xs text-muted">
              Each slot is {SLOT_MINUTES} minutes, with at least {BREAK_MINUTES}{" "}
              minutes between slots.
            </p>
          </>
        )}

        {list.length > 0 && (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {list.map((s) => {
              const started = nowMs > 0 && Date.parse(s.slot_start) <= nowMs;
              const ended = nowMs > 0 && Date.parse(s.slot_end) <= nowMs;
              const booked = s.slot_status === "booked";
              const hasAllergy =
                Boolean(s.allergies) && !/^none/i.test(s.allergies ?? "");

              return (
                <li key={s.slot_id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {formatTime(s.slot_start)} to {formatTime(s.slot_end)}
                    </span>
                    <StatusBadge status={s.outcome ?? s.slot_status} />
                  </div>

                  {(booked || s.slot_status === "held") && (
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

                  {/* Only what the doctor needs for the visit. The address and exact birth date stay private. */}
                  {booked && s.patient_phone && (
                    <div className="space-y-0.5 rounded-lg bg-canvas p-2.5 text-xs text-muted">
                      <p>
                        <span className="font-medium text-ink">
                          {s.patient_age !== null
                            ? `${s.patient_age} years`
                            : "Age unknown"}
                          {s.patient_sex
                            ? `, ${SEX_OPTIONS[s.patient_sex as Sex] ?? s.patient_sex}`
                            : ""}
                        </span>
                        {" · "}
                        <a
                          href={`tel:${s.patient_phone}`}
                          className="underline"
                        >
                          {s.patient_phone}
                        </a>
                      </p>
                      <p>
                        Emergency contact: {s.emergency_name},{" "}
                        <a
                          href={`tel:${s.emergency_phone}`}
                          className="underline"
                        >
                          {s.emergency_phone}
                        </a>
                      </p>
                      <p
                        className={
                          hasAllergy ? "font-semibold text-amber-800" : ""
                        }
                      >
                        Allergies: {s.allergies || "None listed"}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {booked ? (
                      <>
                        {s.reschedule_pending && (
                          <Link
                            href="/doctor/requests"
                            className={buttonClass("ghost", "sm")}
                          >
                            Review request
                          </Link>
                        )}
                        {/* A visit that is running over can take the next slot. */}
                        {started && !ended && !s.outcome && (
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
                        )}
                        {/* Once the visit has started, the doctor records how it went (and can correct it). */}
                        {started && s.outcome !== "completed" && (
                          <form action={setOutcome}>
                            <input type="hidden" name="id" value={s.slot_id} />
                            <input
                              type="hidden"
                              name="outcome"
                              value="completed"
                            />
                            <SubmitButton
                              size="sm"
                              variant={s.outcome ? "secondary" : "primary"}
                              pendingLabel="Saving..."
                            >
                              {s.outcome ? "Mark completed" : "Completed"}
                            </SubmitButton>
                          </form>
                        )}
                        {started && s.outcome !== "no_show" && (
                          <form action={setOutcome}>
                            <input type="hidden" name="id" value={s.slot_id} />
                            <input
                              type="hidden"
                              name="outcome"
                              value="no_show"
                            />
                            <SubmitButton
                              size="sm"
                              variant="secondary"
                              pendingLabel="Saving..."
                            >
                              {s.outcome ? "Mark no-show" : "No-show"}
                            </SubmitButton>
                          </form>
                        )}
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
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
