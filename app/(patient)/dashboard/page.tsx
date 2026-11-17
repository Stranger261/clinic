import Link from "next/link";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { formatDay, formatTime, nowIso, reasonLabel } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import {
  Appointment,
  buttonClass,
  liftClass,
  patientNumber,
  ProfileRow,
  quickActions,
} from "@/constants";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const me = await getProfile();
  const supabase = await createClient();

  const [
    { data: apptData },
    { data: profData },
    { data: complete },
    { data: emailRow },
  ] = await Promise.all([
    supabase.rpc("my_appointments"),
    supabase.rpc("get_my_patient_profile"),
    supabase.rpc("patient_profile_complete"),
    supabase
      .from("profiles")
      .select("email")
      .eq("id", me?.id ?? "")
      .single(),
  ]);

  const appointments = (apptData ?? []) as Appointment[];
  const profile = ((profData ?? []) as ProfileRow[])[0];
  const email = (emailRow as { email: string | null } | null)?.email;

  const now = Date.parse(nowIso());
  const upcoming = appointments
    .filter(
      (a) =>
        a.status === "confirmed" && !a.outcome && Date.parse(a.slot_end) >= now,
    )
    .sort((a, b) => Date.parse(a.slot_start) - Date.parse(b.slot_start));
  const next = upcoming[0];
  const pastVisits = appointments.filter(
    (a) => a.outcome === "completed",
  ).length;
  const firstName =
    (profile?.full_name ?? me?.full_name ?? "").trim().split(" ")[0] || "there";

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-linear-to-r from-brand-600 to-brand-800 p-6 text-white shadow-md sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-brand-100">
          Manage your health and upcoming appointments.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2 text-sm">
          {profile?.patient_no != null && (
            <li className="rounded-full bg-white/15 px-3 py-1.5">
              Patient no. {patientNumber(profile.patient_no)}
            </li>
          )}
          {profile?.phone && (
            <li className="rounded-full bg-white/15 px-3 py-1.5">
              {profile.phone}
            </li>
          )}
          {email && (
            <li className="rounded-full bg-white/15 px-3 py-1.5">{email}</li>
          )}
        </ul>
      </section>

      {complete !== true && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"
        >
          <span>
            Your profile is not complete yet. We need your details before you
            can book.
          </span>
          <Link href="/profile" className={buttonClass("secondary", "sm")}>
            Complete profile
          </Link>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card lift>
          <p className="text-sm text-muted">Upcoming appointments</p>
          <p className="mt-2 text-3xl font-semibold">{upcoming.length}</p>
          <p className="mt-1 text-sm text-muted">
            {next
              ? `Next: ${formatDay(next.slot_start)}, ${formatTime(next.slot_start)}`
              : "Nothing booked yet"}
          </p>
        </Card>
        <Card lift>
          <p className="text-sm text-muted">Past visits</p>
          <p className="mt-2 text-3xl font-semibold">{pastVisits}</p>
          <p className="mt-1 text-sm text-muted">Completed with a doctor</p>
        </Card>
        <Card lift>
          <p className="text-sm text-muted">Profile</p>
          <p className="mt-2 text-3xl font-semibold">
            {complete === true ? "Complete" : "Incomplete"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {complete === true
              ? "Your details are on file"
              : "Add your details to book"}
          </p>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Upcoming appointments</h2>
              <p className="text-sm text-muted">Your scheduled visits</p>
            </div>
            <Link
              href="/appointments"
              className="text-sm font-semibold text-brand-700 underline"
            >
              View all
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState>
              No appointments found.{" "}
              <Link
                href="/book"
                className="font-semibold text-brand-700 underline"
              >
                Book one now
              </Link>
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 3).map((a) => (
                <li
                  key={a.appointment_id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm ${liftClass}`}
                >
                  <div>
                    <p className="font-semibold">
                      {formatDay(a.slot_start)}, {formatTime(a.slot_start)}
                    </p>
                    <p className="text-sm text-muted">
                      {a.doctor_name || "Doctor"}, {a.department_name}
                    </p>
                    <p className="text-sm text-muted">
                      Reason: {reasonLabel(a.visit_reason)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="text-sm text-muted">Common tasks</p>
          </div>
          <ul className="grid gap-3">
            {quickActions.map((q) => (
              <li key={q.href}>
                <Link href={q.href} className="block">
                  <Card lift className="p-4">
                    <p className="font-semibold">{q.title}</p>
                    <p className="text-sm text-muted">{q.text}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
