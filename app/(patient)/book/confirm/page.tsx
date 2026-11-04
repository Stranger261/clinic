import Link from "next/link";
import LiveRefresh from "@/components/live-refresh";
import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages, PageHeader } from "@/components/ui";
import { bookSlot } from "@/lib/actions/patient";
import {
  NOTE_MAX_LENGTH,
  VISIT_REASONS,
  formatDay,
  formatTime,
} from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import { inputClass } from "@/constants";

export const metadata = { title: "Confirm your appointment" };

type SlotDetails = {
  slot_start: string;
  slot_end: string;
  doctor_name: string;
  department_name: string;
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    slot?: string;
    doctor?: string;
    date?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;

  // Treat everything in the URL as untrusted.
  const slotId = Number(params.slot);
  const validSlot = Number.isInteger(slotId) && slotId > 0;
  const doctor =
    params.doctor && /^\d+$/.test(params.doctor) ? params.doctor : "";
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "";
  const back = `/book?doctor=${doctor}&date=${date}`;

  let slot: SlotDetails | undefined;
  if (validSlot) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("open_slot_details", {
      p_slot_id: slotId,
    });
    slot = ((data ?? []) as SlotDetails[])[0];
  }

  // Listen only to this one slot. If it changes, this page re-checks it in place (no browser reload).
  const live = validSlot ? (
    <LiveRefresh table="slots" filter={`id=eq.${slotId}`} showStatus={false} />
  ) : null;

  if (!slot) {
    return (
      <>
        <PageHeader title="Slot not available" />
        <EmptyState>
          That slot was just taken or is no longer open.{" "}
          <Link href={back} className="font-semibold text-brand-700 underline">
            Back to the calendar
          </Link>
        </EmptyState>
        {live}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      {live}
      <Link href={back} className="text-sm text-muted hover:text-ink">
        Back to the calendar
      </Link>
      <div className="mt-4">
        <PageHeader title="Confirm your appointment" />
      </div>

      <Card className="mb-6 bg-brand-50">
        <p className="text-lg font-semibold">
          {formatDay(slot.slot_start)}, {formatTime(slot.slot_start)} to{" "}
          {formatTime(slot.slot_end)}
        </p>
        <p className="text-muted">
          {slot.doctor_name || "Doctor"}, {slot.department_name}
        </p>
      </Card>

      <Messages error={params.error} />

      <form action={bookSlot} className="space-y-6">
        <input type="hidden" name="slotId" value={slotId} />
        <input type="hidden" name="doctor" value={doctor} />
        <input type="hidden" name="date" value={date} />

        <fieldset>
          <legend className="font-semibold">Reason for the visit</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {Object.entries(VISIT_REASONS).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-brand-300 has-:checked:border-brand-600 has-:checked:bg-brand-50"
              >
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  required
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="font-medium">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="font-semibold">Short note (optional)</span>
          <textarea
            name="note"
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            className={`${inputClass} mt-2 block w-full`}
          />
          <span className="mt-1 block text-xs text-muted">
            Up to {NOTE_MAX_LENGTH} characters.
          </span>
        </label>

        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          This is a demo project. Please do not enter real medical information.
        </p>

        <div className="sticky bottom-0 -mx-5 border-t border-line bg-canvas/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <SubmitButton className="w-full" pendingLabel="Booking...">
            Confirm booking
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
