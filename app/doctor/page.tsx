import Link from "next/link";
import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages, PageHeader, StatusBadge, buttonClass, inputClass } from "@/components/ui";
import { addSlot, deleteSlot, extendSlot } from "@/lib/actions/doctor";
import { BREAK_MINUTES, SLOT_MINUTES, dayKey, formatDay, formatTime, nowIso, reasonLabel } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My schedule" };

type Slot = {
  slot_id: number;
  slot_start: string;
  slot_end: string;
  slot_status: "open" | "booked" | "blocked" | "held";
  patient_name: string | null;
  reschedule_pending: boolean;
  visit_reason: string | null;
  visit_note: string | null;
};

export default async function DoctorHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  // One query returns each slot with its patient and reason (see 008 and 009 in supabase/).
  const { data } = await supabase.rpc("my_schedule");
  const slots = (data ?? []) as Slot[];

  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = dayKey(s.slot_start);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const today = dayKey(nowIso());

  return (
    <>
      <PageHeader title="My schedule" subtitle="Add slots, see who booked and why, and extend a visit when it runs over." />
      <Messages error={error} notice={notice} />

      <Card>
        <h2 className="font-semibold">Add a slot</h2>
        <p className="mt-1 text-sm text-muted">
          Each slot is {SLOT_MINUTES} minutes. Leave at least {BREAK_MINUTES} minutes between slots.
        </p>
        <form action={addSlot} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="date" name="date" min={today} required aria-label="Date" className={inputClass} />
          <input type="time" name="time" required aria-label="Start time" className={inputClass} />
          <SubmitButton pendingLabel="Adding...">Add slot</SubmitButton>
        </form>
      </Card>

      {slots.length === 0 && (
        <div className="mt-6">
          <EmptyState>No upcoming slots yet. Add your first one above.</EmptyState>
        </div>
      )}

      {[...byDay.entries()].map(([key, daySlots]) => (
        <section key={key} className="mt-8">
          <h2 className="mb-3 font-semibold">{formatDay(daySlots[0].slot_start)}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {daySlots.map((s) => (
              <li key={s.slot_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      {formatTime(s.slot_start)} to {formatTime(s.slot_end)}
                    </span>
                    <StatusBadge status={s.slot_status} />
                  </div>
                  {(s.slot_status === "booked" || s.slot_status === "held") && (
                    <div className="mt-1 text-sm text-muted">
                      <p>
                        {s.slot_status === "held" ? "Held for " : ""}
                        {s.patient_name || "Patient"}
                        {s.reschedule_pending ? " (asked to reschedule)" : ""}
                      </p>
                      <p>
                        Reason: {reasonLabel(s.visit_reason)}
                        {s.visit_note ? ` (${s.visit_note})` : ""}
                      </p>
                    </div>
                  )}
                </div>

                {s.slot_status === "booked" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {s.reschedule_pending && (
                      <Link href="/doctor/requests" className={buttonClass("ghost", "sm")}>
                        Review request
                      </Link>
                    )}
                    <form action={extendSlot}>
                      <input type="hidden" name="id" value={s.slot_id} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Extending...">Extend visit</SubmitButton>
                    </form>
                  </div>
                ) : s.slot_status === "held" ? (
                  <span className="text-xs text-muted">Held for a reschedule request</span>
                ) : (
                  <form action={deleteSlot}>
                    <input type="hidden" name="id" value={s.slot_id} />
                    <SubmitButton variant="danger" size="sm" pendingLabel="Deleting...">Delete</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
