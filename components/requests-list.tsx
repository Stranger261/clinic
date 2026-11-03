import SubmitButton from "@/components/submit-button";
import { Card, EmptyState, Messages } from "@/components/ui";
import { buttonClass, inputClass } from "@/constants/ui";
import { approveReschedule, denyReschedule } from "@/lib/actions/reschedule";
import { formatDay, formatTime } from "@/lib/clinic";
import { createClient } from "@/lib/supabase/server";

type Request = {
  request_id: number;
  patient_name: string;
  doctor_name: string;
  old_start: string;
  old_end: string;
  new_start: string;
  new_end: string;
  reason_text: string;
};

export default async function RequestsList({
  returnTo,
  error,
  notice,
}: {
  returnTo: "/doctor/requests" | "/admin/requests";
  error?: string;
  notice?: string;
}) {
  const supabase = await createClient();
  // The database already limits this to requests the signed-in person may decide.
  const { data } = await supabase.rpc("pending_reschedule_requests");
  const requests = (data ?? []) as Request[];

  return (
    <>
      <Messages error={error} notice={notice} />

      {requests.length === 0 ? (
        <EmptyState>No pending reschedule requests.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => (
            <li key={r.request_id}>
              <Card>
                <p className="font-semibold">
                  {r.patient_name || "Patient"} with {r.doctor_name || "Doctor"}
                </p>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
                  <dt className="text-muted">Current time</dt>
                  <dd>
                    {formatDay(r.old_start)}, {formatTime(r.old_start)} to{" "}
                    {formatTime(r.old_end)}
                  </dd>
                  <dt className="text-muted">Requested time</dt>
                  <dd>
                    {formatDay(r.new_start)}, {formatTime(r.new_start)} to{" "}
                    {formatTime(r.new_end)} (held)
                  </dd>
                  <dt className="text-muted">Reason</dt>
                  <dd>{r.reason_text}</dd>
                </dl>

                <div className="mt-5 flex flex-wrap items-start gap-3">
                  <form action={approveReschedule}>
                    <input
                      type="hidden"
                      name="requestId"
                      value={r.request_id}
                    />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <SubmitButton size="sm" pendingLabel="Approving...">
                      Approve
                    </SubmitButton>
                  </form>

                  <details className="text-sm">
                    <summary
                      className={`${buttonClass("danger", "sm")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                    >
                      Deny
                    </summary>
                    <form action={denyReschedule} className="mt-3 space-y-2">
                      <input
                        type="hidden"
                        name="requestId"
                        value={r.request_id}
                      />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <textarea
                        name="note"
                        maxLength={300}
                        rows={2}
                        placeholder="Optional note for the patient"
                        className={`${inputClass} w-72 max-w-full`}
                      />
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        pendingLabel="Denying..."
                      >
                        Deny request
                      </SubmitButton>
                    </form>
                  </details>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
