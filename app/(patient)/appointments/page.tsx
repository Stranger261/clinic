import Link from "next/link";
import SubmitButton from "@/components/submit-button";
import { EmptyState, Messages, PageHeader, StatusBadge } from "@/components/ui";
import { cancelAppointment } from "@/lib/actions/patient";
import { withdrawReschedule } from "@/lib/actions/reschedule";
import {
  CANCEL_NOTICE_HOURS,
  formatDay,
  formatTime,
  nowIso,
  reasonLabel,
} from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import { buttonClass, liftClass } from "@/constants";

export const metadata = { title: "My appointments" };

type Appointment = {
  appointment_id: number;
  status: "confirmed" | "cancelled";
  slot_start: string;
  slot_end: string;
  doctor_name: string;
  department_name: string;
  request_id: number | null;
  request_status:
    | "pending"
    | "approved"
    | "denied"
    | "withdrawn"
    | "expired"
    | null;
  request_new_start: string | null;
  request_note: string | null;
  visit_reason: string | null;
  visit_note: string | null;
};

function Row({ a, now }: { a: Appointment; now: number }) {
  const start = new Date(a.slot_start).getTime();
  const upcoming =
    a.status === "confirmed" && new Date(a.slot_end).getTime() >= now;
  // These only decide what to SHOW. The database enforces the real rules.
  const canCancel =
    upcoming && start - now >= CANCEL_NOTICE_HOURS * 60 * 60 * 1000;
  const canRequest = upcoming && !canCancel && start > now;
  const pending =
    upcoming && a.request_status === "pending" && a.request_new_start !== null;

  return (
    <li
      className={`space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm ${liftClass}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {formatDay(a.slot_start)}, {formatTime(a.slot_start)} to{" "}
            {formatTime(a.slot_end)}
          </p>
          <p className="text-sm text-muted">
            {a.doctor_name || "Doctor"}, {a.department_name}
          </p>
          {/* React escapes this text, so whatever the patient typed cannot inject HTML. */}
          <p className="text-sm text-muted">
            Reason: {reasonLabel(a.visit_reason)}
            {a.visit_note ? ` (${a.visit_note})` : ""}
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      {!pending && canCancel && (
        <details className="text-sm">
          <summary
            className={`${buttonClass("danger", "sm")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            Cancel appointment
          </summary>
          <form action={cancelAppointment} className="mt-3">
            <input type="hidden" name="id" value={a.appointment_id} />
            <SubmitButton
              variant="danger"
              size="sm"
              pendingLabel="Cancelling..."
            >
              Yes, cancel this appointment
            </SubmitButton>
          </form>
        </details>
      )}

      {!pending && canRequest && (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/appointments/${a.appointment_id}/reschedule`}
            className={buttonClass("secondary", "sm")}
          >
            Request emergency reschedule
          </Link>
          <span className="text-xs text-muted">
            Cancellation closed {CANCEL_NOTICE_HOURS} hours before the visit.
          </span>
        </div>
      )}

      {pending && a.request_new_start && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            Reschedule requested for {formatDay(a.request_new_start)},{" "}
            {formatTime(a.request_new_start)}. Waiting for approval.
          </span>
          <form action={withdrawReschedule}>
            <input type="hidden" name="requestId" value={a.request_id ?? ""} />
            <SubmitButton
              raw
              spinner={false}
              pendingLabel="Withdrawing..."
              className="font-semibold underline"
            >
              Withdraw
            </SubmitButton>
          </form>
        </div>
      )}

      {upcoming && a.request_status === "denied" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          Your reschedule request was denied.
          {a.request_note ? ` Note: ${a.request_note}` : ""}
        </p>
      )}
      {upcoming && a.request_status === "approved" && (
        <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
          This appointment was moved after your request.
        </p>
      )}
    </li>
  );
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { notice, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_appointments");
  const all = (data ?? []) as Appointment[];

  const now = new Date(nowIso()).getTime();
  const upcoming = all
    .filter(
      (a) => a.status === "confirmed" && new Date(a.slot_end).getTime() >= now,
    )
    .sort((a, b) => a.slot_start.localeCompare(b.slot_start));
  const history = all.filter((a) => !upcoming.includes(a));

  return (
    <>
      <PageHeader
        title="My appointments"
        subtitle="Everything you have booked, in one place."
      />
      <Messages error={error} notice={notice} />

      <h2 className="mb-3 font-semibold">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState>
          Nothing booked yet.{" "}
          <Link href="/book" className="font-semibold text-brand-700 underline">
            Find a slot
          </Link>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((a) => (
            <Row key={a.appointment_id} a={a} now={now} />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-semibold">Past and cancelled</h2>
          <ul className="space-y-3">
            {history.map((a) => (
              <Row key={a.appointment_id} a={a} now={now} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
