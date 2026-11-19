"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "../auth";
import { createClient } from "../supabase/server";
import { VITAL_FIELDS, vitalsSchema } from "../vitals";

export type VitalsState = {
  error?: string;
  saved?: boolean;
  values?: Record<string, string>;
};

export async function recordVitals(
  _previous: VitalsState,
  formData: FormData,
): Promise<VitalsState> {
  await requireRole(["nurse"]);

  const values = Object.fromEntries(
    VITAL_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]),
  );
  const parsed = vitalsSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_vitals", {
    p_visit_id: v.visitId,
    p_systolic: v.systolic,
    p_diastolic: v.diastolic,
    p_pulse: v.pulse,
    p_temperature: v.temperature,
    p_resp_rate: v.respRate,
    p_spo2: v.spo2,
    p_weight: v.weight,
    p_height: v.height,
    p_pain: v.pain,
  });
  if (error)
    return {
      error:
        error.code === "P0001" ? error.message : "Could not save the vitals.",
      values,
    };

  revalidatePath("/nurse");
  return { saved: true };
}
