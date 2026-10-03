import ReservationManager from "@/components/admin/ReservationManager";
import { getServerSupabase } from "@/lib/supabase/server";
import { monthRange, toMonthKey, todayKey } from "@/lib/time";
import type { Reservation, Room } from "@/lib/types";

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const today = todayKey();
  const monthKey = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : toMonthKey(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : monthKey === today.slice(0, 7) ? today : `${monthKey}-01`;

  const supabase = await getServerSupabase();
  const { start, end } = monthRange(monthKey);
  const [roomsRes, resRes, adminsRes] = await Promise.all([
    supabase.from("rooms").select("*").order("sort_order").order("name"),
    supabase
      .from("reservations")
      .select("*")
      .lt("start_at", end.toISOString())
      .gt("end_at", start.toISOString())
      .order("start_at"),
    supabase.from("admins").select("user_id, login_id"),
  ]);

  const admins: Record<string, string> = {};
  for (const a of adminsRes.data ?? []) admins[a.user_id] = a.login_id;

  return (
    <ReservationManager
      rooms={(roomsRes.data ?? []) as Room[]}
      reservations={(resRes.data ?? []) as Reservation[]}
      admins={admins}
      monthKey={monthKey}
      initialDate={date}
      error={roomsRes.error?.message || resRes.error?.message || null}
    />
  );
}
