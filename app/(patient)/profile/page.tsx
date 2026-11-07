import ProfileForm from "@/components/profile/profile-form";
import { Messages, PageHeader } from "@/components/ui";
import { dayKey, nowIso } from "@/lib/clinic";
import { safeNext } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My profile" };

type Row = {
  full_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  phone: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  allergies: string | null;
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const supabase = await createClient();
  const [{ data }, { data: complete }] = await Promise.all([
    supabase.rpc("get_my_patient_profile"),
    supabase.rpc("patient_profile_complete"),
  ]);
  const row = ((data ?? []) as Row[])[0];

  const initial = {
    fullName: row?.full_name ?? "",
    dateOfBirth: row?.date_of_birth ?? "",
    sex: row?.sex ?? "",
    phone: row?.phone ?? "",
    address: row?.address ?? "",
    emergencyName: row?.emergency_name ?? "",
    emergencyPhone: row?.emergency_phone ?? "",
    allergies: row?.allergies ?? "",
  };

  const needsToFinish = next !== null && complete !== true;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={needsToFinish ? "Complete your profile to book" : "My profile"}
        subtitle={
          needsToFinish
            ? "We need a few details before your first appointment. It only takes a minute."
            : "Keep your details up to date so the clinic can reach you."
        }
      />
      <Messages notice={params.saved ? "Your profile was saved." : undefined} />
      <ProfileForm initial={initial} next={next} today={dayKey(nowIso())} />
    </div>
  );
}
