export default function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${live ? "bg-brand-500" : "bg-slate-300"}`}
      />
      {live ? "Live" : "Connecting..."}
    </span>
  );
}
