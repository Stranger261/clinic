"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  DEMO_EMAILS,
  DEMO_HOME,
  DEMO_ROLES,
  demoEnabled,
  demoPassword,
} from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export async function signInAsDemo(formData: FormData) {
  if (!demoEnabled()) redirect("/login");

  const role = z.enum(DEMO_ROLES).safeParse(formData.get("role"));
  if (!role.success) redirect("/login?error=demo");

  const password = demoPassword(role.data);
  if (!password) redirect("/login?error=demo");

  console.log(DEMO_EMAILS[role.data], password);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAILS[role.data],
    password,
  });
  console.log(error);
  if (error) redirect("/login?error=demo");
  console.log("here?");

  redirect(DEMO_HOME[role.data]);
}
