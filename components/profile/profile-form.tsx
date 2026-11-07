"use client";

import { useActionState } from "react";
import SubmitButton from "@/components/submit-button";
import { Card, Notice } from "@/components/ui";
import { inputClass, ProfileState, SEX_OPTIONS } from "@/constants";
import { saveProfile } from "@/lib/actions/profile";

const input = `${inputClass} block w-full`;

const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-muted">
          {hint}
        </span>
      )}
    </label>
  );
};

export default function ProfileForm({
  initial,
  next,
  today,
}: {
  initial: Record<string, string>;
  next: string | null;
  today: string;
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(
    saveProfile,
    {},
  );
  // After a problem, show what the person typed; otherwise show what is saved.
  const v = (name: string) => state.values?.[name] ?? initial[name] ?? "";

  return (
    <form action={formAction} className="space-y-6">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <div role="alert">
          <Notice kind="error">{state.error}</Notice>
        </div>
      )}

      <Card className="space-y-4">
        <h2 className="font-semibold">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              name="fullName"
              required
              maxLength={100}
              autoComplete="name"
              defaultValue={v("fullName")}
              className={input}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              name="dateOfBirth"
              required
              max={today}
              autoComplete="bday"
              defaultValue={v("dateOfBirth")}
              className={input}
            />
          </Field>
          <Field label="Sex">
            <select
              name="sex"
              required
              defaultValue={v("sex")}
              className={input}
            >
              <option value="">Choose one</option>
              {Object.entries(SEX_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mobile number">
            <input
              type="tel"
              inputMode="tel"
              name="phone"
              required
              maxLength={30}
              autoComplete="tel"
              defaultValue={v("phone")}
              className={input}
            />
          </Field>
        </div>
        <Field label="Address">
          <textarea
            name="address"
            required
            rows={2}
            maxLength={200}
            autoComplete="street-address"
            defaultValue={v("address")}
            className={input}
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Emergency contact</h2>
          <p className="text-sm text-muted">
            Someone we can call if we cannot reach you. It must be a different
            number from yours.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <input
              name="emergencyName"
              required
              maxLength={100}
              defaultValue={v("emergencyName")}
              className={input}
            />
          </Field>
          <Field label="Contact number">
            <input
              type="tel"
              inputMode="tel"
              name="emergencyPhone"
              required
              maxLength={30}
              defaultValue={v("emergencyPhone")}
              className={input}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Health</h2>
        <Field
          label="Allergies (optional)"
          hint="Leave blank if none. Up to 300 characters."
        >
          <textarea
            name="allergies"
            rows={2}
            maxLength={300}
            defaultValue={v("allergies")}
            className={input}
          />
        </Field>
      </Card>

      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        This is a demo project. Please do not enter real personal or medical
        information.
      </p>

      <div className="sticky bottom-0 -mx-5 border-t border-line bg-canvas/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton className="w-full sm:w-auto" pendingLabel="Saving...">
          {next ? "Save and continue" : "Save profile"}
        </SubmitButton>
      </div>
    </form>
  );
}
