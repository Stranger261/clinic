import AutoRefresh from "@/components/auto-refresh";
import SubmitButton from "@/components/submit-button";
import VitalsSummary from "@/components/vitals/vital-summary";
import { EmptyState, Messages, PageHeader, StatusBadge } from "@/components/ui";
import {
  completeVisit,
  skipVitals,
  startConsultation,
} from "@/lib/actions/visit";
import { formatTime, reasonLabel } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";
import { inputClass, Sex, SEX_OPTIONS } from "@/constants";

export const metadata = { title: "Patients today" };

type Row = {
  visit_id: number;
  slot_start: string;
  slot_end: string;
  stage: "checked_in" | "ready" | "in_consultation";
  patient_name: string;
  patient_no: number | null;
  patient_age: number | null;
  patient_sex: string | null;
  patient_phone: string | null;
  allergies: string | null;
  visit_reason: string | null;
  visit_note: string | null;
  checked_in_at: string;
  skipped_reason: string | null;
  vitals_recorded_at: string | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperature_c: number | null;
  resp_rate: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  pain_score: number | null;
};

const TITLES: Record<Row["stage"], string> = {
  in_consultation: "In consultation",
  ready: "Ready for you",
  checked_in: "Waiting for vitals",
};

export default async function DoctorQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("doctor_queue");
  const queue = (data ?? []) as Row[];

  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Patients today"
        subtitle="Patients who have arrived. A visit needs vitals, or your reason for going without them. The list updates by itself."
      />
      <Messages error={error} notice={notice} />

      {queue.length === 0 ? (
        <EmptyState>No patients have arrived yet.</EmptyState>
      ) : (
        (["in_consultation", "ready", "checked_in"] as const).map((stage) => {
          const rows = queue.filter((r) => r.stage === stage);
          if (rows.length === 0) return null;
          return (
            <section key={stage} className="mb-8">
              <h2 className="mb-3 font-semibold">
                {TITLES[stage]}{" "}
                <span className="font-normal text-muted">({rows.length})</span>
              </h2>
              <ul className="space-y-4">
                {rows.map((r) => {
                  const hasAllergy =
                    Boolean(r.allergies) && !/^none/i.test(r.allergies ?? "");
                  return (
                    <li
                      key={r.visit_id}
                      className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm"
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
                            · booked {formatTime(r.slot_start)} to{" "}
                            {formatTime(r.slot_end)}
                          </p>
                        </div>
                        <StatusBadge status={r.stage} />
                      </div>

                      <p className="text-sm text-muted">
                        Reason: {reasonLabel(r.visit_reason)}
                        {r.visit_note ? ` (${r.visit_note})` : ""}
                      </p>
                      <p
                        className={`text-sm ${hasAllergy ? "font-semibold text-amber-800" : "text-muted"}`}
                      >
                        Allergies: {r.allergies || "None listed"}
                      </p>

                      {r.vitals_recorded_at ? (
                        <VitalsSummary v={r} />
                      ) : r.skipped_reason ? (
                        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                          Going ahead without vitals. Reason: {r.skipped_reason}
                        </p>
                      ) : (
                        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
                          The nurse has not recorded vitals yet.
                        </p>
                      )}

                      <div className="flex flex-wrap items-start gap-3">
                        {r.stage === "ready" && (
                          <form action={startConsultation}>
                            <input type="hidden" name="id" value={r.visit_id} />
                            <SubmitButton pendingLabel="Starting...">
                              Start consultation
                            </SubmitButton>
                          </form>
                        )}
                        {r.stage === "in_consultation" && (
                          <form action={completeVisit}>
                            <input type="hidden" name="id" value={r.visit_id} />
                            <SubmitButton pendingLabel="Completing...">
                              Complete visit
                            </SubmitButton>
                          </form>
                        )}
                        {r.stage === "checked_in" && (
                          <details className="text-sm">
                            <summary className="cursor-pointer rounded-full border border-line px-4 py-2 font-semibold hover:bg-brand-50">
                              Go ahead without vitals
                            </summary>
                            <form
                              action={skipVitals}
                              className="mt-3 space-y-2"
                            >
                              <input
                                type="hidden"
                                name="id"
                                value={r.visit_id}
                              />
                              <label className="block font-medium">
                                <span className="mb-1 block">
                                  Why? (saved with the visit)
                                </span>
                                <textarea
                                  name="reason"
                                  required
                                  minLength={5}
                                  maxLength={300}
                                  rows={2}
                                  className={`${inputClass} block w-72 max-w-full`}
                                />
                              </label>
                              <SubmitButton
                                variant="secondary"
                                size="sm"
                                pendingLabel="Saving..."
                              >
                                Go ahead without vitals
                              </SubmitButton>
                            </form>
                          </details>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
