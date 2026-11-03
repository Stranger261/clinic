import {
  ButtonLink,
  Card,
  EmptyState,
  Messages,
  PageHeader,
} from "@/components/ui";
import { buttonClass, inputClass } from "@/constants/ui";
import { dayKey, formatDateOnly, formatTime, nowIso } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Book an appointment" };

type OpenSlot = {
  slot_id: number;
  slot_start: string;
  slot_end: string;
  doctor_id: number;
  doctor_name: string;
  department_id: number;
  department_name: string;
};

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; department?: string; error?: string }>;
}) {
  const params = await searchParams;

  // The filters live in the URL, so they are shareable and the back button works.
  // Never trust them: fall back to safe defaults when they look wrong.
  const today = dayKey(nowIso());
  const date =
    params.date && dateRe.test(params.date) && params.date >= today
      ? params.date
      : today;
  const deptNumber = Number(params.department);
  const department =
    Number.isInteger(deptNumber) && deptNumber > 0 ? deptNumber : null;

  const supabase = await createClient();
  const [{ data: departments }, { data: slotData }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.rpc("search_open_slots", {
      p_date: date,
      p_department_id: department,
    }),
  ]);
  const slots = (slotData ?? []) as OpenSlot[];

  return (
    <>
      <PageHeader
        title="Book an appointment"
        subtitle="Pick a day and a department to see every open time."
      />
      <Messages error={params.error} />

      {/* A GET form: submitting it puts the choices in the URL, and this page reads them. */}
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">
            <span className="mb-1.5 block">Date</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              min={today}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            <span className="mb-1.5 block">Department</span>
            <select
              name="department"
              defaultValue={department ?? ""}
              className={inputClass}
            >
              <option value="">All departments</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonClass()}>Show open slots</button>
        </form>
      </Card>

      <h2 className="mb-3 mt-8 font-semibold">{formatDateOnly(date)}</h2>
      {slots.length === 0 ? (
        <EmptyState>
          No open slots for this date. Try another date or department.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {slots.map((s) => (
            <li
              key={s.slot_id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold">
                  {formatTime(s.slot_start)} to {formatTime(s.slot_end)}
                </p>
                <p className="text-sm text-muted">
                  {s.doctor_name || "Doctor"}, {s.department_name}
                </p>
              </div>
              <ButtonLink
                href={`/book/confirm?slot=${s.slot_id}&date=${date}&department=${department ?? ""}`}
                size="sm"
              >
                Book
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
