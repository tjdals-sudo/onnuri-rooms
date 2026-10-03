/**
 * 구글 시트 · 엑셀 공용 데이터 (서버 전용)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeAudit, type RoomNameMap } from "./audit-format";
import { fmtDateTime, fmtTime, monthRange, toDateKey, weekdayKo } from "./time";
import type { AuditLog, Floor, Reservation, Room } from "./types";

export const SHEET_HEADERS = [
  "날짜", "요일", "시작", "종료", "층", "장소", "수용인원", "행사명", "부서", "담당자", "예상인원", "메모", "등록자", "최종 수정자", "최종 수정 일시",
] as const;

export const AUDIT_HEADERS = ["일시", "관리자", "작업", "대상", "내용", "변경 전", "변경 후"] as const;

export interface MonthRow {
  floor: Floor;
  values: string[];
}

export async function fetchRoomMap(sb: SupabaseClient): Promise<Map<string, Room>> {
  const { data, error } = await sb.from("rooms").select("*");
  if (error) throw new Error(error.message);
  return new Map((data as Room[]).map((r) => [r.id, r]));
}

export async function fetchAdminMap(sb: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await sb.from("admins").select("user_id, login_id");
  if (error) throw new Error(error.message);
  return new Map((data as { user_id: string; login_id: string }[]).map((a) => [a.user_id, a.login_id]));
}

/** 해당 월에 시작하는 예약 행 (날짜·시작 순) */
export async function fetchMonthRows(sb: SupabaseClient, monthKey: string): Promise<MonthRow[]> {
  const { start, end } = monthRange(monthKey);
  const [rooms, admins, res] = await Promise.all([
    fetchRoomMap(sb),
    fetchAdminMap(sb),
    sb.from("reservations").select("*").gte("start_at", start.toISOString()).lt("start_at", end.toISOString()).order("start_at"),
  ]);
  if (res.error) throw new Error(res.error.message);
  const rows: MonthRow[] = [];
  for (const r of res.data as Reservation[]) {
    const room = rooms.get(r.room_id);
    const sKey = toDateKey(r.start_at);
    const eKey = toDateKey(r.end_at);
    const endLabel = sKey === eKey ? fmtTime(r.end_at) : fmtTime(r.end_at) === "00:00" && toDateKey(new Date(new Date(r.end_at).getTime() - 60000)) === sKey ? "24:00" : `익일 ${fmtTime(r.end_at)}`;
    rows.push({
      floor: (room?.floor ?? "1F") as Floor,
      values: [
        sKey,
        weekdayKo(sKey),
        fmtTime(r.start_at),
        endLabel,
        room?.floor ?? "",
        room?.name ?? "(삭제된 장소)",
        room?.capacity_text ?? "",
        r.title,
        r.department,
        r.contact_name,
        r.attendees === null ? "" : String(r.attendees),
        r.memo,
        (r.created_by && admins.get(r.created_by)) || "",
        (r.updated_by && admins.get(r.updated_by)) || "",
        fmtDateTime(r.updated_at),
      ],
    });
  }
  return rows;
}

/** 변경 이력 전체 (최신순, 최대 5000건) */
export async function fetchAuditRows(sb: SupabaseClient): Promise<string[][]> {
  const [rooms, res] = await Promise.all([
    fetchRoomMap(sb),
    sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000),
  ]);
  if (res.error) throw new Error(res.error.message);
  const nameMap: RoomNameMap = new Map(Array.from(rooms.values()).map((r) => [r.id, { floor: r.floor, name: r.name }]));
  return (res.data as AuditLog[]).map((log) => {
    const s = summarizeAudit(log, nameMap);
    return [
      fmtDateTime(log.created_at),
      log.admin_login_id,
      `${s.tableLabel} ${s.actionLabel}`,
      s.target,
      s.changes.map((c) => c.label).join(", "),
      s.changes.map((c) => `${c.label}: ${c.before}`).join("\n"),
      s.changes.map((c) => `${c.label}: ${c.after}`).join("\n"),
    ];
  });
}
