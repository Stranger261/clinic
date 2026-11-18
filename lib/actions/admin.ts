"use server";

import { redirect } from "next/navigation";
import z from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const departmentName = z
  .string()
  .trim()
  .min(2, "Department name must be at least 2 characters.")
  .max(60, "Department name must be 60 characters or fewer.");

const id = z.coerce.number().int().positive();

const assignSchema = z.object({
  profileId: z.string().uuid(),
  departmentId: id,
});

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createDepartment(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = departmentName.safeParse(formData.get("name"));
  if (!parsed.success)
    fail("/admin/departments", parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .insert({ name: parsed.data });
  if (error) {
    fail(
      "/admin/departments",
      error.code === "23505"
        ? "That department already exists."
        : "Could not add the department.",
    );
  }

  revalidatePath("/admin/departments");
  redirect("/admin/departments");
}

export async function deleteDepartment(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = id.safeParse(formData.get("id"));
  if (!parsed.success) fail("/admin/departments", "Invalid department.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", parsed.data);
  if (error) {
    fail(
      "/admin/departments",
      error.code === "23503"
        ? "Remove this department's doctors first."
        : "Could not delete the department.",
    );
  }

  revalidatePath("/admin/departments");
  redirect("/admin/departments");
}

export async function assignDoctor(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = assignSchema.safeParse({
    profileId: formData.get("profileId"),
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success)
    fail("/admin/doctors", "Choose a user and a department.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_doctor", {
    p_profile_id: parsed.data.profileId,
    p_department_id: parsed.data.departmentId,
  });
  // P0001 = an error we raised ourselves, so the message is safe to show.
  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not add the doctor.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
}

export async function removeDoctor(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = id.safeParse(formData.get("id"));
  if (!parsed.success) fail("/admin/doctors", "Invalid doctor.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_doctor", {
    p_doctor_id: parsed.data,
  });
  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not remove the doctor.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
}

const staffSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["doctor", "nurse", "receptionist"]),
  departmentId: z.string().regex(/^\d*$/),
});

export async function assignStaff(formData: FormData) {
  await requireRole(["admin"]);

  const parsed = staffSchema.safeParse({
    profileId: formData.get("profileId"),
    role: formData.get("role"),
    departmentId: formData.get("departmentId") ?? "",
  });
  if (!parsed.success) fail("/admin/doctors", "Choose a user and a role.");

  if (parsed.data.role === "doctor" && !parsed.data.departmentId)
    fail("/admin/doctors", "Choose a department for a doctor.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_staff_role", {
    p_profile_id: parsed.data.profileId,
    p_role: parsed.data.role,
    p_department_id: parsed.data.departmentId
      ? Number(parsed.data.departmentId)
      : null,
  });
  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not save the role.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
}

export async function removeStaff(formData: FormData) {
  await requireRole(["admin"]);

  const profileId = z.uuid().safeParse(formData.get("profileId"));
  if (!profileId.success) fail("/admin/doctors", "Invalid person.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_staff_role", {
    p_profile_id: profileId.data,
  });
  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not remove the role.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
}
