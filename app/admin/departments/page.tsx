import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages, PageHeader } from "@/components/ui";
import { inputClass } from "@/constants/ui";
import { createDepartment, deleteDepartment } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="These are the choices patients see when they search for a slot."
      />
      <Messages error={error} />

      <Card>
        <form
          action={createDepartment}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm font-medium">
            <span className="mb-1.5 block">New department</span>
            <input
              name="name"
              required
              placeholder="e.g. Cardiology"
              className={`${inputClass} w-64`}
            />
          </label>
          <SubmitButton pendingLabel="Adding...">Add department</SubmitButton>
        </form>
      </Card>

      <div className="mt-6">
        {(departments ?? []).length === 0 ? (
          <EmptyState>No departments yet. Add the first one above.</EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {(departments ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between p-4">
                <span className="font-medium">{d.name}</span>
                <form action={deleteDepartment}>
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton
                    variant="danger"
                    size="sm"
                    pendingLabel="Deleting..."
                  >
                    Delete
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
