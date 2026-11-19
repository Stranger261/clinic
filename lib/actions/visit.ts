"use server";

import { redirect } from "next/navigation";
import z from "zod";
import { requireRole } from "../auth";
import { createClient } from "../supabase/server";
import { safe } from "@/utils/safe";
import { revalidatePath } from "next/cache";

const id = z.coerce.number().int().positive();
const enc = encodeURIComponent;
const go = (kind: "error" | "notice", message: string) =>
  redirect(`/doctor/queue?${kind}=${enc(message)}`);

export async function skipVitals(formData: FormData) {
  await requireRole(["doctor"]);

  const visitId = id.safeParse(formData.get("id"));
  const reason = z
    .string()
    .trim()
    .min(5, "Please give a reason (at least 5 characters).")
    .max(300, "Please keep the reason under 300 characters.")
    .safeParse(formData.get("reason") ?? "");
  if (!visitId.success) go("error", "Invalid visit.");
  if (!reason.success) go("error", reason.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_vitals", {
    p_visit_id: visitId.data,
    p_reason: reason.data,
  });
  if (error) go("error", safe(error, "Could not save that."));

  revalidatePath("/doctor/queue");
  go(
    "notice",
    "Going ahead without vitals. Your reason was saved with the visit.",
  );
}

export async function startConsultation(formData: FormData) {
  await requireRole(["doctor"]);

  const visitId = id.safeParse(formData.get("id"));
  if (!visitId.success) go("error", "Invalid visit.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_consultation", {
    p_visit_id: visitId.data,
  });
  if (error) go("error", safe(error, "Could not start the consultation"));

  revalidatePath("/doctor/queue");
  go("notice", "Consultation started.");
}

export async function completeVisit(formData: FormData) {
  await requireRole(["doctor"]);

  const visitId = id.safeParse(formData.get("id"));
  if (!visitId.success) go("error", "Invalid visit.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_visit", {
    p_visit_id: visitId.data,
  });
  if (error) go("error", safe(error, "Could not complete the consultation"));

  revalidatePath("/doctor/queue");
  revalidatePath("/");
  go("notice", "Visit completed.");
}
