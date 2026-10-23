import DepartmentsManager from "@/components/admin/DepartmentsManager";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Department, DepartmentUsage } from "@/lib/types";

export default async function DepartmentsPage() {
  const supabase = await getServerSupabase();
  const [deptRes, usageRes] = await Promise.all([
    supabase.from("departments").select("*").order("sort_order").order("name"),
    supabase.rpc("department_usage"),
  ]);
  const error = deptRes.error?.message || usageRes.error?.message || null;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">부서 관리</h1>
      <p className="mb-4 text-muted">예약할 때 고르는 &lsquo;사용 부서&rsquo; 목록입니다. 이름을 하나로 맞춰 두면 사용 통계가 정확해져요.</p>
      {error && <p className="card mb-3 bg-red-50 p-3 text-danger">{error}</p>}
      <DepartmentsManager departments={(deptRes.data ?? []) as Department[]} usage={(usageRes.data ?? []) as DepartmentUsage[]} />
    </div>
  );
}
