export type Variant = "primary" | "secondary" | "ghost" | "danger";
export type Size = "md" | "sm" | "xs";

export const base =
  "inline-flex items-center justify-center rounded-full font-semibold transition disabled:opacity-50";
const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-sm",
  sm: "min-h-10 px-4 text-sm sm:min-h-9",
  xs: "min-h-8 px-2.5 text-xs",
};
export const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-line bg-surface text-ink hover:bg-brand-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md") =>
  `${base} ${sizes[size]} ${variants[variant]}`;

export const inputClass =
  "min-h-11 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink focus-visible:border-brand-500 sm:text-sm";

export const notices = {
  error: "bg-red-50 text-red-800",
  success: "bg-brand-50 text-brand-800",
  info: "bg-amber-50 text-amber-900",
} as const;

export const badges = {
  open: "bg-brand-100 text-brand-800",
  booked: "bg-sky-100 text-sky-800",
  confirmed: "bg-sky-100 text-sky-800",
  held: "bg-amber-100 text-amber-900",
  blocked: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
} as const;

export const liftClass =
  "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/10 motion-reduce:hover:translate-y-0";
