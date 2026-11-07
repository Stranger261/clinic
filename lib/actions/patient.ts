"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { NOTE_MAX_LENGTH, VISIT_REASONS, type VisitReason } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";

const idInput = z.coerce.number().int().positive();

// Where the booking is happening (needed to send the patient back to the right calendar).
const whereInput = z.object({
  slotId: idInput,
  doctor: z.string().regex(/^\d*$/),
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

// What the patient typed on the confirmation step.
const detailInput = z.object({
  reason: z.enum(
    Object.keys(VISIT_REASONS) as [VisitReason, ...VisitReason[]],
    {
      message: "Please choose a reason for the visit.",
    },
  ),
  note: z
    .string()
    .trim()
    .max(
      NOTE_MAX_LENGTH,
      `Please keep the note under ${NOTE_MAX_LENGTH} characters.`,
    ),
});

const enc = encodeURIComponent;

export async function bookSlot(formData: FormData) {
  await requireRole(["patient"]);

  const where = whereInput.safeParse({
    slotId: formData.get("slotId"),
    doctor: formData.get("doctor") ?? "",
    date: formData.get("date") ?? "",
  });
  if (!where.success) redirect(`/book?error=${enc("Invalid request.")}`);

  const search = `doctor=${where.data.doctor}&date=${where.data.date}`;
  const confirmUrl = `/book/confirm?slot=${where.data.slotId}&${search}`;

  // A problem with what they typed: send them back to the confirmation step.
  const detail = detailInput.safeParse({
    reason: formData.get("reason"),
    note: formData.get("note") ?? "",
  });
  if (!detail.success)
    redirect(`${confirmUrl}&error=${enc(detail.error.issues[0].message)}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("book_slot", {
    p_slot_id: where.data.slotId,
    p_reason: detail.data.reason,
    p_note: detail.data.note || null,
  });

  // PR001 = the database says the profile is incomplete: finish it first, then return to this step.
  if (error?.code === "PR001") redirect(`/profile?next=${enc(confirmUrl)}`);

  if (error) {
    // P0001 = a rule we wrote (safe to show). 23505 = the one-confirmed-per-slot safety net.
    const message =
      error.code === "P0001"
        ? error.message
        : error.code === "23505"
          ? "Sorry, that slot is no longer available."
          : "Could not book the appointment.";
    redirect(`/book?${search}&error=${enc(message)}`);
  }

  revalidatePath("/appointments");
  redirect(`/appointments?notice=${enc("Your appointment is booked.")}`);
}

export async function cancelAppointment(formData: FormData) {
  await requireRole(["patient"]);

  const parsed = idInput.safeParse(formData.get("id"));
  if (!parsed.success)
    redirect(`/appointments?error=${enc("Invalid appointment.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_appointment", {
    p_appointment_id: parsed.data,
  });

  if (error) {
    const message =
      error.code === "P0001"
        ? error.message
        : "Could not cancel the appointment.";
    redirect(`/appointments?error=${enc(message)}`);
  }

  revalidatePath("/appointments");
  redirect(`/appointments?notice=${enc("Your appointment was cancelled.")}`);
}
