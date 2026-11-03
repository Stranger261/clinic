"use server";

import { redirect } from "next/navigation";
import z from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const departmentName = z
  .string()
  .min(2, "Department name must be at least 2 characters.")
  .max(60, "Department name must be 60 characters or fewer.");

const id = z.coerce.number().int().positive();

const assignSchema = z.object({
  profileId: z.string().uuid(),
  departmentId: id,
});

const fail = (path: string, message: string): never => {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
};

export const createDepartment = async (formData: FormData) => {
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
      error.code === "23503"
        ? "That department already exists."
        : "Could not add the department.",
    );
  }

  revalidatePath("/admin/departments");
  redirect("/admin/departments");
};

export const deleteDepartment = async (formData: FormData) => {
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
};

export const assignDoctor = async (formData: FormData) => {
  await requireRole(["admin"]);

  const parsed = assignSchema.safeParse({
    profileId: formData.get("profileId"),
    departmentId: formData.get("departmentId"),
  });

  if (!parsed.success)
    fail("/admin/doctors", "Choose a user and a department.");

  const supabase = createClient();
  const { error } = await (
    await supabase
  ).rpc("assign_doctor", {
    p_profile_id: parsed.data?.profileId,
    p_department_id: parsed.data?.departmentId,
  });

  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not add the doctor.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
};

export const removeDoctor = async (formData: FormData) => {
  await requireRole(["admin"]);

  const parsed = id.safeParse(formData.get("id"));
  if (!parsed.success) fail("/admin/doctors", "Invalid doctor.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_doctor", {
    p_profile_id: parsed.data,
  });

  if (error)
    fail(
      "/admin/doctors",
      error.code === "P0001" ? error.message : "Could not remove the doctor.",
    );

  revalidatePath("/admin/doctors");
  redirect("/admin/doctors");
};
