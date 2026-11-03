import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages, PageHeader } from "@/components/ui";
import { inputClass } from "@/constants/ui";
import { assignDoctor, removeDoctor } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Doctors" };

type DoctorRow = {
  id: number;
  departments: { name: string } | null;
  profiles: { full_name: string; email: string | null } | null;
};

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: doctorData }, { data: patients }, { data: departments }] =
    await Promise.all([
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
    ]);

  const doctors = (doctorData ?? []) as unknown as DoctorRow[];
  const canAdd = (patients ?? []).length > 0 && (departments ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Doctors"
        subtitle="Turn a signed-up user into a doctor and assign a department."
      />
      <Messages error={error} />

      <Card>
        <h2 className="font-semibold">Add a doctor</h2>
        <p className="mt-1 text-sm text-muted">
          The person must sign in once first. Then they appear in this list.
        </p>
        {canAdd ? (
          <form action={assignDoctor} className="mt-4 flex flex-wrap gap-3">
            <select
              name="profileId"
              required
              aria-label="User"
              className={inputClass}
            >
              <option value="">Choose a user</option>
              {(patients ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || "No name"} ({p.email ?? "no email"})
                </option>
              ))}
            </select>
            <select
              name="departmentId"
              required
              aria-label="Department"
              className={inputClass}
            >
              <option value="">Choose a department</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <SubmitButton pendingLabel="Saving...">Make doctor</SubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">
            {(departments ?? []).length === 0
              ? "Add a department first."
              : "No signed-up users to promote yet. Ask the doctor to sign in first."}
          </p>
        )}
      </Card>

      <div className="mt-6">
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
      </div>
    </>
  );
}
