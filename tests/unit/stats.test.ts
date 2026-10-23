import { describe, expect, it } from "vitest";
import { NO_DEPARTMENT, computeMonthStats, fmtHours } from "@/lib/stats";
import { seoulToUtc } from "@/lib/time";
import type { Floor, Room } from "@/lib/types";

const mk = (id: string, floor: Floor, active = true): Room => ({
  id, floor, name: id, capacity_text: "", capacity_num: null, seating_type: "의자", note: "",
  sort_order: 0, is_active: active, created_at: "", updated_at: "",
});
const res = (room_id: string, department: string, sd: string, st: string, ed: string, et: string) => ({
  room_id, department, start_at: seoulToUtc(sd, st).toISOString(), end_at: seoulToUtc(ed, et).toISOString(),
});

describe("월별 사용 통계", () => {
  const rooms = [mk("a", "1F"), mk("b", "3F"), mk("old", "4F", false)];

  it("장소·부서·요일별로 시간을 합친다", () => {
    const s = computeMonthStats(rooms, [
      res("a", "청년부", "2026-10-04", "09:00", "2026-10-04", "12:00"), // 일 3h
      res("a", "청년부", "2026-10-05", "19:00", "2026-10-05", "21:00"), // 월 2h
      res("b", " ", "2026-10-04", "13:00", "2026-10-04", "14:30"), // 일 1.5h, 부서 없음
    ], "2026-10");
    expect(s.totalCount).toBe(3);
    expect(s.totalHours).toBe(6.5);
    expect(s.rooms.map((r) => [r.roomId, r.hours, r.count])).toEqual([["a", 5, 2], ["b", 1.5, 1]]);
    expect(s.departments).toEqual([
      { department: "청년부", count: 2, hours: 5 },
      { department: NO_DEPARTMENT, count: 1, hours: 1.5 },
    ]);
    expect(s.departmentCount).toBe(1);
    expect(s.weekdayHours).toEqual([4.5, 2, 0, 0, 0, 0, 0]);
    // 10월 31일 × 18시간 = 558시간
    expect(s.rooms[0].utilization).toBeCloseTo(5 / 558);
  });

  it("월을 걸친 예약은 이 달 안의 시간만 센다", () => {
    const s = computeMonthStats(rooms, [res("a", "수련회", "2026-10-31", "20:00", "2026-11-01", "10:00")], "2026-10");
    expect(s.totalHours).toBe(4);
    expect(s.weekdayHours[6]).toBe(4); // 10/31 토
    const nov = computeMonthStats(rooms, [res("a", "수련회", "2026-10-31", "20:00", "2026-11-01", "10:00")], "2026-11");
    expect(nov.totalHours).toBe(10);
    expect(nov.weekdayHours[0]).toBe(10); // 11/1 일
  });

  it("숨긴 장소는 그 달 예약이 있을 때만 보인다", () => {
    expect(computeMonthStats(rooms, [], "2026-10").rooms.map((r) => r.roomId)).toEqual(["a", "b"]);
    const s = computeMonthStats(rooms, [res("old", "", "2026-10-10", "10:00", "2026-10-10", "11:00")], "2026-10");
    expect(s.rooms.map((r) => r.roomId)).toContain("old");
  });

  it("시간 표시", () => {
    expect(fmtHours(3)).toBe("3시간");
    expect(fmtHours(1.25)).toBe("1.3시간");
  });
});
