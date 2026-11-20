import AutoRefresh from "@/components/auto-refresh";
import SubmitButton from "@/components/submit-button";
import {
  Card,
  EmptyState,
  Messages,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { isDateKey } from "@/lib/calendar";
import { checkIn } from "@/lib/actions/reception";
import { dayKey, formatDateOnly, formatTime, nowIso } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { buttonClass, inputClass } from "@/constants";

export const metadata = { title: "Reception" };

type Row = {
  appointment_id: number;
  slot_start: string;
  slot_end: string;
  doctor_name: string;
  department_name: string;
  patient_name: string;
  patient_no: number | null;
  patient_phone: string | null;
  patient_age: number | null;
  outcome: "completed" | "no_show" | null;
  stage: "checked_in" | "ready" | "in_consultation" | "completed" | null;
  checked_in_at: string | null;
};

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const today = dayKey(nowIso());
  const date = isDateKey(params.date) ? params.date : today; // the URL is untrusted

  const supabase = await createClient();
  const { data } = await supabase.rpc("reception_schedule", {
    p_date: date,
  });
  const rows = (data ?? []) as Row[];
  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Reception"
        subtitle="Today's appointments. Check patients in when they arrive."
      />
      <Messages error={params.error} notice={params.notice} />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            <span className="mb-1.5 block">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className={inputClass}
            />
          </label>
          <button className={buttonClass()}>Show</button>
          {date !== today && (
            <Link href="/reception" className={buttonClass("ghost")}>
              Today
            </Link>
          )}
        </form>
      </Card>

      <h2 className="mb-3 mt-6 font-semibold">{formatDateOnly(date)}</h2>
      {rows.length === 0 ? (
        <EmptyState>No appointments on this day.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {rows.map((r) => {
            const state = r.outcome ?? r.stage ?? "not_arrived";
            return (
              <li
                key={r.appointment_id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatTime(r.slot_start)} to {formatTime(r.slot_end)}
                  </p>
                  <p className="text-sm">
                    {r.patient_name || "Patient"}
                    <span className="text-muted">
                      {r.patient_no !== null
                        ? ` · P-${String(r.patient_no).padStart(6, "0")}`
                        : ""}
                      {r.patient_age !== null
                        ? ` · ${r.patient_age} years`
                        : ""}
                      {r.patient_phone ? ` · ${r.patient_phone}` : ""}
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    {r.doctor_name || "Doctor"}, {r.department_name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={state} />
                  {!r.stage && !r.outcome && (
                    <form action={checkIn}>
                      <input type="hidden" name="id" value={r.appointment_id} />
                      <input
                        type="hidden"
                        name="date"
                        value={
                          params.date && isDateKey(params.date)
                            ? params.date
                            : ""
                        }
                      />
                      <SubmitButton size="sm" pendingLabel="Checking in...">
                        Check in
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
