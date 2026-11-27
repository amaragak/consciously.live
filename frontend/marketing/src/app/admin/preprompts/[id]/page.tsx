import { AdminPrepromptsPanel } from "@/components/admin-preprompts-panel";

export const metadata = {
  title: "Admin — Pre-prompts",
};

/** Deep link for SPA handoff: /admin/preprompts/:id */
export default async function AdminPrepromptEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  return <AdminPrepromptsPanel />;
}
