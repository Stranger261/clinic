import Link from "next/link";
import { notFound } from "next/navigation";
import SubmitButton from "@/components/submit-button";
import { EmptyState, Messages, PageHeader } from "@/components/ui";
import { requestReschedule } from "@/lib/actions/reschedule";
import { formatDay, formatTime } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import { inputClass } from "@/constants/ui";

export const metadata = { title: "Request a reschedule" };

type Option = { slot_id: number; slot_start: string; slot_end: string };

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("open_slots_for_reschedule", {
    p_appointment_id: appointmentId,
  });
  const options = (data ?? []) as Option[];

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/appointments" className="text-sm text-muted hover:text-ink">
        Back to my appointments
      </Link>
      <div className="mt-4">
        <PageHeader
          title="Request an emergency reschedule"
          subtitle="Choose a new time with the same doctor and explain the emergency. The slot is held while a doctor or admin reviews it, and your current appointment stays booked until it is approved."
        />
      </div>
      <Messages error={error} />

      {options.length === 0 ? (
        <EmptyState>
          There are no other open slots with this doctor right now, or this
          appointment cannot be rescheduled.
        </EmptyState>
      ) : (
        <form action={requestReschedule} className="space-y-6">
          <input type="hidden" name="appointmentId" value={appointmentId} />

          <fieldset>
            <legend className="font-semibold">New time</legend>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {options.map((o) => (
                <li key={o.slot_id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface p-3.5 transition hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input
                      type="radio"
                      name="newSlotId"
                      value={o.slot_id}
                      required
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className="text-sm font-medium">
                      {formatDay(o.slot_start)}, {formatTime(o.slot_start)} to{" "}
                      {formatTime(o.slot_end)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="block">
            <span className="font-semibold">What is the emergency?</span>
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={4}
              className={`${inputClass} mt-2 block w-full`}
            />
          </label>

          <div className="sticky bottom-0 -mx-5 border-t border-line bg-canvas/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <SubmitButton className="w-full" pendingLabel="Sending...">
              Send request
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
