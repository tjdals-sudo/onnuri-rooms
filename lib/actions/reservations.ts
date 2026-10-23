"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { syncAfterChange } from "@/lib/sheets";
import { fmtRange, toMonthKey } from "@/lib/time";
import { FLOOR_LABEL, type ActionResult, type ConflictInfo } from "@/lib/types";

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
  conflict_department: string | null;
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

/** 이 장소·시간과 겹치는 예약 전부 */
async function findConflictList(roomId: string, startIso: string, endIso: string, excludeId?: string): Promise<ConflictInfo[]> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("find_conflicts", {
    p_room_id: roomId,
    p_start: startIso,
    p_end: endIso,
    p_exclude_id: excludeId ?? null,
  });
  return (data ?? []) as ConflictInfo[];
}

/** "○층 ○○홀은 ○시~○시에 '행사명'(부서)으로 이미 예약되어 있습니다" */
function conflictText(c: ConflictInfo): string {
  const who = c.department ? `${c.department}의 '${c.title}'` : `'${c.title}'`;
  return `${FLOOR_LABEL[c.floor]} ${c.room_name}은 ${fmtRange(c.start_at, c.end_at)}에 ${who}으로 이미 예약되어 있습니다.`;
}

/** 겹침 실패 결과 — 겹치는 예약 목록을 함께 돌려줘 화면에서 팝업으로 보여 준다 */
function conflictResult(conflicts: ConflictInfo[], fallback = "같은 장소에 시간이 겹치는 예약이 있습니다."): { ok: false; error: string; conflict: true; conflicts: ConflictInfo[] } {
  return { ok: false, conflict: true, conflicts, error: conflicts.length > 0 ? conflictText(conflicts[0]) : fallback };
}

/** 저장 전에 미리 겹침 확인 (폼에서 시간·장소를 바꿀 때마다 호출) */
export async function checkConflicts(roomIds: string[], startIso: string, endIso: string, excludeId?: string): Promise<ActionResult<ConflictInfo[]>> {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return { ok: true, data: [] };
  const ids = Array.from(new Set(roomIds.filter(Boolean))).slice(0, 30);
  const lists = await Promise.all(ids.map((id) => findConflictList(id, startIso, endIso, excludeId)));
  return { ok: true, data: lists.flat() };
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
  const pre = await findConflictList(input.room_id, input.start_at, input.end_at);
  if (pre.length > 0) return conflictResult(pre);

  const { data, error } = await supabase
    .from("reservations")
    .insert({ ...input, title: input.title.trim() })
    .select("id")
    .single();
  if (error) {
    if (isOverlapError(error)) return conflictResult(await findConflictList(input.room_id, input.start_at, input.end_at));
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

  const pre = await findConflictList(input.room_id, input.start_at, input.end_at, id);
  if (pre.length > 0) return conflictResult(pre);

  const { error } = await supabase.from("reservations").update({ ...input, title: input.title.trim() }).eq("id", id);
  if (error) {
    if (isOverlapError(error)) return conflictResult(await findConflictList(input.room_id, input.start_at, input.end_at, id));
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

/** 같은 장소·시간을 여러 장소에 한 번에 등록 (수련회·절기 행사 등). 하나라도 겹치면 아무것도 등록하지 않는다 */
export async function createReservationsMulti(input: ReservationInput, roomIds: string[]): Promise<ActionResult<{ created: number }>> {
  const ids = Array.from(new Set(roomIds.filter(Boolean)));
  if (ids.length === 0) return { ok: false, error: "장소를 선택해 주세요." };
  if (ids.length > 30) return { ok: false, error: "한 번에 30곳까지 등록할 수 있습니다." };
  for (const roomId of ids) {
    const v = validate({ ...input, room_id: roomId });
    if (v) return { ok: false, error: v };
  }
  const supabase = await getServerSupabase();

  const pre = (await Promise.all(ids.map((roomId) => findConflictList(roomId, input.start_at, input.end_at)))).flat();
  if (pre.length > 0) {
    const r = conflictResult(pre);
    return { ...r, error: `${pre.map(conflictText).join(" ")} 겹치는 장소를 빼고 다시 등록해 주세요.` };
  }

  // 한 번의 insert 는 한 트랜잭션 — 그 사이 누가 먼저 잡으면 전부 취소된다
  const { data, error } = await supabase
    .from("reservations")
    .insert(ids.map((roomId) => ({ ...input, room_id: roomId, title: input.title.trim() })))
    .select("id");
  if (error) {
    if (isOverlapError(error)) {
      const now = (await Promise.all(ids.map((roomId) => findConflictList(roomId, input.start_at, input.end_at)))).flat();
      return conflictResult(now, "방금 다른 예약이 먼저 등록되어 겹치는 장소가 생겼습니다. 다시 확인해 주세요.");
    }
    return { ok: false, error: error.message };
  }
  queueSync([toMonthKey(input.start_at)]);
  return { ok: true, data: { created: data?.length ?? 0 } };
}

/** 주어진 시간에 이미 예약이 있는 장소 id (빈 장소 추천용) */
export async function findBusyRoomIds(startIso: string, endIso: string, excludeId?: string): Promise<ActionResult<string[]>> {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return { ok: false, error: "시간이 올바르지 않습니다." };
  const supabase = await getServerSupabase();
  let q = supabase.from("reservations").select("id, room_id").lt("start_at", e.toISOString()).gt("end_at", s.toISOString());
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: Array.from(new Set((data ?? []).map((r) => r.room_id as string))) };
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
