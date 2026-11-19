"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/submit-button";
import { Notice } from "@/components/ui";
import { type VitalsState, recordVitals } from "@/lib/actions/vitals";
import { inputClass } from "@/constants";

const input = `${inputClass} block w-full`;

function Field({
  label,
  unit,
  children,
}: {
  label: string;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1 block">
        {label} <span className="font-normal text-muted">({unit})</span>
      </span>
      {children}
    </label>
  );
}

export default function VitalsForm({
  visitId,
  corrected = false,
}: {
  visitId: number;
  corrected?: boolean;
}) {
  const [state, formAction] = useActionState<VitalsState, FormData>(
    recordVitals,
    {},
  );
  const v = (name: string) => state.values?.[name] ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="visitId" value={visitId} />
      {state.error && (
        <div role="alert">
          <Notice kind="error">{state.error}</Notice>
        </div>
      )}
      {state.saved && (
        <div role="status">
          <Notice kind="success">
            Vitals saved. The patient is on the doctor&apos;s list.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Blood pressure, top" unit="mmHg">
          <input
            name="systolic"
            type="number"
            inputMode="numeric"
            required
            defaultValue={v("systolic")}
            className={input}
          />
        </Field>
        <Field label="Blood pressure, bottom" unit="mmHg">
          <input
            name="diastolic"
            type="number"
            inputMode="numeric"
            required
            defaultValue={v("diastolic")}
            className={input}
          />
        </Field>
        <Field label="Pulse" unit="per minute">
          <input
            name="pulse"
            type="number"
            inputMode="numeric"
            required
            defaultValue={v("pulse")}
            className={input}
          />
        </Field>
        <Field label="Temperature" unit="°C">
          <input
            name="temperature"
            type="number"
            inputMode="decimal"
            step="0.1"
            required
            defaultValue={v("temperature")}
            className={input}
          />
        </Field>
        <Field label="Breathing rate" unit="per minute">
          <input
            name="respRate"
            type="number"
            inputMode="numeric"
            required
            defaultValue={v("respRate")}
            className={input}
          />
        </Field>
        <Field label="Oxygen level" unit="%">
          <input
            name="spo2"
            type="number"
            inputMode="numeric"
            required
            defaultValue={v("spo2")}
            className={input}
          />
        </Field>
        <Field label="Weight" unit="kg">
          <input
            name="weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            required
            defaultValue={v("weight")}
            className={input}
          />
        </Field>
        <Field label="Height" unit="cm">
          <input
            name="height"
            type="number"
            inputMode="decimal"
            step="0.1"
            required
            defaultValue={v("height")}
            className={input}
          />
        </Field>
        <Field label="Pain score" unit="0 to 10">
          <input
            name="pain"
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            required
            defaultValue={v("pain")}
            className={input}
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving...">
        {corrected ? "Save corrected vitals" : "Save vitals and send to doctor"}
      </SubmitButton>
    </form>
  );
}
