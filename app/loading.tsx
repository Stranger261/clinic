// Shown while a page is loading. Soft placeholders feel calmer than a blank screen.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-5 py-10">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-brand-100" />
      <div className="mt-6 space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-brand-50" />
        <div className="h-20 animate-pulse rounded-2xl bg-brand-50" />
        <div className="h-20 animate-pulse rounded-2xl bg-brand-50" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
