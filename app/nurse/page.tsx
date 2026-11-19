import AutoRefresh from "@/components/auto-refresh";
import { EmptyState, Notice, PageHeader, StatusBadge } from "@/components/ui";
import VitalsForm from "@/components/vitals/vital-form";
import { Sex, SEX_OPTIONS } from "@/constants";
import { formatTime, reasonLabel } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Waiting for vitals" };

type Row = {
  visit_id: number;
  slot_start: string;
  doctor_name: string;
  patient_name: string;
  patient_no: number | null;
  patient_age: number | null;
  patient_sex: string | null;
  allergies: string | null;
  visit_reason: string | null;
  visit_note: string | null;
  checked_in_at: string;
  stage: "checked_in" | "ready";
  vitals_recorded_at: string | null;
};

export default async function NursePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("nurse_queue");
  const queue = (data ?? []) as Row[];

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Waiting for vitals"
        subtitle="Patients who have arrived and are waiting for you. The list updates by itself."
      />

      <div className="mb-6">
        <Notice kind="info">
          Recording vitals comes in the next step. For now you can see who is
          waiting and their triage details.
        </Notice>
      </div>

      {queue.length === 0 ? (
        <EmptyState>No one is waiting right now.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {queue.map((r) => {
            const hasAllergy =
              Boolean(r.allergies) && !/^none/i.test(r.allergies ?? "");
            const sent = r.stage === "ready";
            return (
              <li
                key={r.visit_id}
                className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {r.patient_name || "Patient"}
                      <span className="font-normal text-muted">
                        {r.patient_no !== null
                          ? ` · P-${String(r.patient_no).padStart(6, "0")}`
                          : ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted">
                      {r.patient_age !== null
                        ? `${r.patient_age} years`
                        : "Age unknown"}
                      {r.patient_sex
                        ? `, ${SEX_OPTIONS[r.patient_sex as Sex] ?? r.patient_sex}`
                        : ""}{" "}
                      · sees {r.doctor_name || "the doctor"} at{" "}
                      {formatTime(r.slot_start)}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={r.stage} />
                    <p className="mt-1 text-xs text-muted">
                      Arrived {formatTime(r.checked_in_at)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Reason: {reasonLabel(r.visit_reason)}
                  {r.visit_note ? ` (${r.visit_note})` : ""}
                </p>
                <p
                  className={`mt-1 text-sm ${hasAllergy ? "font-semibold text-amber-800" : "text-muted"}`}
                >
                  Allergies: {r.allergies || "None listed"}
                </p>

                <div className="mt-4 border-t border-line pt-4">
                  {sent ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-brand-700 underline">
                        Sent to the doctor
                        {r.vitals_recorded_at
                          ? ` at ${formatTime(r.vitals_recorded_at)}`
                          : ""}
                        . Record corrected vitals
                      </summary>
                      <div className="mt-4">
                        <VitalsForm visitId={r.visit_id} corrected />
                      </div>
                    </details>
                  ) : (
                    <VitalsForm visitId={r.visit_id} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
