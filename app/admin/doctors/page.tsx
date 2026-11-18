import AddStaffForm from "@/components/admin/add-staff-form";
import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages, PageHeader } from "@/components/ui";
import { inputClass } from "@/constants";
import { assignStaff, removeDoctor, removeStaff } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Doctors" };

type DoctorRow = {
  id: number;
  departments: { name: string } | null;
  profiles: { full_name: string; email: string | null } | null;
};
type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
};
const ROLE_LABELS: Record<string, string> = {
  nurse: "Nurse",
  receptionist: "Receptionist",
};

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [
    { data: doctorData },
    { data: patients },
    { data: departments },
    { data: staffData },
  ] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, departments(name), profiles(full_name, email)")
      .order("id"),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "patient")
      .order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", ["nurse", "receptionist"])
      .order("role")
      .order("full_name"),
  ]);

  const doctors = (doctorData ?? []) as unknown as DoctorRow[];
  const staff = (staffData ?? []) as StaffRow[];
  const canAdd = (patients ?? []).length > 0 && (departments ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Give signed-up users a staff role. They sign in as usual and land on their own screen."
      />
      <Messages error={error} />

      <Card>
        <h2 className="font-semibold">Add a staff member</h2>
        <p className="mt-1 text-sm text-muted">
          The person must sign in once first. Then they appear in this list.
        </p>
        {canAdd ? (
          <AddStaffForm
            patients={patients ?? []}
            departments={departments ?? []}
          />
        ) : (
          <p className="mt-4 text-sm text-muted">
            No signed-up users to give a role to yet. Ask the person to sign in
            first.
          </p>
        )}
      </Card>

      <h2 className="mb-3 mt-8 font-semibold">Doctors</h2>
      {doctors.length === 0 ? (
        <EmptyState>No doctors yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {doctors.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-semibold">
                  {d.profiles?.full_name || "No name"}
                </p>
                <p className="text-sm text-muted">
                  {d.departments?.name} ({d.profiles?.email ?? "no email"})
                </p>
              </div>
              <form action={removeDoctor}>
                <input type="hidden" name="id" value={d.id} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  pendingLabel="Removing..."
                >
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Nurses and receptionists</h2>
      {staff.length === 0 ? (
        <EmptyState>No nurses or receptionists yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {staff.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-semibold">{p.full_name || "No name"}</p>
                <p className="text-sm text-muted">
                  {ROLE_LABELS[p.role] ?? p.role} ({p.email ?? "no email"})
                </p>
              </div>
              <form action={removeStaff}>
                <input type="hidden" name="profileId" value={p.id} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  pendingLabel="Removing..."
                >
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
