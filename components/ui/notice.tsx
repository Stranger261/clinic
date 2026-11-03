import { notices } from "@/constants/ui";

export const Notice = ({
  kind,
  children,
}: {
  kind: keyof typeof notices;
  children: React.ReactNode;
}) => {
  return (
    <p className={`rounded-xl p-3 text-sm ${notices[kind]}`}>{children}</p>
  );
};
