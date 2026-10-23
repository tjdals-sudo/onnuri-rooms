"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { syncAfterChange } from "@/lib/sheets";
import { toMonthKey } from "@/lib/time";
import type { ActionResult, Department } from "@/lib/types";

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function refresh() {
  revalidatePath("/admin/departments");
  revalidatePath("/admin");
  revalidatePath("/admin/stats");
}

/** 목록에 부서 추가 (이미 있으면 그 부서를 돌려줌, 숨겨져 있으면 다시 사용) */
export async function addDepartment(rawName: string): Promise<ActionResult<Department>> {
  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "부서 이름을 입력해 주세요." };
  if (name.length > 40) return { ok: false, error: "부서 이름은 40자까지입니다." };
  const supabase = await getServerSupabase();
  const { data: existing } = await supabase.from("departments").select("*").eq("name", name).maybeSingle();
  if (existing) {
    if (!existing.is_active) await supabase.from("departments").update({ is_active: true }).eq("id", existing.id);
    refresh();
    return { ok: true, data: { ...(existing as Department), is_active: true } };
  }
  const { data: max } = await supabase.from("departments").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  // '기타'(1000)보다 앞에 오도록
  const next = Math.min(((max?.sort_order as number | undefined) ?? 0) + 10, 990);
  const { data, error } = await supabase.from("departments").insert({ name, sort_order: next }).select("*").single();
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: data as Department };
}

/**
 * 예약에 쓰인 부서 이름 from 을 to 로 일괄 변경 (오타 합치기·이름 바꾸기).
 * 변경 이력은 DB 트리거가 예약마다 남긴다.
 */
async function renameInReservations(from: string, to: string): Promise<ActionResult<{ count: number }>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("reservations").update({ department: to }).eq("department", from).select("start_at");
  if (error) return { ok: false, error: error.message };
  const months = Array.from(new Set((data ?? []).map((r) => toMonthKey(r.start_at as string))));
  if (months.length > 0) after(() => syncAfterChange(months));
  return { ok: true, data: { count: data?.length ?? 0 } };
}

/** 목록의 부서 수정. 이름이 바뀌면 그 이름으로 된 예약도 함께 바꾼다 */
export async function updateDepartment(
  id: string,
  patch: { name?: string; sort_order?: number; is_active?: boolean },
): Promise<ActionResult<{ renamed: number }>> {
  const supabase = await getServerSupabase();
  const { data: before } = await supabase.from("departments").select("*").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "부서를 찾을 수 없습니다." };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, error: "부서 이름을 입력해 주세요." };
    row.name = name;
  }
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  const { error } = await supabase.from("departments").update(row).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "같은 이름의 부서가 이미 있습니다. 합치려면 아래 '예약에 쓰인 부서 이름'에서 합치기를 쓰세요." };
    return { ok: false, error: error.message };
  }
  let renamed = 0;
  if (row.name && row.name !== before.name) {
    const r = await renameInReservations(before.name as string, row.name as string);
    if (!r.ok) return r;
    renamed = r.data.count;
  }
  refresh();
  return { ok: true, data: { renamed } };
}

/** 예약에 쓰인 이름(목록에 없거나 오타)을 목록의 부서로 합친다. to 가 빈 문자열이면 '부서 없음'으로 */
export async function mergeDepartmentName(from: string, to: string): Promise<ActionResult<{ count: number }>> {
  const target = cleanName(to);
  if (from === target) return { ok: false, error: "같은 이름입니다." };
  if (target) {
    const supabase = await getServerSupabase();
    const { data } = await supabase.from("departments").select("id").eq("name", target).maybeSingle();
    if (!data) return { ok: false, error: "목록에 있는 부서로만 합칠 수 있습니다." };
  }
  const r = await renameInReservations(from, target);
  if (r.ok) refresh();
  return r;
}
