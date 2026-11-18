"use client";

import { useState } from "react";
import SubmitButton from "@/components/submit-button";
import { inputClass } from "@/constants";
import { assignStaff } from "@/lib/actions/admin";

type Props = {
  patients: {
    id: string;
    full_name: string | null;
    email: string | null;
  }[];
  departments: {
    id: number;
    name: string;
  }[];
};

export default function AddStaffForm({ patients, departments }: Props) {
  const [selectedRole, setSelectedRole] = useState("");

  return (
    <form action={assignStaff} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">
        <span className="mb-1.5 block">User</span>
        <select name="profileId" required className={inputClass}>
          <option value="">Choose a user</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || "No name"} ({p.email ?? "no email"})
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-medium">
        <span className="mb-1.5 block">Role</span>
        <select
          name="role"
          required
          className={inputClass}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
        >
          <option value="">Choose a role</option>
          <option value="doctor">Doctor</option>
          <option value="nurse">Nurse</option>
          <option value="receptionist">Receptionist</option>
        </select>
      </label>

      {selectedRole === "doctor" && (
        <label className="text-sm font-medium">
          <span className="mb-1.5 block">Department</span>
          <select name="departmentId" className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <SubmitButton pendingLabel="Saving...">Add</SubmitButton>
    </form>
  );
}
