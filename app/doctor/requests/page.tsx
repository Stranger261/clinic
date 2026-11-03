import RequestsList from "@/components/requests-list";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Reschedule requests" };

export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  return (
    <>
      <PageHeader title="Reschedule requests" subtitle="Patients asking to move a visit inside the 24-hour window." />
      <RequestsList returnTo="/doctor/requests" error={error} notice={notice} />
    </>
  );
}
