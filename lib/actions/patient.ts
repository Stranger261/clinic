"use server";

import z from "zod";
import { NOTE_MAX_LENGTH, VISIT_REASONS, VisitReason } from "../clinic";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const idInput = z.coerce.number().int().positive();

const whereInput = z.object({
  slotId: idInput,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  department: z.string().regex(/^\d*$/),
});

const detailInput = z.object({
  reason: z.enum(
    Object.keys(VISIT_REASONS) as [VisitReason, ...VisitReason[]],
    { message: "Please choose a reason for the visit." },
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

export const bookSlot = async (formData: FormData) => {
  await requireRole(["patient"]);

  const where = whereInput.safeParse({
    slotId: formData.get("slotId"),
    date: formData.get("date"),
    department: formData.get("department") ?? "",
  });

  if (!where.success) redirect(`/book?error=${enc("Invalid request.")}`);

  const search = `date=${where.data.date}&department=${where.data.department}`;
  const confirmUrl = `/book/confirm?slot=${where.data.slotId}&${search}`;

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

  if (error) {
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
};

export const cancelAppointment = async (formData: FormData) => {
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
};
