import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { summarizeAudit, type RoomNameMap } from "@/lib/audit-format";
import { buildMonthWorkbook } from "@/lib/excel";
import { SHEET_HEADERS, fetchMonthRows } from "@/lib/report-data";
import { seoulToUtc } from "@/lib/time";
import type { AuditLog, Reservation, Room } from "@/lib/types";

/** 필터는 무시하고 테이블별로 정해 둔 행을 돌려주는 가짜 Supabase 클라이언트 */
function fakeSb(tables: Record<string, unknown[]>): SupabaseClient {
  const builder = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "gt", "order", "limit"]) q[m] = () => q;
    q.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
    return q;
  };
  return { from: (t: string) => builder(tables[t] ?? []) } as unknown as SupabaseClient;
}

const room: Room = {
  id: "r1", floor: "3F", name: "소망홀", capacity_text: "200명", capacity_num: 200, seating_type: "의자", note: "",
  sort_order: 0, is_active: true, created_at: "", updated_at: "",
};
const resv = (id: string, sd: string, st: string, ed: string, et: string, extra: Partial<Reservation> = {}): Reservation => ({
  id, room_id: "r1", title: `행사${id}`, department: "청년부", contact_name: "홍길동", contact_phone: "010", attendees: 30,
  start_at: seoulToUtc(sd, st).toISOString(), end_at: seoulToUtc(ed, et).toISOString(), memo: "", recurrence_group_id: null,
  created_by: "u1", updated_by: "u2", created_at: "", updated_at: "2026-10-01T00:00:00Z", ...extra,
});
const TABLES = {
  rooms: [room],
  admins: [{ user_id: "u1", login_id: "admin1" }, { user_id: "u2", login_id: "admin2" }],
  reservations: [
    resv("1", "2026-10-04", "10:00", "2026-10-04", "12:00"),
    resv("2", "2026-10-04", "22:00", "2026-10-05", "00:00"), // 자정에 끝남 → 24:00
    resv("3", "2026-10-10", "20:00", "2026-10-11", "02:00", { attendees: null }), // 자정 넘김 → 익일
  ],
};
const col = (h: (typeof SHEET_HEADERS)[number]) => SHEET_HEADERS.indexOf(h);

describe("시트·엑셀 월 행", () => {
  it("종료 시각 표시: 같은 날 / 24:00 / 익일", async () => {
    const rows = await fetchMonthRows(fakeSb(TABLES), "2026-10");
    expect(rows.map((r) => r.values[col("종료")])).toEqual(["12:00", "24:00", "익일 02:00"]);
    expect(rows[0].values[col("요일")]).toBe("일");
    expect(rows[0].values[col("장소")]).toBe("소망홀");
    expect(rows[0].values[col("등록자")]).toBe("admin1");
    expect(rows[0].values[col("최종 수정자")]).toBe("admin2");
    expect(rows[2].values[col("예상인원")]).toBe("");
    expect(rows.every((r) => r.values.length === SHEET_HEADERS.length)).toBe(true);
  });

  it("엑셀 파일: 헤더 + 행, 첫 행 고정", async () => {
    const buf = await buildMonthWorkbook(fakeSb(TABLES), "2026-10");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("2026-10")!;
    expect(ws.rowCount).toBe(4);
    expect(ws.getRow(1).getCell(1).value).toBe("날짜");
    expect(ws.getRow(2).getCell(col("행사명") + 1).value).toBe("행사1");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
});

describe("변경 이력 요약", () => {
  const rooms: RoomNameMap = new Map([["r1", { floor: "3F", name: "소망홀" }], ["r2", { floor: "1F", name: "누리홀" }]]);
  const base = resv("1", "2026-10-04", "10:00", "2026-10-04", "12:00");
  const log = (action: AuditLog["action"], before: object | null, after: object | null): AuditLog => ({
    id: 1, admin_id: null, admin_login_id: "admin1", action, target_table: "reservations", target_id: "1",
    before_data: before as AuditLog["before_data"], after_data: after as AuditLog["after_data"], created_at: "",
  });

  it("수정: 바뀐 칸만, 장소는 이름으로", () => {
    const s = summarizeAudit(log("update", base, { ...base, room_id: "r2", title: "바뀐 행사" }), rooms);
    expect(s.actionLabel).toBe("수정");
    expect(s.changes).toEqual([
      { label: "장소", before: "3층 소망홀", after: "1층 누리홀" },
      { label: "행사명", before: "행사1", after: "바뀐 행사" },
    ]);
    expect(s.target).toContain("1층 누리홀");
  });

  it("삭제: 빈 값과 장소 칸은 빼고 이전 값만", () => {
    const s = summarizeAudit(log("delete", base, null), rooms);
    expect(s.changes.every((c) => c.after === "—")).toBe(true);
    expect(s.changes.map((c) => c.label)).not.toContain("장소");
    expect(s.changes.map((c) => c.label)).not.toContain("메모");
    expect(s.target).toContain("'행사1'");
  });
});
