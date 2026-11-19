import SettingsView from "@/components/settings-view";

export const metadata = { title: "Settings" };

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  return (
    <SettingsView basePath="/admin/settings" searchParams={searchParams} />
  );
}
