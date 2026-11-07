"use server";

import { PROFILE_FIELDS, ProfileState } from "@/constants";
import { requireRole } from "@/lib/auth";
import { profileSchema, safeNext } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const saveProfile = async (
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> => {
  await requireRole(["patient"]);

  const values = Object.fromEntries(
    PROFILE_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]),
  );
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_patient_profile", {
    p_full_name: parsed.data.fullName,
    p_date_of_birth: parsed.data.dateOfBirth,
    p_sex: parsed.data.sex,
    p_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_emergency_name: parsed.data.emergencyName,
    p_emergency_phone: parsed.data.emergencyPhone,
    p_allergies: parsed.data.allergies || null,
  });

  if (error)
    return {
      error:
        error.code === "P0001" ? error.message : "Could not save your profile.",
      values,
    };

  revalidatePath("/profile");
  revalidatePath("/book");

  redirect(safeNext(formData.get("next")) ?? "/profile?saved=1");
};
