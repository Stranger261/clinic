import MonthNav from "@/components/calendar/month-nav";
import PatientCalendar from "@/components/calendar/patient-calendar";
import { Card, EmptyState, Messages, PageHeader } from "@/components/ui";
import { buttonClass, inputClass } from "@/constants";
import {
  daysInMonth,
  firstOfMonth,
  isDateKey,
  resolveMonth,
} from "@/lib/calendar";
import { CLINIC_TIME_ZONE, dayKey, nowIso } from "@/lib/clinic";
import { type CalSlot, dayStats } from "@/lib/slots-state";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Book an appointment" };

type DoctorRow = {
  doctor_id: number;
  doctor_name: string;
  department_id: number;
  department_name: string;
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    doctor?: string;
    month?: string;
    date?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  // The URL is untrusted: resolveMonth keeps the month in a safe range, and an unknown doctor falls back to the first.
  const { month, min, max } = resolveMonth(params.month, params.date);

  const supabase = await createClient();
  const { data: doctorData } = await supabase.rpc("list_doctors");
  const doctors = (doctorData ?? []) as DoctorRow[];
  const doctor =
    doctors.find((d) => d.doctor_id === Number(params.doctor)) ?? doctors[0];

  if (!doctor) {
    return (
      <>
        <PageHeader title="Book an appointment" />
        <EmptyState>
          No doctors are available yet. Please check back soon.
        </EmptyState>
      </>
    );
  }

  const { data: slotData } = await supabase.rpc("calendar_slots", {
    p_doctor_id: doctor.doctor_id,
    p_from: firstOfMonth(month),
    p_days: daysInMonth(month),
  });
  const slots = (slotData ?? []) as CalSlot[];

  // Which day to show first: the one in the URL, else the first day that still has an open time.
  const today = dayKey(nowIso());
  const stats = dayStats(slots);
  const requested =
    isDateKey(params.date) &&
    params.date.startsWith(month) &&
    params.date >= today
      ? params.date
      : null;
  const firstOpen = [...stats.entries()]
    .filter(([, v]) => v.open > 0)
    .map(([d]) => d)
    .sort()[0];
  const defaultDate =
    requested ??
    firstOpen ??
    (today.startsWith(month) ? today : firstOfMonth(month));

  const byDepartment = new Map<string, DoctorRow[]>();
  for (const d of doctors)
    byDepartment.set(d.department_name, [
      ...(byDepartment.get(d.department_name) ?? []),
      d,
    ]);

  return (
    <>
      <PageHeader
        title="Book an appointment"
        subtitle="Choose a doctor, pick a day, then pick a time."
      />
      <Messages error={params.error} />

      <Card>
        {/* A GET form: the choices go in the URL, and this page reads them. */}
        <form method="get" className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="month" value={month} />
          <label className="text-sm font-medium">
            <span className="mb-1.5 block">Doctor</span>
            <select
              name="doctor"
              defaultValue={doctor.doctor_id}
              className={inputClass}
            >
              {[...byDepartment.entries()].map(([department, list]) => (
                <optgroup key={department} label={department}>
                  {list.map((d) => (
                    <option key={d.doctor_id} value={d.doctor_id}>
                      {d.doctor_name || "Doctor"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button className={buttonClass()}>Show calendar</button>
        </form>
      </Card>

      <div className="mb-3 mt-6">
        <MonthNav
          basePath="/book"
          extra={{ doctor: String(doctor.doctor_id) }}
          month={month}
          minMonth={min}
          maxMonth={max}
        />
        <p className="mt-1 text-xs text-muted">
          {doctor.doctor_name || "Doctor"}, {doctor.department_name}. All times
          are clinic time ({CLINIC_TIME_ZONE}).
        </p>
      </div>

      {/* The key makes a new doctor or month start fresh; changes inside the month update live. */}
      <PatientCalendar
        key={`${doctor.doctor_id}-${month}`}
        doctorId={doctor.doctor_id}
        month={month}
        initialSlots={slots}
        defaultDate={defaultDate}
        today={today}
      />
    </>
  );
}
