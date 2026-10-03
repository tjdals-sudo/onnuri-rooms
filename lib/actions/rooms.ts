"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { syncAfterChange } from "@/lib/sheets";
import { toMonthKey } from "@/lib/time";
import { FLOORS, SEATING_TYPES, type ActionResult, type Floor, type SeatingType } from "@/lib/types";

export interface RoomInput {
  id?: string;
  floor: Floor;
  name: string;
  capacity_text: string;
  capacity_num: number | null;
  seating_type: SeatingType;
  note: string;
  sort_order: number;
  is_active: boolean;
}

export async function saveRoom(input: RoomInput): Promise<ActionResult<{ id: string }>> {
  if (!FLOORS.includes(input.floor)) return { ok: false, error: "층이 올바르지 않습니다." };
  if (!input.name.trim()) return { ok: false, error: "장소명을 입력해 주세요." };
  if (!SEATING_TYPES.includes(input.seating_type)) return { ok: false, error: "좌석 형태가 올바르지 않습니다." };

  const supabase = await getServerSupabase();
  const row = {
    floor: input.floor,
    name: input.name.trim(),
    capacity_text: input.capacity_text.trim(),
    capacity_num: input.capacity_num,
    seating_type: input.seating_type,
    note: input.note.trim(),
    sort_order: input.sort_order,
    is_active: input.is_active,
  };
  const q = input.id
    ? supabase.from("rooms").update(row).eq("id", input.id).select("id").single()
    : supabase.from("rooms").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) {
    if (error.code === "23505") return { ok: false, error: "같은 층에 같은 이름의 장소가 이미 있습니다." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  // 장소명·수용인원이 바뀌면 이번 달 시트에도 반영
  after(() => syncAfterChange([toMonthKey(new Date())]));
  return { ok: true, data: { id: data.id } };
}

export async function setRoomActive(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("rooms").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  after(() => syncAfterChange([toMonthKey(new Date())]));
  return { ok: true, data: undefined };
}
