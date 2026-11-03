export const EmptyState = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 p-8 text-center text-muted">
      {children}
    </div>
  );
};
