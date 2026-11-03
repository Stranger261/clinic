export const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
};
