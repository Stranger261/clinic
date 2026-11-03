import { Notice } from "@/components/ui/notice";

export const Messages = ({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) => {
  if (!error && !notice) return null;
  return (
    <div className="mb-6 space-y-2" role="status">
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="success">{notice}</Notice>}
    </div>
  );
};
