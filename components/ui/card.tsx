import { liftClass } from "@/constants";

export function Card({
  children,
  className = "",
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${lift ? liftClass : ""} ${className}`}
    >
      {children}
    </div>
  );
}
