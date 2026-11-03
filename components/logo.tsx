import { BRAND } from "@/lib/brand";

export default function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      {BRAND.name}
    </span>
  );
}
