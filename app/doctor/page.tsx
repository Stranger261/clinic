import DoctorCalendar from "@/components/calendar/doctor-calendar";
import MonthNav from "@/components/calendar/month-nav";
import { EmptyState, Messages, PageHeader } from "@/components/ui";
import { firstOfMonth, lastOfMonth, resolveMonth } from "@/lib/calendar";
import { dayKey, nowIso } from "@/lib/clinic";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DoctorSlot } from "@/constants/calendar";

export const metadata = { title: "My schedule" };

export default async function DoctorHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; month?: string }>;
}) {
  const { error, notice, month: monthParam } = await searchParams;
  // The doctor can look back one month, to close recent visits.
  const { month, min, max, current } = resolveMonth(monthParam, undefined, 1);

  const profile = await getProfile();
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("doctors")
    .select("id")
    .eq("profile_id", profile?.id ?? "")
    .single();

  if (!me) {
    return (
      <>
        <PageHeader title="My schedule" />
        <EmptyState>
          Your doctor profile is not set up yet. Ask an admin to add you as a
          doctor.
        </EmptyState>
      </>
    );
  }

  // One query returns each upcoming slot with its patient and reason (see 008 and 009 in supabase/).
  const { data } = await supabase.rpc("my_schedule");
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const slots = ((data ?? []) as DoctorSlot[]).filter((s) => {
    const d = dayKey(s.slot_start);
    return d >= first && d <= last;
  });

  const today = dayKey(nowIso());
  const defaultDate = today.startsWith(month) ? today : first;

  return (
    <>
      <PageHeader
        title="My schedule"
        subtitle="Pick a day to add slots, see who booked, and record how visits went. It updates live."
      />
      <Messages error={error} notice={notice} />

      <div className="mb-3">
        <MonthNav
          basePath="/doctor"
          month={month}
          minMonth={min}
          maxMonth={max}
          currentMonth={current}
        />
      </div>

      <DoctorCalendar
        key={month}
        doctorId={me.id as number}
        month={month}
        initialSlots={slots}
        defaultDate={defaultDate}
        today={today}
      />
    </>
  );
}
