"use server";

import z from "zod";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const id = z.coerce.number().int().positive();

const requestSchema = z.object({
  newSlotId: z.coerce.number().int().positive("Please choose a new time."),
  reason: z
    .string()
    .trim()
    .min(10, "Please describe the emergency in at least 10 characters.")
    .max(500, "Please keep the reason under 500 characters."),
});

const returnTo = z.enum(["/doctor/requests", "/admin/requests"]);
const note = z.string().trim().max(300);

const enc = encodeURIComponent;

const safe = (error: { code?: string; message: string }, fallback: string) =>
  error.code === "P0001" ? error.message : fallback;

export const requestReschedule = async (formData: FormData) => {
  await requireRole(["patient"]);

  const appointmentId = id.safeParse(formData.get("appointmentId"));

  if (!appointmentId.success)
    redirect(`/appointments?error=${enc("Invalid appointment.")}`);
  const back = `/appointments/${appointmentId.data}/reschedule`;

  const parsed = requestSchema.safeParse({
    newSlotId: formData.get("newSlotId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    redirect(`${back}?error=${enc(parsed.error.issues[0].message)}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_reschedule", {
    p_appointment_id: appointmentId.data,
    p_new_slot_id: parsed.data.newSlotId,
    p_reason: parsed.data.reason,
  });

  if (error)
    redirect(
      `${back}?error=${enc(safe(error, "Could not send the request."))}`,
    );

  revalidatePath("/appointments");
  redirect(
    `/appointments?notice=${enc("Your request was sent. The slot is held while staff review it.")}`,
  );
};

export const withdrawReschedule = async (formData: FormData) => {
  await requireRole(["patient"]);

  const requestId = id.safeParse(formData.get("requestId"));
  if (!requestId.success)
    redirect(`/appointments?error=${enc("Invalid request.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_reschedule", {
    p_request_id: requestId.data,
  });

  if (error)
    redirect(
      `/appointments?error=${enc(safe(error, "Could not withdraw the request."))}`,
    );

  revalidatePath("/appointments");
  redirect(`/appointments?notice=${enc("Your request was withdrawn.")}`);
};

export const approveReschedule = async (formData: FormData) => {
  await requireRole(["doctor", "admin"]);

  const back = returnTo.safeParse(formData.get("returnTo"));
  const path = back.success ? back.data : "/doctor/requests";
  const requestId = id.safeParse(formData.get("requestId"));
  if (!requestId.success) redirect(`${path}?error=${enc("Invalid request.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_reschedule", {
    p_request_id: requestId.data,
  });
  if (error)
    redirect(
      `${path}?error=${enc(safe(error, "Could not approve the request."))}`,
    );

  revalidatePath(path);
  redirect(
    `${path}?notice=${enc("Request approved. The appointment was moved.")}`,
  );
};

export const denyReschedule = async (formData: FormData) => {
  await requireRole(["doctor", "admin"]);

  const back = returnTo.safeParse(formData.get("returnTo"));
  const path = back.success ? back.data : "/doctor/requests";
  const requestId = id.safeParse(formData.get("requestId"));
  const noteParsed = note.safeParse(formData.get("note") ?? "");

  if (!requestId.success) redirect(`${path}?error=${enc("Invalid request.")}`);
  if (!noteParsed.success)
    redirect(
      `${path}?error=${enc("Please keep the note under 300 characters.")}`,
    );

  const supabase = await createClient();
  const { error } = await supabase.rpc("deny_reschedule", {
    p_request_id: requestId.data,
    p_note: noteParsed.data,
  });
  if (error)
    redirect(
      `${path}?error=${enc(safe(error, "Could not deny the request."))}`,
    );

  revalidatePath(path);
  redirect(
    `${path}?notice=${enc("Request denied. The held slot is open again.")}`,
  );
};
