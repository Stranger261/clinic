"use server";

import { redirect } from "next/navigation";
import z from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const slotSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time."),
  })
  .refine((v) => !Number.isNaN(Date.parse(`${v.date}T${v.time}:00`)), {
    message: "That date or time is not valid.",
  });

const id = z.coerce.number().int().positive();

const go = (kind: "error" | "notice", message: string) => {
  redirect(`/doctor?${kind}=${encodeURIComponent(message)}`);
};

export const addSlot = async (formData: FormData) => {
  await requireRole(["doctor"]);

  const parsed = slotSchema.safeParse({
    date: formData.get("date"),
    time: formData.get("time"),
  });

  if (!parsed.success) go("error", parsed.error.issues[0].message);

  const supabase = createClient();
  const { error } = await (
    await supabase
  ).rpc("add_slot", {
    p_local_start: `${parsed.data?.date}T${parsed.data?.time}:00`,
  });

  if (error) {
    if (error.code === "P0001") go("error", error.message);
    if (error.code === "23P01") go("error", "That time overlaps another slot.");
    go("error", "Could not add the slot.");
  }

  revalidatePath("/doctor");
  redirect("/doctor");
};

export const deleteSlot = async (formData: FormData) => {
  await requireRole(["doctor"]);

  const parsed = id.safeParse(formData.get("id"));
  if (!parsed.success) go("error", "Invalid slot.");

  const supabase = createClient();
  const { error } = await (await supabase)
    .from("slots")
    .delete()
    .eq("id", parsed.data);

  if (error) go("error", "Could not delete the slot.");

  revalidatePath("/doctor");
  redirect("/doctor");
};

export const extendSlot = async (formData: FormData) => {
  await requireRole(["doctor"]);

  const parsed = id.safeParse(formData.get("id"));
  if (!parsed.success) go("error", "Invalid Slot.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("extend_slot", {
    p_slot_id: parsed.data,
  });

  if (error) {
    go(
      "error",
      error.code === "P0001" ? error.message : "Could not extend the visit.",
    );
  }

  revalidatePath("/doctor");
  go("notice", "The next slot was taken over for this visit.");
};
