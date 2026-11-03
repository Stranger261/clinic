import RequestsList from "@/components/requests-list";

export default async function AdminRequests({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Reschedule requests</h1>
      <RequestsList returnTo="/admin/requests" error={error} notice={notice} />
    </>
  );
}
