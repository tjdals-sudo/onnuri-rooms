import { fmtDateTime, fmtRange } from "./time";
import { FLOOR_LABEL, type AuditLog, type Floor } from "./types";

export const ACTION_LABEL: Record<AuditLog["action"], string> = { insert: "등록", update: "수정", delete: "삭제" };
export const TABLE_LABEL: Record<AuditLog["target_table"], string> = { reservations: "예약", rooms: "장소" };

const RES_FIELDS: Record<string, string> = {
  room_id: "장소",
  title: "행사명",
  department: "사용 부서",
  contact_name: "담당자",
  contact_phone: "연락처",
  attendees: "예상 인원",
  start_at: "시작",
  end_at: "종료",
  memo: "메모",
};
const ROOM_FIELDS: Record<string, string> = {
  floor: "층",
  name: "장소명",
  capacity_text: "수용 인원",
  capacity_num: "수용 인원(숫자)",
  seating_type: "좌석 형태",
  note: "비고",
  sort_order: "정렬 순서",
  is_active: "사용 여부",
};

export type RoomNameMap = Map<string, { floor: Floor; name: string }>;

function fmtValue(table: AuditLog["target_table"], field: string, value: unknown, rooms: RoomNameMap): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "room_id") {
    const r = rooms.get(String(value));
    return r ? `${FLOOR_LABEL[r.floor]} ${r.name}` : String(value);
  }
  if (field === "start_at" || field === "end_at") return fmtDateTime(String(value));
  if (field === "is_active") return value ? "사용" : "숨김";
  return String(value);
}

export interface AuditChange {
  label: string;
  before: string;
  after: string;
}

export interface AuditSummary {
  actionLabel: string;
  tableLabel: string;
  /** 대상 한 줄 요약 (예: 3층 소망홀 · 10-05 10:00 ~ 12:00 · 청년부 예배) */
  target: string;
  changes: AuditChange[];
}

export function summarizeAudit(log: AuditLog, rooms: RoomNameMap): AuditSummary {
  const data = (log.after_data ?? log.before_data ?? {}) as Record<string, unknown>;
  const fields = log.target_table === "reservations" ? RES_FIELDS : ROOM_FIELDS;

  let target = "";
  if (log.target_table === "reservations") {
    const r = rooms.get(String(data.room_id));
    const place = r ? `${FLOOR_LABEL[r.floor]} ${r.name}` : "";
    const when = data.start_at && data.end_at ? `${fmtDateTime(String(data.start_at)).slice(0, 10)} ${fmtRange(String(data.start_at), String(data.end_at))}` : "";
    target = [place, when, data.title ? `'${data.title}'` : ""].filter(Boolean).join(" · ");
  } else {
    target = `${data.floor ? FLOOR_LABEL[data.floor as Floor] : ""} ${data.name ?? ""}`.trim();
  }

  const changes: AuditChange[] = [];
  if (log.action === "update" && log.before_data && log.after_data) {
    for (const [field, label] of Object.entries(fields)) {
      const b = log.before_data[field];
      const a = log.after_data[field];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        changes.push({ label, before: fmtValue(log.target_table, field, b, rooms), after: fmtValue(log.target_table, field, a, rooms) });
      }
    }
  } else if (log.action === "insert" && log.after_data) {
    for (const [field, label] of Object.entries(fields)) {
      const a = log.after_data[field];
      if (a !== null && a !== undefined && a !== "" && field !== "room_id") {
        changes.push({ label, before: "—", after: fmtValue(log.target_table, field, a, rooms) });
      }
    }
  } else if (log.action === "delete" && log.before_data) {
    for (const [field, label] of Object.entries(fields)) {
      const b = log.before_data[field];
      if (b !== null && b !== undefined && b !== "" && field !== "room_id") {
        changes.push({ label, before: fmtValue(log.target_table, field, b, rooms), after: "—" });
      }
    }
  }
  return { actionLabel: ACTION_LABEL[log.action], tableLabel: TABLE_LABEL[log.target_table], target, changes };
}
