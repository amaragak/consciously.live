import { Outlet } from "react-router-dom";
import { AdminPageClient } from "@/components/admin-page-client";
import { AdminPasswordGate } from "@/components/admin-password-gate";

export function AdminLayout() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AdminPasswordGate>
        <AdminPageClient>
          <Outlet />
        </AdminPageClient>
      </AdminPasswordGate>
    </div>
  );
}
