"use server";

import z from "zod";
import { requireRole } from "../auth";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { revalidatePath } from "next/cache";

const enc = encodeURIComponent;

export async function checkIn(formData: FormData) {
  await requireRole(["receptionist"]);

  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  const date = z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .safeParse(formData.get("date") ?? "");
  const back = `/reception${date.success && date.data ? `?date=${date.data}` : ""}`;
  const join = back.includes("?") ? "&" : "?";
  if (!id.success)
    redirect(`${back}${join}error=${enc("Invalid appointment.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("check_in", {
    p_appointment_id: id.data,
  });
  if (error)
    redirect(
      `${back}${join}error=${enc(error.code === "P0001" ? error.message : "Could not check the patient in.")}`,
    );

  revalidatePath("/reception");
  redirect(
    `${back}${join}notice=${enc("Patient checked in. The nurse can see them now.")}`,
  );
}
