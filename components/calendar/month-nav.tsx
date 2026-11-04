import Link from "next/link";
import { addMonths, formatMonth } from "@/lib/calendar";
import { buttonClass } from "@/constants";

// Previous / this month / next links that keep other URL choices (like the doctor) intact.
export default function MonthNav({
  basePath,
  extra = {},
  month,
  minMonth,
  maxMonth,
}: {
  basePath: string;
  extra?: Record<string, string>;
  month: string;
  minMonth: string;
  maxMonth: string;
}) {
  const href = (m: string) =>
    `${basePath}?${new URLSearchParams({ ...extra, month: m }).toString()}`;
  const disabled = `${buttonClass("secondary", "sm")} pointer-events-none opacity-40`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-2 text-lg font-semibold">{formatMonth(month)}</h2>
      {month > minMonth ? (
        <Link
          href={href(addMonths(month, -1))}
          className={buttonClass("secondary", "sm")}
        >
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          Previous
        </span>
      )}
      {month !== minMonth && (
        <Link href={href(minMonth)} className={buttonClass("ghost", "sm")}>
          This month
        </Link>
      )}
      {month < maxMonth ? (
        <Link
          href={href(addMonths(month, 1))}
          className={buttonClass("secondary", "sm")}
        >
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={disabled}>
          Next
        </span>
      )}
    </div>
  );
}
