import { badges } from "@/constants/ui";

export function StatusBadge({ status }: { status: keyof typeof badges }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badges[status]}`}
    >
      {status}
    </span>
  );
}
