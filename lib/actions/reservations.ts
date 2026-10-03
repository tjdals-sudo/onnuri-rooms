"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { syncAfterChange } from "@/lib/sheets";
import { fmtRange, toMonthKey } from "@/lib/time";
import { FLOOR_LABEL, type ActionResult, type Floor } from "@/lib/types";

export interface ReservationInput {
  room_id: string;
  title: string;
  department: string;
  contact_name: string;
  contact_phone: string;
  attendees: number | null;
  start_at: string; // ISO (UTC)
  end_at: string;
  memo: string;
}

export interface PreviewRow {
  seq: number;
  start_at: string;
  end_at: string;
  conflict_id: string | null;
  conflict_title: string | null;
  conflict_start: string | null;
  conflict_end: string | null;
}

function validate(input: ReservationInput): string | null {
  if (!input.room_id) return "장소를 선택해 주세요.";
  if (!input.title.trim()) return "행사명을 입력해 주세요.";
  const s = new Date(input.start_at);
  const e = new Date(input.end_at);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "시작/종료 일시가 올바르지 않습니다.";
  if (e <= s) return "종료 시각은 시작 시각보다 뒤여야 합니다.";
  if (e.getTime() - s.getTime() > 7 * 24 * 3600 * 1000) return "한 예약은 7일을 넘길 수 없습니다.";
  if (input.attendees !== null && (input.attendees < 0 || !Number.isInteger(input.attendees))) return "예상 인원이 올바르지 않습니다.";
  return null;
}

/** "○층 ○○홀은 ○시~○시에 '행사명'으로 이미 예약되어 있습니다" */
async function conflictMessage(roomId: string, startIso: string, endIso: string, excludeId?: string): Promise<string> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("find_conflicts", {
    p_room_id: roomId,
    p_start: startIso,
    p_end: endIso,
    p_exclude_id: excludeId ?? null,
  });
  const c = (data ?? [])[0] as
    | { title: string; start_at: string; end_at: string; floor: Floor; room_name: string }
    | undefined;
  if (!c) return "같은 장소에 시간이 겹치는 예약이 있습니다.";
  return `${FLOOR_LABEL[c.floor]} ${c.room_name}은 ${fmtRange(c.start_at, c.end_at)}에 '${c.title}'으로 이미 예약되어 있습니다.`;
}

function isOverlapError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23P01" || /reservations_no_overlap/.test(error?.message ?? "");
}

function queueSync(months: string[]) {
  const uniq = Array.from(new Set(months));
  after(() => syncAfterChange(uniq));
  revalidatePath("/admin");
}

export async function createReservation(input: ReservationInput): Promise<ActionResult<{ id: string }>> {
  const v = validate(input);
  if (v) return { ok: false, error: v };
  const supabase = await getServerSupabase();

  // 친절한 메시지를 위해 먼저 조회하고, 최종 차단은 DB EXCLUDE 제약이 맡는다
  const pre = await supabase.rpc("find_conflicts", { p_room_id: input.room_id, p_start: input.start_at, p_end: input.end_at, p_exclude_id: null });
  if ((pre.data ?? []).length > 0) return { ok: false, error: await conflictMessage(input.room_id, input.start_at, input.end_at) };

  const { data, error } = await supabase
    .from("reservations")
    .insert({ ...input, title: input.title.trim() })
    .select("id")
    .single();
  if (error) {
    if (isOverlapError(error)) return { ok: false, error: await conflictMessage(input.room_id, input.start_at, input.end_at) };
    return { ok: false, error: error.message };
  }
  queueSync([toMonthKey(input.start_at)]);
  return { ok: true, data: { id: data.id } };
}

export async function updateReservation(
  id: string,
  input: ReservationInput,
  scope: "one" | "following",
): Promise<ActionResult<{ count: number }>> {
  const v = validate(input);
  if (v) return { ok: false, error: v };
  const supabase = await getServerSupabase();

  const { data: before } = await supabase.from("reservations").select("start_at, recurrence_group_id").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "예약을 찾을 수 없습니다." };

  if (scope === "following" && before.recurrence_group_id) {
    const { data, error } = await supabase.rpc("update_recurring_from", {
      p_id: id,
      p_title: input.title.trim(),
      p_department: input.department,
      p_contact_name: input.contact_name,
      p_contact_phone: input.contact_phone,
      p_attendees: input.attendees,
      p_memo: input.memo,
      p_start: input.start_at,
      p_end: input.end_at,
    });
    if (error) {
      if (isOverlapError(error)) return { ok: false, error: "이후 회차 중 다른 예약과 겹치는 날이 있어 변경하지 못했습니다. 해당 회차를 개별로 수정해 주세요." };
      return { ok: false, error: error.message };
    }
    // 영향받는 월: 기준 회차부터 최대 2년 → 기준월 이후 모든 월 탭을 다시 쓰기엔 많으므로 실제 변경된 행의 월을 조회
    const { data: rows } = await supabase
      .from("reservations")
      .select("start_at")
      .eq("recurrence_group_id", before.recurrence_group_id)
      .gte("start_at", input.start_at < before.start_at ? input.start_at : before.start_at);
    queueSync([toMonthKey(before.start_at), toMonthKey(input.start_at), ...(rows ?? []).map((r) => toMonthKey(r.start_at))]);
    return { ok: true, data: { count: (data as number) ?? 0 } };
  }

  const pre = await supabase.rpc("find_conflicts", { p_room_id: input.room_id, p_start: input.start_at, p_end: input.end_at, p_exclude_id: id });
  if ((pre.data ?? []).length > 0) return { ok: false, error: await conflictMessage(input.room_id, input.start_at, input.end_at, id) };

  const { error } = await supabase.from("reservations").update({ ...input, title: input.title.trim() }).eq("id", id);
  if (error) {
    if (isOverlapError(error)) return { ok: false, error: await conflictMessage(input.room_id, input.start_at, input.end_at, id) };
    return { ok: false, error: error.message };
  }
  queueSync([toMonthKey(before.start_at), toMonthKey(input.start_at)]);
  return { ok: true, data: { count: 1 } };
}

export async function deleteReservation(id: string, scope: "one" | "following"): Promise<ActionResult<{ count: number }>> {
  const supabase = await getServerSupabase();
  const { data: before } = await supabase.from("reservations").select("start_at, recurrence_group_id").eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "예약을 찾을 수 없습니다." };

  if (scope === "following" && before.recurrence_group_id) {
    const { data: rows } = await supabase
      .from("reservations")
      .select("start_at")
      .eq("recurrence_group_id", before.recurrence_group_id)
      .gte("start_at", before.start_at);
    const { data, error } = await supabase.rpc("delete_recurring_from", { p_id: id });
    if (error) return { ok: false, error: error.message };
    queueSync((rows ?? []).map((r) => toMonthKey(r.start_at)));
    return { ok: true, data: { count: (data as number) ?? 0 } };
  }

  const { error } = await supabase.from("reservations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  queueSync([toMonthKey(before.start_at)]);
  return { ok: true, data: { count: 1 } };
}

/** 반복 예약 충돌 미리보기 */
export async function previewRecurring(roomId: string, startIso: string, endIso: string, count: number): Promise<ActionResult<PreviewRow[]>> {
  if (count < 1 || count > 104) return { ok: false, error: "반복 횟수는 1~104회 사이여야 합니다." };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("preview_recurring", { p_room_id: roomId, p_start: startIso, p_end: endIso, p_count: count });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PreviewRow[] };
}

/** 반복 예약 일괄 등록 */
export async function createRecurring(
  input: ReservationInput,
  count: number,
  skipConflicts: boolean,
): Promise<ActionResult<{ created: number; skipped: number[]; groupId: string }>> {
  const v = validate(input);
  if (v) return { ok: false, error: v };
  if (count < 1 || count > 104) return { ok: false, error: "반복 횟수는 1~104회 사이여야 합니다." };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("create_recurring", {
    p_room_id: input.room_id,
    p_title: input.title.trim(),
    p_department: input.department,
    p_contact_name: input.contact_name,
    p_contact_phone: input.contact_phone,
    p_attendees: input.attendees,
    p_memo: input.memo,
    p_start: input.start_at,
    p_end: input.end_at,
    p_count: count,
    p_skip_conflicts: skipConflicts,
  });
  if (error) {
    if (isOverlapError(error)) return { ok: false, error: "충돌하는 회차가 있어 등록하지 못했습니다. 미리보기에서 충돌 날짜를 확인해 주세요." };
    return { ok: false, error: error.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { created_ids: string[]; skipped_seqs: number[]; group_id: string };
  const months: string[] = [];
  const s = new Date(input.start_at);
  for (let i = 0; i < count; i++) months.push(toMonthKey(new Date(s.getTime() + i * 7 * 24 * 3600 * 1000)));
  queueSync(months);
  return { ok: true, data: { created: row.created_ids?.length ?? 0, skipped: row.skipped_seqs ?? [], groupId: row.group_id } };
}
