import RoomsManager from "@/components/admin/RoomsManager";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Room } from "@/lib/types";

export default async function RoomsPage() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("rooms").select("*").order("sort_order").order("name");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">장소 관리</h1>
      {error && <p className="card mb-3 bg-red-50 p-3 text-danger">{error.message}</p>}
      <RoomsManager rooms={(data ?? []) as Room[]} />
    </div>
  );
}
