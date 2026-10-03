import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminNav from "@/components/admin/AdminNav";
import SyncBanner from "@/components/admin/SyncBanner";
import { isSheetsConfigured } from "@/lib/sheets";
import { getCurrentAdmin, getServerSupabase } from "@/lib/supabase/server";
import type { SheetSyncStatus } from "@/lib/types";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  const supabase = await getServerSupabase();
  const { data: statuses } = await supabase.from("sheet_sync_status").select("*").eq("status", "error");

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNav loginId={admin.loginId} />
      <SyncBanner errors={(statuses ?? []) as SheetSyncStatus[]} configured={isSheetsConfigured()} />
      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
